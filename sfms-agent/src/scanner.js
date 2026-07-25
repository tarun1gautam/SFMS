const fs = require('fs');
const path = require('path');
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
          });
        }
      } catch (_) { /* file vanished mid-scan — skip */ }
    }
  }
}

function scanRecent(days = 7) {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const folders = getFolders();

  const found = [];
  for (const { path: folderPath } of folders) {
    if (fs.existsSync(folderPath)) {
      walkDir(folderPath, cutoffMs, found);
    }
  }

  upsertIndexedFiles(found);
  return found;
}

module.exports = { scanRecent };