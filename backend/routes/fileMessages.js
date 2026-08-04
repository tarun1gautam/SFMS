/**
 * routes/fileMessages.js  (SFMS — File Messaging Routes)
 *
 * Handles routing for file references, uploaded file messages, chat history,
 * read receipts, emoji reactions, and message deletions.
 *
 * Includes the handleMulterError + drainRequest pattern to prevent connection resets
 * (ERR_CONNECTION_RESET) on rejected multipart uploads mid-stream.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');

const {
  sendFileReference,
  sendUploadedFile,
  getConversation,
  getRecentConversations,
  markAsSeen,
  addReaction,
  removeReaction,
  softDeleteMessage,
  getUnreadCount
} = require('../controllers/fileMessageController');

const { authenticate } = require('../middleware/auth');
const { upload }       = require('../config/multer');

// Inject Socket.io instance into req
const injectIo = (io) => (req, res, next) => {
  req.io = io;
  next();
};

// Drain any remaining bytes still in flight from the client so the socket
// isn't torn down mid-stream.
function drainRequest(req) {
  return new Promise((resolve) => {
    if (req.readableEnded || req.destroyed) return resolve();
    req.on('data', () => {}); // no-op: discard remaining bytes
    req.on('end', resolve);
    req.on('error', resolve); // fine, stop waiting on network disconnects
    req.resume();
  });
}

// Multer error handler (shared)
const handleMulterError = async (err, req, res, next) => {
  if (!err) return next();

  // Clean up any temp file multer already saved
  if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  if (req.files?.length) req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });

  // Let remaining in-flight bytes drain to avoid TCP RST / ERR_CONNECTION_RESET
  await drainRequest(req);

  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ success: false, error: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 500} MB` });
  if (err.code === 'LIMIT_FILE_COUNT')
    return res.status(400).json({ success: false, error: 'Too many files. Max 1 per upload request.' });
  res.status(400).json({ success: false, error: err.message });
};

module.exports = (io) => {

  // ── Conversation & Query Endpoints ─────────────────────────────────────
  router.get('/conversations/recent', authenticate, getRecentConversations);
  router.get('/conversation/:userId', authenticate, getConversation);

  // ── Message Creation & Uploads ──────────────────────────────────────────
  router.post('/file-reference', authenticate, sendFileReference);
  
  router.post(
    '/upload',
    authenticate,
    injectIo(io),
    (req, res, next) => {
      upload.single('file')(req, res, (err) => handleMulterError(err, req, res, next));
    },
    sendUploadedFile
  );

  // ── Message Status & Receipts ───────────────────────────────────────────
  router.patch('/seen', authenticate, markAsSeen);

  // ── Reactions & Management ──────────────────────────────────────────────
  router.post('/:messageId/reactions', authenticate, addReaction);
  router.delete('/:messageId/reactions', authenticate, removeReaction);
  router.delete('/:messageId', authenticate, softDeleteMessage);
  router.get('/unread-count', authenticate, getUnreadCount);

  return router;
};