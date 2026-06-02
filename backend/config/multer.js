const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Get week number of year
function getWeekRangeString(date) {
  const current = new Date(date);
  
  // 1. Get the current day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = current.getDay();
  
  // 2. Calculate distance to Monday (if Sunday, distance is -6, otherwise it's 1 - dayOfWeek)
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  // 3. Find Monday's date
  const monday = new Date(current);
  monday.setDate(current.getDate() + distanceToMonday);
  
  // 4. Find Sunday's date (Monday + 6 days)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Helper helper function to pad numbers to 2 digits (DD-MM)
  const formatDate = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    return `${day}-${month}`;
  };

  // 5. Combine them into your target template format
  return `${formatDate(monday)}to${formatDate(sunday)}`;
}

// Build dynamic storage path: storage/YYYY/MM/Week_W/
function buildStoragePath(baseDir) {
  const now = new Date();
  const year = now.getFullYear();
  // const month = String(now.getMonth() + 1).padStart(2, '0');
  const month = now.toLocaleString('en-US', { month: 'long' });
  const week = getWeekRangeString(now);
  const dirPath = path.join(baseDir, 'storage', String(year), month, `${week}`);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

// Temp storage path for in-progress uploads
const tempDir = path.join(__dirname, '..', 'temp');
fs.mkdirSync(tempDir, { recursive: true });

const storageBase = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(storageBase, { recursive: true });

// Multer uses temp dir first; controller moves file to final destination
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${baseName}_${timestamp}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow all file types - adjust if you want restrictions
  cb(null, true);
};

const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '500');

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 }
});

module.exports = { upload, buildStoragePath, storageBase, tempDir };