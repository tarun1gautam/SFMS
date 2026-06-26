/**
 * uploadQueue.js
 *
 * A robust in-process upload queue that:
 *  - Limits concurrent uploads to prevent CPU/RAM exhaustion
 *  - Queues excess uploads and processes them FIFO
 *  - Emits real-time queue position updates via Socket.io
 *  - Exposes live stats for the /health endpoint
 *
 * Tuned for a Dell Xeon workstation (64 GB RAM, 4 TB storage):
 *   MAX_CONCURRENT = 20   → each slot ~2 GB peak RAM headroom
 *   MAX_QUEUE_SIZE  = 200  → 200 waiting uploads per server restart
 *   QUEUE_TIMEOUT   = 5 min → evict jobs stuck waiting too long
 */

const EventEmitter = require('events');

// ─── Tuneable constants ────────────────────────────────────────────────────
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_UPLOADS || '20');
const MAX_QUEUE_SIZE  = parseInt(process.env.MAX_QUEUE_SIZE         || '200');
const QUEUE_TIMEOUT_MS = parseInt(process.env.QUEUE_TIMEOUT_MS     || String(5 * 60 * 1000));

class UploadQueue extends EventEmitter {
  constructor() {
    super();
    this.active   = 0;       // currently processing
    this.queue    = [];      // waiting jobs
    this._io      = null;    // Socket.io server reference (set later)
  }

  /** Attach Socket.io so the queue can push status updates */
  attachIo(io) {
    this._io = io;
  }

  /** Live stats — exposed on /health */
  stats() {
    return {
      active:    this.active,
      waiting:   this.queue.length,
      maxConcurrent: MAX_CONCURRENT,
      maxQueue:  MAX_QUEUE_SIZE,
    };
  }

  /**
   * Enqueue an upload job.
   *
   * @param {object} jobMeta  - { userId, socketId, fileName }  (for UI updates)
   * @param {function} task   - async () => { ... }  (the actual upload logic)
   * @returns {Promise}       - resolves/rejects when the job completes
   */
  enqueue(jobMeta, task) {
    return new Promise((resolve, reject) => {
      // Hard cap — refuse if queue is full
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        return reject(new Error('Upload queue is full. Please try again shortly.'));
      }

      // Auto-timeout for stuck jobs (e.g. client disconnected mid-queue)
      const timeoutHandle = setTimeout(() => {
        const idx = this.queue.findIndex(j => j.id === job.id);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          this._broadcastQueuePositions();
          reject(new Error('Upload timed out while waiting in queue.'));
        }
      }, QUEUE_TIMEOUT_MS);

      const job = {
        id:          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        meta:        jobMeta,
        task,
        resolve,
        reject,
        timeoutHandle,
        enqueuedAt:  Date.now(),
      };

      if (this.active < MAX_CONCURRENT) {
        // Slot available — run immediately
        this._run(job);
      } else {
        this.queue.push(job);
        this._broadcastQueuePositions();
      }
    });
  }

  /** Internal: run one job */
  async _run(job) {
    clearTimeout(job.timeoutHandle);
    this.active++;

    // Notify the user their upload is now active
    this._emitToSocket(job.meta.socketId, 'upload_queue_started', {
      fileName: job.meta.fileName,
      queueId:  job.id,
    });

    try {
      const result = await job.task();
      job.resolve(result);
    } catch (err) {
      job.reject(err);
    } finally {
      this.active--;
      this._next();
    }
  }

  /** Internal: pull the next job from the queue */
  _next() {
    if (this.queue.length === 0) return;
    const next = this.queue.shift();
    this._broadcastQueuePositions();
    this._run(next);
  }

  /** Broadcast updated queue positions to all waiting clients */
  _broadcastQueuePositions() {
    this.queue.forEach((job, idx) => {
      this._emitToSocket(job.meta.socketId, 'upload_queue_position', {
        fileName: job.meta.fileName,
        position: idx + 1,
        total:    this.queue.length,
        queueId:  job.id,
      });
    });
  }

  /** Safe socket emit — no-op if socket id is unknown */
  _emitToSocket(socketId, event, data) {
    if (this._io && socketId) {
      this._io.to(socketId).emit(event, data);
    }
    // Also broadcast global stats to admin dashboard
    if (this._io) {
      this._io.emit('upload_queue_stats', this.stats());
    }
  }
}

// Singleton — one queue per Node process
const uploadQueue = new UploadQueue();
module.exports = uploadQueue;
