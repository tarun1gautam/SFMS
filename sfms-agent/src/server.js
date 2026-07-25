const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getFolders, addFolder, removeFolder } = require('./db');
const { scanRecent } = require('./scanner');
const { uploadSelected } = require('./upload');

const app = express();
app.use(cors({
  origin: '*', // Allow requests from http://10.43.8.136
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());

function setupAutoStart() {
  // Only execute when running on Windows
  if (process.platform !== 'win32') return;

  // process.execPath gets the path of SFMS_Agent.exe when compiled
  const exePath = process.execPath; 

  // Option 1: Add to Windows Registry (Silent Auto-Start)
  const regCommand = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "SFMS_Agent" /t REG_SZ /d "${exePath}" /f`;
  
  exec(regCommand, (error) => {
    if (!error) {
      console.log('✅ SFMS Agent registered in Windows Startup Registry!');
    }
  });

  // Option 2: Copy to Startup Folder (Fallback)
  try {
    const startupDir = path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs\\Startup');
    const targetPath = path.join(startupDir, 'SFMS_Agent.exe');

    // Only copy if running as compiled binary and not already in Startup folder
    if (exePath.endsWith('.exe') && exePath !== targetPath && !fs.existsSync(targetPath)) {
      fs.copyFileSync(exePath, targetPath);
      console.log('✅ SFMS Agent copied to Windows Startup folder!');
    }
  } catch (err) {
    // Ignore permissions or existing file errors
  }
}

// Call function at agent boot
setupAutoStart();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/api/folders', (req, res) => {
  res.json({ folders: getFolders() });
});

app.post('/api/folders', (req, res) => {
  const { path: folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'path is required' });

  try {
    addFolder(folderPath);
    res.status(201).json({ message: 'Folder added' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Folder already being watched' });
    }
    res.status(500).json({ error: 'Failed to add folder' });
  }
});

app.delete('/api/folders', (req, res) => {
  const { path: folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'path is required' });

  const removedCount = removeFolder(folderPath);
  if (removedCount === 0) return res.status(404).json({ error: 'Folder not found' });
  res.json({ message: 'Folder removed' });
});

// NOTE: scanRecent() is now async (it streams + hashes every matched file
// before returning), so this route MUST await it. Forgetting the `await`
// here would silently send back a Promise instead of the files array.
app.get('/api/scan-recent', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  try {
    const files = await scanRecent(days);
    res.json({ days, count: files.length, files });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/read-file?path=<absolute path>
// Streams a single file's raw bytes back to the browser so it can be turned
// into a real File object (via response.blob()) and handed to the existing
// UploadModal, reusing all of its collision/progress/resolution logic.
//
// SECURITY: only files inside a currently-watched folder may be read. This
// prevents any arbitrary local webpage from asking the Agent (which listens
// on localhost:9001) to read unrelated files off the user's disk.
// ─────────────────────────────────────────────────────────────────────────
app.get('/api/read-file', (req, res) => {
  const requestedPath = req.query.path;
  if (!requestedPath) {
    return res.status(400).json({ error: 'path is required' });
  }

  let resolvedPath;
  try {
    resolvedPath = path.resolve(requestedPath);
  } catch {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const watched = getFolders(); // e.g. [{ id, path }, ...]
  const isInsideWatchedFolder = watched.some(f => {
    const folderResolved = path.resolve(f.path);
    // ensure resolvedPath is the folder itself or nested inside it,
    // guarding against partial-prefix false positives (e.g. /docs vs /docs2)
    return resolvedPath === folderResolved ||
           resolvedPath.startsWith(folderResolved + path.sep);
  });

  if (!isInsideWatchedFolder) {
    return res.status(403).json({ error: 'File is outside watched folders' });
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);

    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', (streamErr) => {
      console.error('Read-file stream error:', streamErr);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to read file' });
    });
    stream.pipe(res);
  });
});

app.post('/api/upload-selected', async (req, res) => {
  const { filePaths, extra, authToken } = req.body;
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return res.status(400).json({ error: 'filePaths (array) is required' });
  }

  try {
    const results = await uploadSelected(filePaths, extra || {}, authToken);
    res.json({ results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Call function at agent boot
setupAutoStart();
registerProtocolHandler();

(async () => {
  if (await isPortInUse(PORT)) {
    console.log('SFMS Agent is already running — exiting this duplicate launch.');
    process.exit(0);
  }
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`SFMS Agent running at http://localhost:${PORT}`);
  });
})();