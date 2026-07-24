const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const TMP_DIR = path.join(__dirname, '..', 'tmp');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TMP_DIR);
  },
  filename: (req, file, cb) => {
    // Random filename — never trust the original filename from the client
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `print-${uniqueSuffix}.pdf`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('Only PDF files are allowed for print jobs.'), false);
  }
  cb(null, true);
};

const printUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB cap — adjust to your needs
  },
});

module.exports = printUpload;