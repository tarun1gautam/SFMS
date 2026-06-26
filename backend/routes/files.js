/**
 * routes/files.js  (SFMS — Production Concurrent Upload Edition)
 *
 * New routes vs original:
 *  POST /upload-batch  — multi-file upload, each file queued independently
 *  GET  /queue-stats   — live queue depth (for admin dashboard / health)
 *
 * All original routes are unchanged.
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
} = require('../controllers/fileController');

const { authenticate }              = require('../middleware/auth');
const { upload, uploadMultiple }    = require('../config/multer');

// Inject Socket.io instance into req
const injectIo = (io) => (req, res, next) => {
  req.io = io;
  next();
};

// Multer error handler (shared)
const handleMulterError = (err, req, res, next) => {
  if (!err) return next();
  // Clean up any temp file multer already saved
  if (req.file?.path  && fs.existsSync(req.file.path))  fs.unlinkSync(req.file.path);
  if (req.files?.length) req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
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

  return router;
};
