/**
 * routes/tools.js  (SFMS — Document Toolkit)
 *
 * All uploads use multer's in-memory storage (buffers only — nothing is
 * written to disk and nothing touches the DB), matching the "advanced PDF
 * utilities" spec: everything is processed directly in-memory using buffers.
 */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');

const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/toolsController');

const MAX_FILE_MB = parseInt(process.env.TOOLS_MAX_FILE_MB || '60');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 40 },
});

const handleMulterError = (err, _req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Max ${MAX_FILE_MB}MB per file.` });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files in one request.' });
  }
  return res.status(400).json({ error: err.message });
};

const single = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => handleMulterError(err, req, res, next));

const arrayField = (field, max) => (req, res, next) =>
  upload.array(field, max)(req, res, (err) => handleMulterError(err, req, res, next));

const fields = (defs) => (req, res, next) =>
  upload.fields(defs)(req, res, (err) => handleMulterError(err, req, res, next));

router.post('/pdf/info',      authenticate, single('file'), ctrl.getPdfPageInfo);
router.post('/pdf/organize',  authenticate, single('file'), ctrl.organizePdf);
router.post('/pdf/watermark', authenticate, fields([{ name: 'file', maxCount: 1 }, { name: 'logo', maxCount: 1 }]), ctrl.watermarkPdf);
router.post('/pdf/compress',  authenticate, single('file'), ctrl.compressPdf);
router.post('/pdf/flatten',   authenticate, single('file'), ctrl.flattenPdf);
router.post('/images-to-pdf', authenticate, arrayField('images', 30), ctrl.imagesToPdf);
router.post('/zip',           authenticate, arrayField('files', 40), ctrl.zipFiles);

module.exports = router;