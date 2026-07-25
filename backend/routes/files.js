/**
 * routes/files.js  (SFMS — Production Concurrent Upload Edition)
 *
 * New routes vs original:
 *  POST /upload-batch  — multi-file upload, each file queued independently
 *  GET  /queue-stats   — live queue depth (for admin dashboard / health)
 *
 * All original routes are unchanged.
 *
 * FIX (ERR_CONNECTION_RESET on rejected uploads): when Multer rejects a
 * file mid-stream (size limit, file-count limit, fileFilter), the browser
 * may still be actively sending the rest of a large multipart body. Firing
 * res.status(...).json(...) immediately can close/reuse the socket while
 * that incoming data is still unconsumed in the kernel's receive buffer —
 * which the OS can turn into a TCP RST instead of a clean response, and
 * Chrome then reports ERR_CONNECTION_RESET instead of showing the JSON
 * error body at all. handleMulterError now explicitly drains whatever is
 * left of the request stream before responding, so the client always gets
 * back a real, catchable error.
 *
 * Note: if you still see resets on requests that fail authentication (401)
 * before Multer ever runs, the same drain pattern needs to be applied in
 * middleware/auth.js on its early-return path, since that middleware reads
 * zero bytes of a large in-flight body before responding.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');

const {
  uploadFile,
  uploadFileBatch,
  getQueueStats,
  listFiles,
  downloadFile,
  deleteFile,
  togglePin,
  getStats,
  checkCollision,
  getUploaders,
  editFile,
  getPdfInfo,
  splitPdf,
  mergePages,
  moveFiles,
  copyFiles,
  downloadFilesZip,
  transferFileOwnership,
  downloadSfmsAgentSetup,
  checkHashesBatch,
} = require('../controllers/fileController');

const { authenticate }              = require('../middleware/auth');
const { upload, uploadMultiple }    = require('../config/multer');

// Inject Socket.io instance into req
const injectIo = (io) => (req, res, next) => {
  req.io = io;
  next();
};

// Drain any remaining bytes still in flight from the client so the socket
// isn't torn down mid-stream. Safe to call even if the body is already
// fully consumed or the connection is already closed — those cases just
// resolve immediately / no-op.
function drainRequest(req) {
  return new Promise((resolve) => {
    if (req.readableEnded || req.destroyed) return resolve();
    req.on('data', () => {}); // no-op: discard remaining bytes
    req.on('end', resolve);
    req.on('error', resolve); // client aborted or connection already dead — fine, stop waiting
    req.resume();
  });
}

// Multer error handler (shared)
const handleMulterError = async (err, req, res, next) => {
  if (!err) return next();

  // Clean up any temp file multer already saved
  if (req.file?.path  && fs.existsSync(req.file.path))  fs.unlinkSync(req.file.path);
  if (req.files?.length) req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

  // Let the rest of the client's in-flight body drain before we respond —
  // this is what actually prevents the ERR_CONNECTION_RESET.
  await drainRequest(req);

  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 500} MB` });
  if (err.code === 'LIMIT_FILE_COUNT')
    return res.status(400).json({ error: 'Too many files. Max 50 per request.' });
  res.status(400).json({ error: err.message });
};

module.exports = (io) => {

  // ── Read-only / query endpoints ────────────────────────────────────────
  router.get('/stats',           authenticate, getStats);
  router.get('/check-collision', authenticate, checkCollision);
  router.get('/uploaders',       authenticate, getUploaders);
  router.get('/queue-stats',     authenticate, getQueueStats);   // NEW
  router.get('/',                authenticate, listFiles);

  // ── File-explorer style operations (NEW) ────────────────────────────────
  router.post('/move',           authenticate, moveFiles);
  router.post('/copy',           authenticate, copyFiles);
  // Zip downloads use a query-string token (same pattern as /download/:fileId)
  // since a plain <a href="..."> download link can't set an Authorization header.
  router.get('/download-zip',    downloadFilesZip);

  // ── Single-file upload (original, now queue-backed) ────────────────────
  router.post(
    '/upload',
    authenticate,
    injectIo(io),
    (req, res, next) => {
      upload.single('file')(req, res, (err) => handleMulterError(err, req, res, next));
    },
    uploadFile
  );

  // ── Batch upload (NEW) ─────────────────────────────────────────────────
  //  POST /api/files/upload-batch
  //  multipart field: "files" (array, max 50)
  router.post(
    '/upload-batch',
    authenticate,
    injectIo(io),
    (req, res, next) => {
      uploadMultiple.array('files', 50)(req, res, (err) => handleMulterError(err, req, res, next));
    },
    uploadFileBatch
  );

  // ── File-specific operations (unchanged) ───────────────────────────────
  router.get('/download/:fileId', downloadFile);
  router.delete('/:fileId',       authenticate, deleteFile);
  router.patch('/:fileId/pin',    authenticate, togglePin);
  router.put('/edit/:fileId',     authenticate, editFile);
  router.get('/:id/pdf-info',    getPdfInfo);
  router.post('/:id/split-pdf',  splitPdf);
  router.post('/:id/merge-pages', upload.single('file'), mergePages);
  router.put('/transfer/:fileId', authenticate, transferFileOwnership);
  router.get('/downloads/sfms-agent', downloadSfmsAgentSetup);
  router.post('/check-hashes-batch', authenticate, checkHashesBatch);

  return router;
};