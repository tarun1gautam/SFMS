/**
 * p2pTransfer.js — Nearby Share transfer engine (High-Speed, Cross-Device Edition)
 *
 * One class, two roles ('sender' / 'receiver'). Handles:
 *
 *  • Transport: tries a direct WebRTC RTCDataChannel first (true device-to-
 *    device, zero server bytes). If it doesn't open within RTC_TIMEOUT_MS,
 *    silently falls back to the Socket.IO relay (server forwards chunks
 *    in-memory, never to disk/DB) — same binary chunk/ack framing either way.
 *  • Resilience: every chunk is numbered with a plain incrementing counter.
 *    The receiver acks the highest chunk it has actually WRITTEN (not just
 *    received — see below). If the transport drops, the engine reconnects
 *    and resumes sending from the receiver's last acked byte offset —
 *    never from zero, and never from a byte the receiver hasn't durably
 *    processed.
 *  • Integrity: both sides hash the stream incrementally (SHA-256 via
 *    hash-wasm), in send/arrival order. The sender sends its final digest;
 *    the receiver compares it against its own before declaring success.
 *  • Zero-storage: sender reads the file in slices on demand; receiver
 *    streams straight to disk via the File System Access API when
 *    available (Chromium-based browsers), falling back to an in-memory
 *    Blob assembly otherwise (Firefox/Safari — costs memory proportional
 *    to file size, unavoidable without that API). Nothing is ever written
 *    to server disk or the database — the DB is only touched once, at the
 *    very end, to log a one-row audit entry.
 *  • Adaptive chunk size: negotiated per-connection against the browser's
 *    ACTUAL SCTP message-size ceiling for WebRTC (varies by device — older
 *    Android WebViews / some iOS Safari versions negotiate much smaller
 *    limits than desktop Chrome). If a send is ever rejected mid-transfer,
 *    the engine shrinks the chunk size and retries that exact chunk
 *    instead of failing the whole transfer.
 *
 * ── Changes vs. the previous adaptive-chunk-size version ─────────────────
 *  1. FIXED: acks now reflect the highest chunk actually WRITTEN to disk,
 *     not merely received off the wire. Previously `_expectedSeq` (and
 *     thus the ack sent to the peer) advanced the instant a chunk arrived,
 *     while the real write was only queued (async, via `_writeQueue`).
 *     Under bursty delivery this let dozens of chunks pile up unwritten
 *     while the sender's flow control believed the receiver was fully
 *     caught up — this was the actual cause of "sender finishes instantly,
 *     receiver drags on" and unbounded memory growth in the write queue /
 *     blob-fallback array.
 *  2. Ack-based byte-windowed backpressure now applies to BOTH transports,
 *     not just relay. `RTCDataChannel.bufferedAmount` only ever reflects
 *     the SENDER's own outbound queue — it says nothing about whether the
 *     receiver has actually drained/written what already arrived. Without
 *     this, a fast P2P sender on a good device could race arbitrarily far
 *     ahead of a slow-disk receiver with zero feedback.
 *  3. ACK_THROTTLE_MS lowered (250ms -> 80ms) and the P2P window lowered
 *     to match, so the feedback loop reacts fast enough to actually gate
 *     a fast sender against a slow receiver, instead of "confirming" tens
 *     of megabytes after the fact.
 *  4. Receiver batches multiple incoming chunks into fewer, larger disk
 *     writes (flushes at ~1MB or after a short idle gap) instead of one
 *     `write()` call per chunk — cuts per-call File System Access API
 *     overhead substantially, which matters most on slower/older devices.
 *  5. Chunk size negotiation and the write batching threshold both scale
 *     with the device's real negotiated limits, so small/old devices stay
 *     safe (small chunks, smaller ack window) while capable desktops still
 *     get large chunks and a large window — same code path, no per-device
 *     branching needed anywhere else in the engine.
 */

import { createSHA256 } from 'hash-wasm';
import { saveTransferState, getTransferState, deleteTransferState } from './transferStore';

export const CHUNK_SIZE_MIN = 32 * 1024;         // safe floor — works on every device/browser we've seen
export const CHUNK_SIZE_P2P_MAX = 256 * 1024;    // ceiling we'll use over WebRTC, IF the device's own negotiated SCTP limit allows it
export const CHUNK_SIZE_RELAY = 128 * 1024;      // relay has no per-device SCTP ceiling to probe, so stay fixed and conservative
// Kept for any external code importing CHUNK_SIZE directly (e.g. rough
// progress-bar math elsewhere). Represents the safe floor, not what any
// given transfer actually uses — see this.chunkSize for the live value.
export const CHUNK_SIZE = CHUNK_SIZE_MIN;

const BUFFERED_AMOUNT_HIGH = 4 * 1024 * 1024;  // P2P: pause sending once ~4MB is unconfirmed by the receiver's write acks
const BUFFERED_AMOUNT_LOW = 1 * 1024 * 1024;   // native dc.bufferedAmount low-water mark (sender's own outbound queue)
const RTC_TIMEOUT_MS = 6000; // how long to wait for the data channel before falling back to relay
const MAX_RECONNECT_ATTEMPTS = 30; // ~ a couple of minutes of retrying a flaky connection
const ACK_THROTTLE_MS = 80; // was 250ms — tighter feedback loop so flow control actually reacts in time
const PERSIST_THROTTLE_BYTES = 4 * 1024 * 1024; // save resume offset to IndexedDB every ~4MB
const RELAY_WINDOW_BYTES = 8 * 1024 * 1024; // relay: pause sending once ~8MB is unconfirmed by the receiver's write acks
const WRITE_BATCH_BYTES = 1 * 1024 * 1024; // receiver: flush to disk once this many buffered bytes accumulate
const WRITE_BATCH_IDLE_MS = 150; // receiver: also flush if no new chunk arrives for this long, so tail bytes aren't stuck waiting for a full batch

// Free, public, no-auth STUN server. Only used during ICE negotiation to
// help discover reachable candidates — never touches file data.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

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

    // Adaptive chunk size — negotiated once the transport actually opens
    // (see _negotiateP2PChunkSize / _establishTransport), and can shrink
    // further at runtime if a send is ever rejected. Starts at the safe
    // floor so nothing is ever sent before a real ceiling is known.
    this.chunkSize = CHUNK_SIZE_MIN;

    this._pc = null;
    this._dc = null;
    this._usingRelay = false;
    this._lastAckedSeq = -1;
    this._lastSentSeq = -1; // highest seq actually handed to the transport
    this._nextSeq = 0; // sender: plain incrementing counter, independent of chunk size
    this._seqEndOffsets = []; // sender: seq -> cumulative bytes sent through (and including) that chunk
    this._expectedSeq = 0; // receiver: next seq it will accept off the wire
    this._writable = null; // FileSystemWritableFileStream, if available
    this._blobParts = []; // fallback in-memory assembly (browsers without showSaveFilePicker)
    this._lastPersistBytes = 0;
    this._lastAckSentAt = 0;
    this._writeQueue = Promise.resolve(); // serializes actual disk/blob writes so they can never overlap/race
    this._initReady = null; // receiver only: resolves once the save-file dialog is settled

    // ── Receiver-side write batching state ──────────────────────────────
    // Incoming chunks are hashed immediately (arrival order matters for
    // the checksum) but their bytes are held here briefly and flushed to
    // disk/blob in fewer, larger writes — cuts per-call File System
    // Access API overhead substantially versus one write() per chunk.
    this._pendingWriteParts = [];
    this._pendingWriteBytes = 0;
    this._highestWrittenSeq = -1; // what we actually ack — see _flushPendingWrites
    this._flushTimer = null;

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
    if (this._flushTimer) clearTimeout(this._flushTimer);
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
      // Chunk size for P2P is negotiated inside _tryWebRTC as soon as the
      // data channel actually opens (see setupChannel below) — that's the
      // earliest point the browser's real SCTP ceiling is known.
      await this._tryWebRTC();
      this.method = 'p2p';
      this._usingRelay = false;
    } catch (err) {
      if (this.cancelled) throw err;
      this.method = 'relay';
      this._usingRelay = true;
      this.chunkSize = CHUNK_SIZE_RELAY;
      this._setStatus('connecting-relay');
      // Relay needs no handshake beyond the socket itself already being connected.
    }
    console.log('[ShareTransfer] Using method:', this.method, '· chunkSize:', this.chunkSize);
    this._setStatus(this.method === 'p2p' ? 'transferring' : 'transferring-relay');
  }

  // Uses the browser's ACTUAL negotiated SCTP message-size ceiling for
  // THIS specific connection (not a guess) to pick a chunk size that's
  // safe on this device, up to our normal 256KB target. Devices that
  // negotiate a smaller SCTP limit (older mobiles, some WebViews) get a
  // smaller, safe chunk size automatically instead of failing outright.
  // Re-run every time a channel opens, so a mid-transfer reconnect
  // re-negotiates too rather than assuming the old value still applies.
  _negotiateP2PChunkSize() {
    const negotiatedMax = this._pc?.sctp?.maxMessageSize;
    this.chunkSize = negotiatedMax
      ? Math.max(CHUNK_SIZE_MIN, Math.min(CHUNK_SIZE_P2P_MAX, negotiatedMax - 4)) // -4 bytes for our seq prefix
      : CHUNK_SIZE_MIN; // ceiling unknown -> stay conservative rather than guess big
  }

  _tryWebRTC() {
    return new Promise((resolve, reject) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
        dc.onopen = () => {
          this._negotiateP2PChunkSize();
          finish(resolve);
        };
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
          await this._tryWebRTC(); // re-negotiates chunkSize internally on success
        }
        this._setStatus(this._usingRelay ? 'transferring-relay' : 'transferring');
        if (this.role === 'sender') this._resendFromLastAck();
        return;
      } catch {
        // fall through to relay after enough failed WebRTC attempts
        if (!this._usingRelay && attempt >= 3) {
          this._usingRelay = true;
          this.method = 'relay';
          this.chunkSize = CHUNK_SIZE_RELAY;
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
      // Re-hash the already-sent prefix so the final digest still covers
      // the whole file. Hashing is order-dependent, not step-size
      // dependent, so it's fine to walk this in this.chunkSize-sized
      // steps even though the original bytes may have been sent at a
      // different chunk size on an earlier attempt.
      await this._rehashPrefix(resumeOffset);
    }

    // NOTE: this specific edge case (a resume offset reported at the very
    // start of a fresh sender instance, rather than a mid-session drop —
    // see _resendFromLastAck for that path) predates the adaptive chunk
    // size work and was already approximate. Dividing by the safe floor
    // keeps it on the conservative side rather than risking a seq
    // mismatch against whatever chunk size produced the original bytes.
    this._nextSeq = Math.floor(resumeOffset / CHUNK_SIZE_MIN);
    this._lastSentSeq = this._nextSeq - 1;

    try {
      await this._sendFrom(resumeOffset);
    } catch (err) {
      // Previously an error here (e.g. from a bad pipelining change, or an
      // uncaught oversize-frame throw) could hang the whole transfer at 0%
      // with no visible error anywhere. Now it surfaces in the console AND
      // marks the transfer as failed instead of silently freezing.
      console.error('[ShareTransfer] _sendFrom failed:', err);
      this._setStatus('failed', { reason: err.message || 'send failed' });
      return;
    }

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
    for (let offset = 0; offset < uptoOffset; offset += this.chunkSize) {
      const slice = this.file.slice(offset, Math.min(offset + this.chunkSize, uptoOffset));
      const buf = new Uint8Array(await slice.arrayBuffer());
      this._hasher.update(buf);
    }
    this.bytesDone = uptoOffset;
  }

  // Sequential read-then-send loop. Chunk size is read fresh from
  // this.chunkSize on every iteration (not captured once), so a
  // shrink-on-failure takes effect on the very next chunk with no extra
  // plumbing needed.
  async _sendFrom(startOffset) {
    let offset = startOffset;
    while (offset < this.meta.fileSize) {
      if (this.cancelled) return;
      while (this.status === 'paused-reconnecting') await delay(200); // wait out a drop
      if (this.status === 'failed') return;

      const size = Math.min(this.chunkSize, this.meta.fileSize - offset);
      const slice = this.file.slice(offset, offset + size);
      const buf = new Uint8Array(await slice.arrayBuffer());

      await this._waitForBackpressure();

      const seq = this._nextSeq;
      const sent = this._sendChunk(seq, buf);

      if (!sent) {
        // Rejected — e.g. this frame exceeded the device's actual send
        // limit despite our negotiated estimate. Shrink and retry the
        // SAME byte offset at a smaller size instead of failing the whole
        // transfer. Nothing above this point (hash, seq counter, offset)
        // has been committed yet, so re-looping is safe.
        const shrunk = Math.max(CHUNK_SIZE_MIN, Math.floor(this.chunkSize / 2));
        if (shrunk === this.chunkSize) {
          // Already at the floor and still failing — the connection
          // itself is broken, not just the frame size. Let this surface
          // as a real, visible failure instead of looping forever.
          throw new Error('This connection cannot send data even at the minimum chunk size');
        }
        this.chunkSize = shrunk;
        continue;
      }

      // Hash only once a chunk is confirmed sent, in send order, so a
      // shrink-and-retry never double-counts bytes into the digest.
      this._hasher.update(buf);
      this._seqEndOffsets[seq] = offset + buf.byteLength;
      this._nextSeq += 1;
      this._lastSentSeq = seq;

      offset += buf.byteLength;
      this.bytesDone = offset;
      this._progress();

      if (this.bytesDone - this._lastPersistBytes >= PERSIST_THROTTLE_BYTES) {
        this._lastPersistBytes = this.bytesDone;
        saveTransferState(this.transferId, { offset: this.bytesDone, meta: this.meta, role: 'sender' }).catch(() => {});
      }
    }
  }

  // Ack-based, byte-windowed backpressure — applies to BOTH transports now.
  // This is what actually gates a fast sender against a slow-writing
  // receiver: acks only advance once bytes are truly WRITTEN (see
  // _flushPendingWrites), so this loop genuinely reflects "how far behind
  // is the receiver's disk," not just "how much has arrived on the wire."
  async _waitForBackpressure() {
    const windowBytes = this._usingRelay ? RELAY_WINDOW_BYTES : BUFFERED_AMOUNT_HIGH;
    while (true) {
      const ackedBytes = this._lastAckedSeq >= 0 ? (this._seqEndOffsets[this._lastAckedSeq] || 0) : 0;
      if (this.bytesDone - ackedBytes <= windowBytes) break;
      if (this.cancelled || this.status === 'failed') return;
      await delay(15);
    }

    if (!this._usingRelay) {
      // Also respect the browser's own outbound send queue for this device
      // — a secondary, device-local check layered on top of the ack window.
      const dc = this._dc;
      if (dc && dc.bufferedAmount >= BUFFERED_AMOUNT_HIGH) {
        await new Promise((resolve) => {
          dc.addEventListener('bufferedamountlow', function onLow() {
            dc.removeEventListener('bufferedamountlow', onLow);
            resolve();
          });
        });
      }
    }
  }

  // Both transports use the same binary frame: [4-byte big-endian seq][bytes].
  // Returns true/false instead of letting a send failure escape as an
  // uncaught throw — RTCDataChannel.send() throws SYNCHRONOUSLY if the
  // frame exceeds this device's actual negotiated SCTP message-size limit,
  // which is exactly the failure mode seen on weaker/older devices.
  _sendChunk(seq, buf) {
    const frame = new Uint8Array(4 + buf.byteLength);
    new DataView(frame.buffer).setUint32(0, seq, false);
    frame.set(buf, 4);

    try {
      if (this._usingRelay) {
        this._emit('share:relay-chunk', { to: this.peerSocketId, transferId: this.transferId, chunk: frame.buffer });
      } else {
        this._dc.send(frame.buffer);
      }
      return true;
    } catch (err) {
      console.warn('[ShareTransfer] send rejected, shrinking chunk size and retrying:', err.message);
      return false;
    }
  }

  _resendFromLastAck() {
    // Byte offset comes from the tracked end-offset of the last acked seq,
    // NOT from (seq * chunkSize) — this is what makes resend correct even
    // though chunk size may have changed between the original send and
    // this reconnect (e.g. dropped mid-transfer on P2P, came back on relay
    // with a different chunkSize). It's also now guaranteed to be a byte
    // the receiver actually WROTE, not merely received, since acks are
    // write-completion-based — so a resume can never skip bytes the
    // receiver never durably saved.
    const resumeOffset = this._lastAckedSeq >= 0 ? (this._seqEndOffsets[this._lastAckedSeq] || 0) : 0;

    // Reset the seq counter to continue right after what the receiver has
    // actually confirmed, and drop any bookkeeping past that point so a
    // stale entry can't be mistaken for a fresh one.
    this._nextSeq = this._lastAckedSeq + 1;
    this._seqEndOffsets.length = this._nextSeq;
    this._lastSentSeq = this._lastAckedSeq;

    this._sendFrom(Math.min(resumeOffset, this.bytesDone)).catch((err) => {
      console.error('[ShareTransfer] _resendFromLastAck failed:', err);
      this._setStatus('failed', { reason: err.message || 'resend failed' });
    });
  }

  // ── Receiver ─────────────────────────────────────────────────────────────

  async _runReceiver() {
    this._setStatus('incoming');
    // The UI calls accept()/reject() which emit share:response — see NearbyShare.jsx.
    // Once accepted, the caller invokes start(), which just waits for the transport.
    const saved = await getTransferState(this.transferId);
    this._expectedSeq = saved ? Math.floor(saved.offset / CHUNK_SIZE_MIN) : 0;
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
   * onmessage handler and the share:relay-chunk socket listener). Stays
   * synchronous through the hash update so ordering is guaranteed to match
   * arrival order (fixes checksum-mismatch risk). The actual disk write is
   * BATCHED — chunks accumulate in `_pendingWriteParts` and are flushed
   * together (see _flushPendingWrites) rather than one write() per chunk,
   * which cuts File System Access API call overhead substantially.
   *
   * Note: `_expectedSeq` here only governs duplicate/out-of-order
   * detection on the wire — it is NOT what gets acked. What gets acked is
   * `_highestWrittenSeq`, updated only once bytes are actually flushed to
   * disk/blob. This split is the core fix: the sender's flow control now
   * reacts to real write progress, not wire arrival.
   */
  _onChunk(seq, chunk) {
    if (seq !== this._expectedSeq) return; // duplicate/out-of-order after a reconnect — ignore, sender will resend correctly
    this._expectedSeq += 1;

    // Hash immediately, in arrival order, before any batching/async work.
    this._hasher.update(chunk);

    this._pendingWriteParts.push({ seq, chunk });
    this._pendingWriteBytes += chunk.byteLength;

    if (this._pendingWriteBytes >= WRITE_BATCH_BYTES) {
      this._scheduleFlush(true);
    } else {
      this._scheduleFlush(false); // arms the idle-flush timer so tail bytes aren't stuck waiting for a full batch
    }
  }

  // Debounced/threshold flush scheduler. `immediate` short-circuits the
  // idle timer when we've already hit the byte threshold; otherwise we
  // wait a short idle gap (no new chunk arriving) before flushing whatever
  // has accumulated so far — this is what prevents the very end of a file
  // (a partial batch) from sitting unflushed indefinitely.
  _scheduleFlush(immediate) {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (immediate) {
      this._writeQueue = this._writeQueue.then(() => this._flushPendingWrites());
      return;
    }
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._writeQueue = this._writeQueue.then(() => this._flushPendingWrites());
    }, WRITE_BATCH_IDLE_MS);
  }

  async _flushPendingWrites() {
    if (this._pendingWriteParts.length === 0) return;

    // Wait for the save-file dialog to resolve before deciding disk vs. blob —
    // chunks can start arriving (and get hashed) while the user is still
    // looking at the native picker, since that no longer blocks negotiation.
    if (this._initReady) await this._initReady;

    const batch = this._pendingWriteParts;
    const batchBytes = this._pendingWriteBytes;
    this._pendingWriteParts = [];
    this._pendingWriteBytes = 0;

    // Concatenate the batch into one contiguous buffer so the underlying
    // stream/blob gets ONE write call for potentially many chunks, instead
    // of one call per chunk — this is the actual overhead reduction.
    const combined = new Uint8Array(batchBytes);
    let cursor = 0;
    for (const { chunk } of batch) {
      combined.set(chunk, cursor);
      cursor += chunk.byteLength;
    }

    if (this._writable) {
      await this._writable.write(combined);
    } else {
      this._blobParts.push(combined);
    }

    this.bytesDone += batchBytes;
    this._progress();

    // Ack reflects the highest seq actually WRITTEN — this is the fix.
    this._highestWrittenSeq = Math.max(this._highestWrittenSeq, batch[batch.length - 1].seq);

    if (this.bytesDone - this._lastPersistBytes >= PERSIST_THROTTLE_BYTES) {
      this._lastPersistBytes = this.bytesDone;
      saveTransferState(this.transferId, { offset: this.bytesDone, meta: this.meta, role: 'receiver' }).catch(() => {});
    }

    const now = Date.now();
    if (now - this._lastAckSentAt > ACK_THROTTLE_MS) {
      this._lastAckSentAt = now;
      this._sendAck(this._highestWrittenSeq);
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
      // Force any pending batch to flush (bypassing the idle timer) and
      // make sure every queued write has actually landed before we
      // hash/close/verify.
      if (this._flushTimer) {
        clearTimeout(this._flushTimer);
        this._flushTimer = null;
      }
      this._writeQueue = this._writeQueue.then(() => this._flushPendingWrites());
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
    // Relay chunks arrive in the same [4-byte seq][bytes] binary frame as
    // WebRTC — the server just forwards `chunk` (an ArrayBuffer) as-is.
    this.socket.on('share:relay-chunk', ({ from, transferId, chunk }) => {
      if (from !== this.peerSocketId || transferId !== this.transferId) return;
      if (!this._usingRelay) {
        // The sender has committed to relay — a chunk arriving proves that,
        // even if our own WebRTC attempt hasn't timed out yet. Adopt relay
        // immediately instead of dropping the chunk, which used to strand
        // seq 0 forever and deadlock the whole transfer.
        this._usingRelay = true;
        this.method = 'relay';
        this.chunkSize = CHUNK_SIZE_RELAY;
        this._teardownTransport(); // abandon any in-progress WebRTC attempt
        this._setStatus('transferring-relay');
      }
      const view = new DataView(chunk);
      const seq = view.getUint32(0, false);
      const bytes = new Uint8Array(chunk, 4);
      this._onChunk(seq, bytes);
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
      if (this._flushTimer) clearTimeout(this._flushTimer);
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