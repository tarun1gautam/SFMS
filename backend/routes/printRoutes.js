const express = require('express');
const router = express.Router();
const { listPrinters, submitPrintJob } = require('../controllers/printController');
const printUpload = require('../middleware/printUpload');
const { authenticate } = require('../middleware/auth'); // ✅ destructure, matches your auth.js export shape

router.get('/printers', authenticate, listPrinters);

router.post(
  '/job',
  authenticate,
  printUpload.single('file'),
  (err, req, res, next) => {
    // Catches multer errors (bad mimetype, file too large) before they crash the route
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  },
  submitPrintJob
);

module.exports = router;