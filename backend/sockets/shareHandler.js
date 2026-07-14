/**
 * shareHandler.js — "Nearby Share" signaling + fallback relay
 *
 * This module adds device-to-device local file sharing on top of the
 * existing authenticated Socket.IO connection (setupSockets() in
 * socketHandler.js already verifies the JWT before a socket reaches here).
 *
 * Responsibilities (server never touches file bytes for storage — it only
 * ever forwards them in-memory, chunk by chunk, when relay fallback is used):
 *
 *   1. Discovery      — every authenticated device connected to this server
 *      instance is treated as "nearby" and broadcast to every other device
 *      (subnet-based grouping was tried and dropped — it broke across
 *      localhost vs. LAN-IP sessions, IPv4/IPv6 dual-stack clients, and
 *      networks larger than a /24; a single shared room avoids all three)
 *   2. WebRTC signaling — relay offer/answer/ICE candidates between two peers
 *   3. Relay fallback  — when a direct WebRTC data channel can't be
 *      established (strict router/firewall), pass file chunks straight
 *      through from sender-socket -> receiver-socket with zero disk I/O
 *      and zero buffering (each chunk is forwarded the instant it arrives).
 *
 * Resumability lives on the CLIENT (offset + chunk index tracked in
 * IndexedDB). The server stays completely stateless about transfer
 * progress — it's just a dumb, fast pipe. This keeps the DB change minimal
 * (a single audit-log table) and means a server restart can't corrupt an
 * in-flight transfer's resume state.
 */

// socketId -> { userId, deviceName, platform }
const devices = new Map();
const LAN_ROOM = 'lan:all'; // every authenticated device on this server is "nearby" — see note below

function publicDeviceList(excludeSocketId) {
  const list = [];
  for (const [socketId, d] of devices) {
    if (socketId === excludeSocketId) continue;
    list.push({ socketId, userId: d.userId, deviceName: d.deviceName, platform: d.platform });
  }
  return list;
}

function broadcastPeers(io) {
  for (const socketId of io.sockets.adapter.rooms.get(LAN_ROOM) || []) {
    io.to(socketId).emit('share:peers', publicDeviceList(socketId));
  }
}

const setupShareSockets = (io) => {
  io.on('connection', (socket) => {
    // ── Announce presence on the local network ──────────────────────────
    socket.on('share:hello', ({ deviceName, platform } = {}) => {
  devices.set(socket.id, {
    userId: socket.user.user_id,
    deviceName: deviceName || `${socket.user.user_id}'s device`,
    platform: platform || 'unknown',
  });
  socket.join(LAN_ROOM);
  socket.emit('share:peers', publicDeviceList(socket.id));
  broadcastPeers(io);
});

    // ── WebRTC signaling relay (offer / answer / ICE candidates) ────────
    // payload: { to: targetSocketId, data: {...} }
    socket.on('share:signal', ({ to, data } = {}) => {
      if (!to || !devices.has(to)) return;
      io.to(to).emit('share:signal', { from: socket.id, data });
    });

    // ── Incoming transfer request (shown before WebRTC even connects) ───
    // payload: { to, transferId, fileName, fileSize, mimeType }
    socket.on('share:request', (payload = {}) => {
      const { to } = payload;
      if (!to || !devices.has(to)) return;
      const sender = devices.get(socket.id);
      io.to(to).emit('share:request', {
        ...payload,
        from: socket.id,
        fromDeviceName: sender?.deviceName || 'Unknown device',
      });
    });

    socket.on('share:response', ({ to, transferId, accepted } = {}) => {
      if (!to || !devices.has(to)) return;
      io.to(to).emit('share:response', { from: socket.id, transferId, accepted });
    });

    // ── Relay fallback: zero-storage pass-through chunk forwarding ──────
    // Used only when a direct WebRTC data channel fails to open in time.
    // Every event is forwarded immediately and never written to disk/DB.
    socket.on('share:relay-chunk', ({ to, transferId, seq, chunk } = {}) => {
      if (!to || !devices.has(to)) return;
      io.to(to).emit('share:relay-chunk', { from: socket.id, transferId, seq, chunk });
    });

    socket.on('share:relay-ack', ({ to, transferId, ackedSeq } = {}) => {
      if (!to || !devices.has(to)) return;
      io.to(to).emit('share:relay-ack', { from: socket.id, transferId, ackedSeq });
    });

    socket.on('share:relay-end', ({ to, transferId, checksum } = {}) => {
      if (!to || !devices.has(to)) return;
      io.to(to).emit('share:relay-end', { from: socket.id, transferId, checksum });
    });

    socket.on('share:cancel', ({ to, transferId, reason } = {}) => {
      if (!to || !devices.has(to)) return;
      io.to(to).emit('share:cancel', { from: socket.id, transferId, reason });
    });

    // ── Cleanup ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const d = devices.get(socket.id);
      if (!d) return;
      devices.delete(socket.id);
      broadcastPeers(io);
    });
  });
};

module.exports = { setupShareSockets };