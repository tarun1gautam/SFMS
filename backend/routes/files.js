/**
 * routes/files.js  (SFMS v2 — Enhanced)
 *
 * Changes from v1:
 *  • Added GET /uploaders  → returns distinct uploader list for filter dropdown
 *  • All existing routes unchanged
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');

const {
  uploadFile,
  listFiles,
  downloadFile,
  deleteFile,
  togglePin,
  getStats,
  checkCollision,
  getUploaders,
  editFile,   // NEW v2
} = require('../controllers/fileController');

const { authenticate } = require('../middleware/auth');
const { upload }       = require('../config/multer');

// Inject Socket.io instance into req
const injectIo = (io) => (req, res, next) => {
  req.io = io;
  next();
};

module.exports = (io) => {

  // ── Read-only / query endpoints ────────────────────────────
  router.get('/stats',           authenticate, getStats);
  router.get('/check-collision', authenticate, checkCollision);
  router.get('/uploaders',       authenticate, getUploaders);   // NEW v2
  router.get('/',                authenticate, listFiles);

  // ── Upload ─────────────────────────────────────────────────
  router.post(
    '/upload',
    authenticate,
    injectIo(io),
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
              error: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 500}MB`,
            });
          }
          return res.status(400).json({ error: err.message });
        }
        next();
      });
    },
    uploadFile
  );

  // ── File-specific operations ───────────────────────────────
  router.get('/download/:fileId', downloadFile);
  router.delete('/:fileId',       authenticate, deleteFile);
  router.patch('/:fileId/pin',    authenticate, togglePin);
  router.put('/edit/:fileId', authenticate, editFile);

  return router;
};