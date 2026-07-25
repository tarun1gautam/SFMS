// scripts/backfillHashes.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // MUST be first, before requiring ../config/db

const pool = require('../config/db');
const fs = require('fs');
const crypto = require('crypto');
const { storageBase } = require('../config/multer');

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

(async () => {
  const { rows } = await pool.query('SELECT id, file_path FROM files WHERE file_hash IS NULL');
  console.log(`Backfilling ${rows.length} files...`);
  for (const row of rows) {
    const fullPath = path.join(storageBase, row.file_path);
    if (!fs.existsSync(fullPath)) { console.warn(`Missing on disk: ${row.file_path}`); continue; }
    try {
      const hash = await hashFile(fullPath);
      await pool.query('UPDATE files SET file_hash = $1 WHERE id = $2', [hash, row.id]);
    } catch (err) {
      console.error(`Failed hashing ${row.id}:`, err.message);
    }
  }
  console.log('Done.');
  process.exit(0);
})();