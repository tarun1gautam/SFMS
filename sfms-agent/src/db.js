const fs = require('fs');
const path = require('path');
const os = require('os');

const appDataDir = path.join(process.env.APPDATA || os.homedir(), 'SFMS');
if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });

const dbFilePath = path.join(appDataDir, 'sfms_local.json');

function loadData() {
  if (!fs.existsSync(dbFilePath)) {
    return { watched_folders: [], indexed_files: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
  } catch (err) {
    console.error('Corrupt local DB, resetting:', err.message);
    return { watched_folders: [], indexed_files: {} };
  }
}

function saveData(data) {
  // Write to a temp file then rename — avoids leaving a half-written,
  // corrupt JSON file behind if the process is killed mid-write.
  const tempPath = dbFilePath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, dbFilePath);
}

// ── Folders ──────────────────────────────────────────────────
function getFolders() {
  return loadData().watched_folders;
}

function addFolder(folderPath) {
  const data = loadData();
  if (data.watched_folders.some(f => f.path === folderPath)) {
    const err = new Error('UNIQUE constraint failed');
    throw err;
  }
  data.watched_folders.push({
    id: Date.now(),
    path: folderPath,
    added_at: new Date().toISOString(),
  });
  saveData(data);
}

function removeFolder(folderPath) {
  const data = loadData();
  const before = data.watched_folders.length;
  data.watched_folders = data.watched_folders.filter(f => f.path !== folderPath);
  saveData(data);
  return before - data.watched_folders.length; // number removed (0 or 1)
}

// ── Indexed files ────────────────────────────────────────────
function upsertIndexedFiles(files) {
  const data = loadData();
  for (const f of files) {
    data.indexed_files[f.file_path] = {
      ...f,
      scanned_at: new Date().toISOString(),
    };
  }
  saveData(data);
}

function getIndexedFiles() {
  return Object.values(loadData().indexed_files);
}

module.exports = {
  getFolders,
  addFolder,
  removeFolder,
  upsertIndexedFiles,
  getIndexedFiles,
};