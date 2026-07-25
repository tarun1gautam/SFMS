const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getFolders, upsertIndexedFiles } = require('./db');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '$Recycle.Bin', 'AppData',
  'System Volume Information', 'Windows',
  'Program Files', 'Program Files (x86)', 'dist', 'build',
]);

function shouldSkip(dirName) {
  return SKIP_DIRS.has(dirName);
}

function walkDir(dirPath, cutoffMs, results) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkip(entry.name)) continue;
      walkDir(fullPath, cutoffMs, results);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs >= cutoffMs) {
          results.push({
            file_path: fullPath,
            file_name: entry.name,
            size_bytes: stat.size,
            modified_at: stat.mtime.toISOString(),
            file_hash: null, // filled in below by hashFilesWithConcurrency
          });
        }
      } catch (_) { /* file vanished mid-scan — skip */ }
    }
  }
}

// ── Content hashing ──────────────────────────────────────────────────────
// Computed AFTER the directory walk (which stays fully synchronous/fast),
// so a slow disk hashing pass never blocks the tree traversal itself.

const MAX_HASH_BYTES = 250 * 1024 * 1024; // skip hashing anything bigger than this
                                           // so one huge video/archive can't stall
                                           // the whole scan — those files are still
                                           // listed, just without dedup info.
const HASH_CONCURRENCY = 6;               // parallel hash workers

function hashFile(filePath) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', () => resolve(null)); // unreadable / vanished mid-hash — skip silently
  });
}

async function hashFilesWithConcurrency(files, concurrency) {
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      if (file.size_bytes > 0 && file.size_bytes <= MAX_HASH_BYTES) {
        file.file_hash = await hashFile(file.file_path);
      }
      // else: left as null — too large (or empty) to hash economically
    }
  }

  const workerCount = Math.min(concurrency, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function scanRecent(days = 7) {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const folders = getFolders();

  const found = [];
  for (const { path: folderPath } of folders) {
    if (fs.existsSync(folderPath)) {
      walkDir(folderPath, cutoffMs, found);
    }
  }

  await hashFilesWithConcurrency(found, HASH_CONCURRENCY);

  upsertIndexedFiles(found);
  return found;
}

module.exports = { scanRecent };