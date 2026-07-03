/**
 * config/multer.js  (SFMS — Production Edition)
 *
 * Key upgrades over the original:
 *  1. Streams directly to disk — never buffers whole file in RAM
 *  2. Per-request temp-file ID prevents filename collisions under concurrency
 *  3. buildStoragePath() is unchanged (keeps your year/month/week layout)
 *  4. Exported constants match what fileController already expects
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekRangeString(date) {
  const current     = new Date(date);
  const dayOfWeek   = current.getDay();
  const distToMon   = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday      = new Date(current);
  monday.setDate(current.getDate() + distToMon);
  const sunday      = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d) =>
    `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
  return `${fmt(monday)}to${fmt(sunday)}`;
}

function buildStoragePath(baseDir) {
  const now  = new Date();
  const year  = now.getFullYear();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const week  = getWeekRangeString(now);
  const dir   = path.join(baseDir, 'storage', String(year), month, week);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Directories ────────────────────────────────────────────────────────────

// temp/ lives inside the backend folder — only short-lived in-flight files here
const tempDir     = path.join(__dirname, '..', 'temp');
const storageBase = path.join(__dirname, '..', '..', 'uploads');

fs.mkdirSync(tempDir,     { recursive: true });
fs.mkdirSync(storageBase, { recursive: true });

// ─── Multer disk storage (streaming) ────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tempDir),

  filename: (_req, file, cb) => {
    // crypto random suffix → zero collision chance under 100 concurrent uploads
    const rand    = crypto.randomBytes(8).toString('hex');
    const ext     = path.extname(file.originalname);
    const base    = path.basename(file.originalname, ext)
                        .replace(/[^a-zA-Z0-9._-]/g, '_')
                        .slice(0, 80);          // cap long names
    cb(null, `${base}_${Date.now()}_${rand}${ext}`);
  },
});

// ─── File filter ────────────────────────────────────────────────────────────

// Add any blocked mime-types here if needed
const BLOCKED_MIMES = new Set([
  'application/x-msdownload',  // .exe
  'application/x-sh',          // shell scripts
]);

const fileFilter = (_req, file, cb) => {
  if (BLOCKED_MIMES.has(file.mimetype)) {
    return cb(new Error(`File type "${file.mimetype}" is not allowed.`), false);
  }
  cb(null, true);
};

// ─── Size limit ─────────────────────────────────────────────────────────────

const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '10000');

// ─── Multer instance ─────────────────────────────────────────────────────────

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  maxSizeMB * 1024 * 1024,
    files:     1,          // one file per POST — batching is done client-side
    fields:    20,         // reasonable cap on body fields
  },
});

// ─── Multiple files variant (used by the new batch endpoint) ────────────────

const uploadMultiple = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSizeMB * 1024 * 1024,
    files:    50,          // max 50 files per batch request
  },
});

module.exports = { upload, uploadMultiple, buildStoragePath, storageBase, tempDir };
