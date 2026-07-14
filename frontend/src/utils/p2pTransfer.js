/**
 * p2pTransfer.js — Nearby Share transfer engine
 *
 * One class, two roles ('sender' / 'receiver'). Handles:
 *
 *  • Transport: tries a direct WebRTC RTCDataChannel first (true device-to-
 *    device, zero server bytes). If it doesn't open within RTC_TIMEOUT_MS,
 *    silently falls back to the Socket.IO relay (server forwards chunks
 *    in-memory, never to disk/DB) — same chunk/ack protocol either way.
 *  • Resilience: every chunk is numbered. The receiver periodically acks
 *    the highest fully-received chunk. If the transport drops, the engine
 *    reconnects (new RTCPeerConnection, or waits for socket.io's own
 *    auto-reconnect) and resumes sending from the receiver's last acked
 *    offset — never from zero.
 *  • Integrity: both sides hash the stream incrementally (SHA-256 via
 *    hash-wasm). The sender sends its final digest; the receiver compares
 *    it against its own before declaring success. Chunks are hashed
 *    synchronously in arrival order (before any async write), and the
 *    actual write/blob-append work is chained through a private queue so
 *    concurrent chunk writes can never race or land out of order.
 *  • Zero-storage: sender reads the file in slices on demand; receiver
 *    streams straight to disk via the File System Access API when
 *    available, falling back to an in-memory Blob assembly otherwise.
 *    Nothing is ever written to server disk or the database — the DB is
 *    only touched once, at the very end, to log a one-row audit entry.
 */

import { createSHA256 } from 'hash-wasm';
import { saveTransferState, getTransferState, deleteTransferState } from './transferStore';

export const CHUNK_SIZE = 64 * 1024; // 64KB — comfortable for both RTCDataChannel and socket.io
const BUFFERED_AMOUNT_HIGH = 8 * 1024 * 1024; // pause sending above 8MB buffered (backpressure)
const BUFFERED_AMOUNT_LOW = 1 * 1024 * 1024;
const RTC_TIMEOUT_MS = 6000; // how long to wait for the data channel before falling back to relay
const MAX_RECONNECT_ATTEMPTS = 30; // ~ a couple of minutes of retrying a flaky connection
const ACK_THROTTLE_MS = 250;
const PERSIST_THROTTLE_BYTES = 1024 * 1024; // save resume offset to IndexedDB every ~1MB
const RELAY_WINDOW_CHUNKS = 64; // ~4MB in flight at 64KB chunks before pausing for acks

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ShareTransfer extends EventTarget {
  /**
   * @param {object} opts
   * @param {import('socket.io-client').Socket} opts.socket
   * @param {'sender'|'receiver'} opts.role
   * @param {string} opts.transferId
   * @param {string} opts.peerSocketId
   * @param {File}   [opts.file]       required for role 'sender'
   * @param {object} [opts.meta]       { fileName, fileSize, mimeType } — required for role 'receiver'
   */
  constructor({ socket, role, transferId, peerSocketId, file = null, meta = null }) {
    super();
    this.socket = socket;
    this.role = role;
    this.transferId = transferId;
    this.peerSocketId = peerSocketId;
    this.file = file;
    this.meta = meta || (file ? { fileName: file.name, fileSize: file.size, mimeType: file.type } : null);

    this.status = 'idle';
    this.bytesDone = 0;
    this.method = null; // 'p2p' | 'relay'
    this.cancelled = false;

    this._pc = null;
    this._dc = null;
    this._usingRelay = false;
    this._lastAckedSeq = -1;
    this._lastSentSeq = -1; // tracks highest seq handed to the transport, for relay windowing
    this._expectedSeq = 0;
    this._writable = null; // FileSystemWritableFileStream, if available
    this._blobParts = []; // fallback in-memory assembly
    this._lastPersistBytes = 0;
    this._lastAckSentAt = 0;
    this._writeQueue = Promise.resolve(); // serializes chunk writes so they can never overlap/race
    this._initReady = null; // receiver only: resolves once the save-file dialog is settled

    this._bindRelayListeners();
  }

  _setStatus(status, extra = {}) {
    this.status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: { status, ...extra } }));
  }

  _progress() {
    this.dispatchEvent(
      new CustomEvent('progress', {
        detail: { bytesDone: this.bytesDone, totalBytes: this.meta.fileSize, method: this.method },
      })
    );
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async start() {
    if (this.role === 'sender') return this._runSender();
    return this._runReceiver();
  }

  cancel(reason = 'cancelled by user') {
    this.cancelled = true;
    this._emit('share:cancel', { to: this.peerSocketId, transferId: this.transferId, reason });
    this._teardownTransport();
    this._setStatus('cancelled', { reason });
  }

  // ── Transport setup (shared by both roles) ──────────────────────────────

  _emit(event, payload) {
    this.socket.emit(event, payload);
  }

  async _establishTransport() {
    this._setStatus('connecting');
    try {
      await this._tryWebRTC();
      this.method = 'p2p';
      this._usingRelay = false;
    } catch (err) {
      if (this.cancelled) throw err;
      this.method = 'relay';
      this._usingRelay = true;
      this._setStatus('connecting-relay');
      // Relay needs no handshake beyond the socket itself already being connected.
    }
    this._setStatus(this.method === 'p2p' ? 'transferring' : 'transferring-relay');
  }

  _tryWebRTC() {
    return new Promise((resolve, reject) => {
      const pc = new RTCPeerConnection({ iceServers: [] }); // LAN-only: no STUN/TURN needed
      this._pc = pc;
      let settled = false;
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket.off('share:signal', onSignal);
        fn(arg);
      };

      const timer = setTimeout(() => finish(reject, new Error('WebRTC handshake timed out')), RTC_TIMEOUT_MS);

      const onSignal = ({ from, data }) => {
        if (from !== this.peerSocketId) return;
        this._handleSignal(data).catch(() => {});
      };
      this.socket.on('share:signal', onSignal);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this._emit('share:signal', {
            to: this.peerSocketId,
            data: { kind: 'ice', candidate: e.candidate },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (this.status === 'transferring') this._handleTransportDrop();
        }
      };

      const setupChannel = (dc) => {
        this._dc = dc;
        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW;
        dc.onopen = () => finish(resolve);
        dc.onclose = () => {
          if (!this.cancelled && this.status.startsWith('transferring')) this._handleTransportDrop();
        };
        dc.onmessage = (e) => this._onData(e.data);
      };

      if (this.role === 'sender') {
        const dc = pc.createDataChannel('file', { ordered: true });
        setupChannel(dc);
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            this._emit('share:signal', {
              to: this.peerSocketId,
              data: { kind: 'offer', sdp: pc.localDescription },
            });
          })
          .catch((err) => finish(reject, err));
      } else {
        pc.ondatachannel = (e) => setupChannel(e.channel);
        // Receiver waits passively for the offer via onSignal -> _handleSignal, which creates the answer.
      }

      this._pendingIceQueue = [];
    });
  }

  async _handleSignal(data) {
    const pc = this._pc;
    if (!pc) return;
    if (data.kind === 'offer') {
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this._emit('share:signal', { to: this.peerSocketId, data: { kind: 'answer', sdp: pc.localDescription } });
    } else if (data.kind === 'answer') {
      await pc.setRemoteDescription(data.sdp);
    } else if (data.kind === 'ice' && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch {
        /* benign — candidate arrived before remote description */
      }
    }
  }

  _teardownTransport() {
    if (this._dc) {
      this._dc.onclose = null;
      try { this._dc.close(); } catch {}
    }
    if (this._pc) {
      try { this._pc.close(); } catch {}
    }
    this._dc = null;
    this._pc = null;
  }

  // ── Reconnect / resume-from-drop logic ──────────────────────────────────

  async _handleTransportDrop() {
    if (this.cancelled || this.status === 'complete' || this.status === 'failed') return;
    this._setStatus('paused-reconnecting');
    this._teardownTransport();

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (this.cancelled) return;
      const backoff = Math.min(1500 * attempt, 8000);
      await delay(backoff);
      try {
        if (this._usingRelay) {
          // Socket.IO reconnects itself; just confirm it's back.
          if (!this.socket.connected) continue;
        } else {
          await this._tryWebRTC();
        }
        this._setStatus(this._usingRelay ? 'transferring-relay' : 'transferring');
        if (this.role === 'sender') this._resendFromLastAck();
        return;
      } catch {
        // fall through to relay after enough failed WebRTC attempts
        if (!this._usingRelay && attempt >= 3) {
          this._usingRelay = true;
          this.method = 'relay';
        }
      }
    }
    this._setStatus('failed', { reason: 'connection could not be re-established' });
  }

  // ── Sender ───────────────────────────────────────────────────────────────

  async _runSender() {
    this._setStatus('waiting-for-acceptance');
    this._emit('share:request', {
      to: this.peerSocketId,
      transferId: this.transferId,
      fileName: this.meta.fileName,
      fileSize: this.meta.fileSize,
      mimeType: this.meta.mimeType,
    });

    const accepted = await this._awaitResponse();
    if (!accepted) return this._setStatus('rejected');

    await this._establishTransport();

    // Resume support: ask the receiver where it left off (0 for a fresh transfer).
    const resumeOffset = await this._queryResumeOffset();
    this._hasher = await createSHA256();
    this.bytesDone = 0;

    if (resumeOffset > 0) {
      // Re-hash the already-sent prefix so the final digest still covers the whole file.
      await this._rehashPrefix(resumeOffset);
    }

    this._expectedSeq = Math.floor(resumeOffset / CHUNK_SIZE);
    this._lastSentSeq = this._expectedSeq - 1;
    await this._sendFrom(resumeOffset);

    if (this.cancelled || this.status === 'failed') return;

    const checksum = this._hasher.digest('hex');
    await this._sendControl({ type: 'final', checksum, totalBytes: this.meta.fileSize });
    this._setStatus('verifying');

    const verified = await this._awaitVerification();
    this._setStatus(verified ? 'complete' : 'failed', verified ? {} : { reason: 'checksum mismatch' });
    await deleteTransferState(this.transferId);
    this._logTransfer(checksum, verified ? 'completed' : 'failed');
    this._teardownTransport();
  }

  async _rehashPrefix(uptoOffset) {
    for (let offset = 0; offset < uptoOffset; offset += CHUNK_SIZE) {
      const slice = this.file.slice(offset, Math.min(offset + CHUNK_SIZE, uptoOffset));
      const buf = new Uint8Array(await slice.arrayBuffer());
      this._hasher.update(buf);
    }
    this.bytesDone = uptoOffset;
  }

  async _sendFrom(startOffset) {
    for (let offset = startOffset; offset < this.meta.fileSize; ) {
      if (this.cancelled) return;
      while (this.status === 'paused-reconnecting') await delay(200); // wait out a drop
      if (this.status === 'failed') return;

      const seq = Math.floor(offset / CHUNK_SIZE);
      const slice = this.file.slice(offset, Math.min(offset + CHUNK_SIZE, this.meta.fileSize));
      const buf = new Uint8Array(await slice.arrayBuffer());
      this._hasher.update(buf);

      await this._waitForBackpressure();
      this._sendChunk(seq, buf);
      this._lastSentSeq = Math.max(this._lastSentSeq, seq);

      offset += buf.byteLength;
      this.bytesDone = offset;
      this._progress();

      if (this.bytesDone - this._lastPersistBytes >= PERSIST_THROTTLE_BYTES) {
        this._lastPersistBytes = this.bytesDone;
        saveTransferState(this.transferId, { offset: this.bytesDone, meta: this.meta, role: 'sender' }).catch(() => {});
      }
    }
  }

  async _waitForBackpressure() {
    if (this._usingRelay) {
      // Relay has no native backpressure (server just re-emits instantly), so we
      // throttle ourselves against the receiver's acks to cap in-flight bytes and
      // avoid flooding the socket with thousands of back-to-back emits.
      while (this._lastSentSeq - this._lastAckedSeq > RELAY_WINDOW_CHUNKS) {
        if (this.cancelled || this.status === 'failed') return;
        await delay(20);
      }
      return;
    }
    const dc = this._dc;
    if (!dc || dc.bufferedAmount < BUFFERED_AMOUNT_HIGH) return;
    await new Promise((resolve) => {
      dc.addEventListener('bufferedamountlow', function onLow() {
        dc.removeEventListener('bufferedamountlow', onLow);
        resolve();
      });
    });
  }

  _sendChunk(seq, buf) {
    if (this._usingRelay) {
      this._emit('share:relay-chunk', { to: this.peerSocketId, transferId: this.transferId, seq, chunk: buf.buffer });
    } else {
      // Frame: [4-byte big-endian seq][payload] over the reliable, ordered data channel.
      const frame = new Uint8Array(4 + buf.byteLength);
      new DataView(frame.buffer).setUint32(0, seq, false);
      frame.set(buf, 4);
      this._dc.send(frame.buffer);
    }
  }

  _resendFromLastAck() {
    const resumeOffset = (this._lastAckedSeq + 1) * CHUNK_SIZE;
    this._lastSentSeq = this._lastAckedSeq;
    this._sendFrom(Math.min(resumeOffset, this.bytesDone)).catch(() => {});
  }

  // ── Receiver ─────────────────────────────────────────────────────────────

  async _runReceiver() {
    this._setStatus('incoming');
    // The UI calls accept()/reject() which emit share:response — see NearbyShare.jsx.
    // Once accepted, the caller invokes start(), which just waits for the transport.
    const saved = await getTransferState(this.transferId);
    this._expectedSeq = saved ? Math.floor(saved.offset / CHUNK_SIZE) : 0;
    this.bytesDone = saved?.offset || 0;

    this._hasher = await createSHA256();
    if (this.bytesDone > 0) {
      // We can't re-read what we already wrote to disk here without file access,
      // so a receiver-side resume after a full page reload starts the file over.
      // Mid-session drops (the common case) never lose the hasher, since it stays in memory.
      this._expectedSeq = 0;
      this.bytesDone = 0;
    }

    // Run the native save-file dialog and WebRTC/relay negotiation concurrently.
    // Awaiting the dialog first (the old behavior) let the sender's 6s WebRTC
    // timeout — and its fallback to relay — fire well before the receiver even
    // started listening, silently dropping the opening chunks and deadlocking
    // the transfer. _writeChunk() waits on _initReady before touching disk, so
    // hashing/ordering stays correct no matter how long the user takes on the
    // dialog.
    this._initReady = this._initWritable();
    await Promise.all([this._initReady, this._establishTransport()]);
  }

  async _initWritable() {
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({ suggestedName: this.meta.fileName });
        this._writable = await handle.createWritable();
        return;
      }
    } catch {
      /* user cancelled the save dialog, or API unsupported — fall back below */
    }
    this._writable = null; // will assemble into this._blobParts instead
  }

  async _onData(raw) {
    if (typeof raw === 'string') return this._onControl(JSON.parse(raw));

    const buf = raw instanceof ArrayBuffer ? raw : await raw.arrayBuffer();
    const view = new DataView(buf);
    const seq = view.getUint32(0, false);
    const chunk = new Uint8Array(buf, 4);
    this._onChunk(seq, chunk);
  }

  /**
   * Called synchronously for every incoming chunk (from both the WebRTC
   * onmessage handler and the share:relay-chunk socket listener). It must
   * stay synchronous up through the hash update so that chunk ordering is
   * guaranteed to match arrival order — this is what fixes the checksum
   * mismatch bug. The actual write (disk or in-memory blob) is chained
   * onto _writeQueue so overlapping writes from back-to-back chunks can
   * never race with each other or land out of order.
   */
  _onChunk(seq, chunk) {
    if (seq !== this._expectedSeq) return; // duplicate/out-of-order after a reconnect — ignore, sender will resend correctly
    this._expectedSeq += 1;

    // Hash immediately, in arrival order, before any async work happens.
    this._hasher.update(chunk);

    // Queue the write so it can never overlap with another chunk's write.
    this._writeQueue = this._writeQueue.then(() => this._writeChunk(chunk));
  }

  async _writeChunk(chunk) {
    // Wait for the save-file dialog to resolve before deciding disk vs. blob —
    // chunks can start arriving (and get hashed) while the user is still
    // looking at the native picker, since that no longer blocks negotiation.
    if (this._initReady) await this._initReady;

    if (this._writable) {
      await this._writable.write(chunk);
    } else {
      this._blobParts.push(chunk);
    }
    this.bytesDone += chunk.byteLength;
    this._progress();

    if (this.bytesDone - this._lastPersistBytes >= PERSIST_THROTTLE_BYTES) {
      this._lastPersistBytes = this.bytesDone;
      saveTransferState(this.transferId, { offset: this.bytesDone, meta: this.meta, role: 'receiver' }).catch(() => {});
    }

    const now = Date.now();
    if (now - this._lastAckSentAt > ACK_THROTTLE_MS) {
      this._lastAckSentAt = now;
      this._sendAck(this._expectedSeq - 1);
    }
  }

  _sendAck(ackedSeq) {
    if (this._usingRelay) {
      this._emit('share:relay-ack', { to: this.peerSocketId, transferId: this.transferId, ackedSeq });
    } else if (this._dc?.readyState === 'open') {
      this._dc.send(JSON.stringify({ type: 'ack', ackedSeq }));
    }
  }

  async _onControl(msg) {
    if (msg.type === 'resume-query') {
      this._replyControl({ type: 'resume-offset', offset: this.bytesDone });
    } else if (msg.type === 'final') {
      // Make sure every queued write has actually landed before we hash/close/verify.
      await this._writeQueue;
      this._setStatus('verifying');
      const localChecksum = this._hasher.digest('hex');
      if (this._writable) await this._writable.close();
      const verified = localChecksum === msg.checksum;
      this._setStatus(verified ? 'complete' : 'failed', verified ? {} : { reason: 'checksum mismatch' });
      this._replyControl({ type: 'verified', ok: verified });
      await deleteTransferState(this.transferId);
      this._logTransfer(localChecksum, verified ? 'completed' : 'failed');
      this._teardownTransport();
      if (!this._writable) {
        const blob = new Blob(this._blobParts, { type: this.meta.mimeType });
        this.dispatchEvent(new CustomEvent('file-ready', { detail: { blob, fileName: this.meta.fileName } }));
      }
    } else if (msg.type === 'ack') {
      this._lastAckedSeq = Math.max(this._lastAckedSeq, msg.ackedSeq);
    } else if (msg.type === 'verified') {
      this._verificationResolve?.(msg.ok);
    } else if (msg.type === 'resume-offset') {
      this._resumeResolve?.(msg.offset);
    }
  }

  _replyControl(msg) {
    if (this._usingRelay) {
      if (msg.type === 'verified') this._emit('share:relay-end', { to: this.peerSocketId, transferId: this.transferId, checksum: msg.ok ? 'ok' : 'mismatch' });
    } else if (this._dc?.readyState === 'open') {
      this._dc.send(JSON.stringify(msg));
    }
  }

  _sendControl(msg) {
    if (this._usingRelay) {
      if (msg.type === 'final') this._emit('share:relay-end', { to: this.peerSocketId, transferId: this.transferId, checksum: msg.checksum });
    } else if (this._dc?.readyState === 'open') {
      this._dc.send(JSON.stringify(msg));
    }
    return Promise.resolve();
  }

  _queryResumeOffset() {
    return new Promise((resolve) => {
      this._resumeResolve = resolve;
      this._sendControl({ type: 'resume-query' });
      setTimeout(() => resolve(0), 3000); // no reply in time -> assume fresh transfer
    });
  }

  _awaitVerification() {
    return new Promise((resolve) => {
      this._verificationResolve = resolve;
      setTimeout(() => resolve(false), 15000);
    });
  }

  _awaitResponse() {
    return new Promise((resolve) => {
      const onResponse = ({ from, transferId, accepted }) => {
        if (from !== this.peerSocketId || transferId !== this.transferId) return;
        this.socket.off('share:response', onResponse);
        resolve(accepted);
      };
      this.socket.on('share:response', onResponse);
    });
  }

  // ── Relay-transport listeners (only fire when relay is active) ──────────

  _bindRelayListeners() {
    this.socket.on('share:relay-chunk', ({ from, transferId, seq, chunk }) => {
      if (from !== this.peerSocketId || transferId !== this.transferId) return;
      if (!this._usingRelay) {
        // The sender has committed to relay — a chunk arriving proves that,
        // even if our own WebRTC attempt hasn't timed out yet. Adopt relay
        // immediately instead of dropping the chunk, which used to strand
        // seq 0 forever and deadlock the whole transfer.
        this._usingRelay = true;
        this.method = 'relay';
        this._teardownTransport(); // abandon any in-progress WebRTC attempt
        this._setStatus('transferring-relay');
      }
      this._onChunk(seq, new Uint8Array(chunk));
    });
    this.socket.on('share:relay-ack', ({ from, transferId, ackedSeq }) => {
      if (from !== this.peerSocketId || transferId !== this.transferId) return;
      this._lastAckedSeq = Math.max(this._lastAckedSeq, ackedSeq);
    });
    this.socket.on('share:relay-end', ({ from, transferId, checksum }) => {
      if (from !== this.peerSocketId || transferId !== this.transferId) return;
      if (this.role === 'receiver') this._onControl({ type: 'final', checksum });
      else this._verificationResolve?.(checksum === 'ok');
    });
    this.socket.on('share:cancel', ({ from, transferId, reason }) => {
      if (from !== this.peerSocketId || transferId !== this.transferId) return;
      this.cancelled = true;
      this._teardownTransport();
      this._setStatus('cancelled', { reason: reason || 'cancelled by peer' });
    });
  }

  async _logTransfer(checksum, status) {
    try {
      const api = (await import('./api')).default;
      await api.post('/share/log', {
        receiver_id: this.role === 'sender' ? null : undefined,
        file_name: this.meta.fileName,
        file_size: this.meta.fileSize,
        checksum_sha256: checksum,
        transfer_method: this.method || 'relay',
        status,
      });
    } catch {
      /* history logging is best-effort — never block the transfer on it */
    }
  }
}