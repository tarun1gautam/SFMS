const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { tempDir } = require('../config/multer');

const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const cleanupTempFiles = () => {
  try {
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > TEMP_FILE_MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (err) {
        // File may have already been deleted
      }
    }

    if (deleted > 0) {
      console.log(`🧹 Cleanup: removed ${deleted} orphaned temp file(s)`);
    }
  } catch (err) {
    console.error('Cleanup cron error:', err);
  }
};

const startCleanupCron = () => {
  // Run at 2 AM every day
  cron.schedule('0 2 * * *', () => {
    console.log('🧹 Running scheduled temp file cleanup...');
    cleanupTempFiles();
  });

  // Also run once on startup
  cleanupTempFiles();
  console.log('⏰ Cleanup cron job scheduled (daily at 2 AM)');
};

module.exports = { startCleanupCron, cleanupTempFiles };