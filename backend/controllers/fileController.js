/**
 * fileController.js  (SFMS — Production Concurrent Upload Edition)
 *
 * What changed from the original:
 *  1. uploadFile      — wrapped in uploadQueue.enqueue() so concurrent uploads
 *                       never exhaust RAM/CPU; OCR/text-extract runs inside the
 *                       queue slot so heavy work is serialised safely.
 *  2. uploadFileBatch — NEW endpoint: accepts up to 50 files in one POST;
 *                       each file gets its own queue slot (independent progress).
 *  3. All other handlers (listFiles, downloadFile, deleteFile, togglePin,
 *     editFile, getStats, checkCollision, getUploaders) are 100% unchanged.
 *
 * Queue behaviour:
 *  • Up to MAX_CONCURRENT_UPLOADS (default 20) run in parallel.
 *  • Any excess waits in a FIFO queue.
 *  • The client receives real-time Socket.io events:
 *      upload_queue_position  { fileName, position, total }
 *      upload_queue_started   { fileName }
 *      upload_queue_stats     { active, waiting, maxConcurrent }
 */

'use strict';

const path       = require('path');
const fs         = require('fs');
const fsPromises = require('fs').promises;
const pool       = require('../config/db');
const jwt        = require('jsonwebtoken');
const mammoth    = require('mammoth');
const pdfParse   = require('pdf-parse');
const Tesseract  = require('tesseract.js');
const pdfjsLib   = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');
const xlsx       = require('xlsx');
const { buildStoragePath, storageBase } = require('../config/multer');
const uploadQueue = require('../queues/uploadQueue');

// ─── Helpers ────────────────────────────────────────────────────────────────

const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

const deriveSharedLabel = (visibility, targetUsers) => {
  if (visibility === 'public') return ['Public'];
  if (Array.isArray(targetUsers) && targetUsers.length > 0) return targetUsers;
  return ['—'];
};

// ─── Text extraction (unchanged from original) ──────────────────────────────

const LIMITS = {
  TEXT_CHAR_COUNT: 20000,
  PDF_MAX_PAGES:   20,
  IMAGE_MAX_SIZE_MB: 15,
};

function readStreamCapped(filePath, maxChars) {
  return new Promise((resolve, reject) => {
    let result = '';
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    stream.on('data', (chunk) => {
      const remaining = maxChars - result.length;
      if (remaining <= 0) { stream.destroy(); return; }
      result += chunk.slice(0, remaining);
      if (result.length >= maxChars) stream.destroy();
    });
    stream.on('close', () => resolve(result));
    stream.on('error', reject);
  });
}

async function extractTextFromPath(filePath, mimeType) {
  try {
    const stat          = await fsPromises.stat(filePath);
    const fileSizeBytes = stat.size;

    if (mimeType === 'text/plain' || mimeType === 'application/json' || mimeType.startsWith('text/'))
      return await readStreamCapped(filePath, LIMITS.TEXT_CHAR_COUNT);

    if (mimeType === 'application/pdf') {
      const MAX_PDF_BYTES = 500 * 1024 * 1024;
      if (fileSizeBytes > MAX_PDF_BYTES) return '';
      const buf  = await fsPromises.readFile(filePath);
      const data = await pdfParse(buf, { max: LIMITS.PDF_MAX_PAGES });
      if (!data.text || data.text.trim().length < 50)
        return await performLocalOCR(filePath, true);
      return data.text.substring(0, LIMITS.TEXT_CHAR_COUNT);
    }

    if (mimeType.includes('officedocument.wordprocessingml')) {
      const MAX_DOCX_BYTES = 200 * 1024 * 1024;
      if (fileSizeBytes > MAX_DOCX_BYTES) return '';
      const buf    = await fsPromises.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value.substring(0, LIMITS.TEXT_CHAR_COUNT);
    }

    if (mimeType.includes('spreadsheetml') || mimeType === 'text/csv') {
      const MAX_XLSX_BYTES = 200 * 1024 * 1024;
      if (fileSizeBytes > MAX_XLSX_BYTES) return '';
      const buf      = await fsPromises.readFile(filePath);
      const workbook = xlsx.read(buf, { type: 'buffer' });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      const csv      = xlsx.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
      return csv.split('\n').slice(0, 50).join('\n').substring(0, LIMITS.TEXT_CHAR_COUNT);
    }

    if (mimeType.startsWith('image/')) {
      if (fileSizeBytes > LIMITS.IMAGE_MAX_SIZE_MB * 1024 * 1024)
        return 'Image too large for OCR processing.';
      return await performLocalOCR(filePath, false);
    }

    return '';
  } catch (err) {
    console.error('extractTextFromPath error:', err);
    return '';
  }
}

async function performLocalOCR(filePath, isPdf = false) {
  try {
    let imagesToProcess = [];
    if (isPdf) {
      const tmpDir = path.resolve('./temp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const pdfData  = new Uint8Array(await fsPromises.readFile(filePath));
      const pdfDoc   = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const numPages = Math.min(pdfDoc.numPages, LIMITS.PDF_MAX_PAGES);
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page     = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas   = createCanvas(viewport.width, viewport.height);
          const context  = canvas.getContext('2d');
          await page.render({ canvasContext: context, viewport }).promise;
          const pngPath = path.join(tmpDir, `ocr_${Date.now()}_page${pageNum}.png`);
          await fsPromises.writeFile(pngPath, canvas.toBuffer('image/png'));
          imagesToProcess.push(pngPath);
          page.cleanup();
        } catch (_) {}
      }
      if (imagesToProcess.length === 0) return '';
    } else {
      imagesToProcess = [filePath];
    }

    let fullText = '';
    for (const src of imagesToProcess) {
      try {
        const { data: { text } } = await Tesseract.recognize(src, 'eng', { logger: () => {} });
        fullText += text + '\n';
      } catch (_) {}
      finally {
        if (isPdf) { try { fs.unlinkSync(src); } catch (_) {} }
      }
      if (fullText.length > LIMITS.TEXT_CHAR_COUNT) break;
    }
    return fullText.substring(0, LIMITS.TEXT_CHAR_COUNT);
  } catch (err) {
    console.error('OCR pipeline error:', err);
    return '';
  }
}

// ─── Collision Check (unchanged) ────────────────────────────────────────────

const checkCollision = async (req, res) => {
  try {
    const { filename } = req.query;
    const userBasePath = req.user.base_path || '/';
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const result = await pool.query(
      `SELECT file_path, upload_timestamp, uploaded_by, file_size, virtual_path
       FROM files
       WHERE file_name = $1
         AND (virtual_path LIKE $2 OR virtual_path = '/public/')
       LIMIT 1`,
      [filename.trim(), `${userBasePath}%`]
    );

    const exists = result.rows.length > 0;
    const response = { exists };
    if (exists) {
      const { upload_timestamp, uploaded_by, file_size, virtual_path: foundPath } = result.rows[0];
      response.fileDetails = { uploadTimestamp: upload_timestamp, uploadedBy: uploaded_by, filesize: file_size, foundInFolder: foundPath };
    }
    res.json(response);
  } catch (err) {
    console.error('Collision check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Core upload logic (extracted so queue can call it) ──────────────────────

async function processUpload(req, file, body) {
  const tempFilePath = file.path;
  try {
    const {
      visibility          = 'public',
      description         = '',
      target_users        = '[]',
      conflict_resolution,
      virtual_path,
      shared_label:        sharedLabelRaw,
    } = body;

    const mimeType    = file.mimetype;
    const extractedText = await extractTextFromPath(tempFilePath, mimeType);

    if (visibility === 'private' && (!target_users || JSON.parse(target_users).length === 0))
      throw Object.assign(new Error('select one target user'), { statusCode: 400 });

    if (visibility === 'public' && virtual_path !== '/public/')
      throw Object.assign(new Error('public files must be uploaded in public folder'), { statusCode: 400 });

    if (virtual_path && !virtual_path.endsWith('/'))
      throw Object.assign(new Error('Path must end with a forward slash (/)'), { statusCode: 400 });

    const parsedTargetUsers = JSON.parse(target_users);
    let parsedSharedLabel;
    if (sharedLabelRaw) {
      try { parsedSharedLabel = JSON.parse(sharedLabelRaw); }
      catch { parsedSharedLabel = [sharedLabelRaw]; }
    } else {
      parsedSharedLabel = deriveSharedLabel(visibility, parsedTargetUsers);
    }

    const targetDir  = buildStoragePath(storageBase);
    const ext        = path.extname(file.originalname);
    const baseName   = path.basename(file.originalname, ext);

    const existingResult = await pool.query(
      'SELECT file_path FROM files WHERE original_name = $1 LIMIT 1',
      [file.originalname.trim()]
    );

    let finalFileName, finalFilePath;

    if (conflict_resolution === 'replace') {
      const dbRelativePath = existingResult.rows[0]?.file_path;
      if (dbRelativePath) {
        await pool.query('DELETE FROM files WHERE file_path = $1', [dbRelativePath]);
        const oldPhysical = path.join(storageBase, dbRelativePath);
        if (fs.existsSync(oldPhysical)) fs.unlinkSync(oldPhysical);
      }
      finalFileName = file.originalname;
      finalFilePath = path.join(targetDir, finalFileName);
    } else if (conflict_resolution === 'rename') {
      let counter = 1, candidateName, dbCheck;
      do {
        candidateName = `${baseName}_(${counter})${ext}`;
        dbCheck = await pool.query('SELECT 1 FROM files WHERE file_name = $1 LIMIT 1', [candidateName]);
        counter++;
      } while (dbCheck.rows.length > 0);
      finalFileName = candidateName;
      finalFilePath = path.join(targetDir, finalFileName);
    } else {
      finalFileName = `${baseName}${ext}`;
      finalFilePath = path.join(targetDir, finalFileName);
    }

    // Move temp → final
    try {
      fs.renameSync(tempFilePath, finalFilePath);
    } catch (moveErr) {
      // Cross-device link (temp & storage on different filesystems) — copy+delete
      fs.copyFileSync(tempFilePath, finalFilePath);
      fs.unlinkSync(tempFilePath);
    }

    const relativePath     = path.relative(storageBase, finalFilePath);
    const finalTargetUsers = Array.isArray(parsedTargetUsers) ? parsedTargetUsers : [];
    const finalSharedLabel = Array.isArray(parsedSharedLabel) ? parsedSharedLabel :
                             (parsedSharedLabel ? [parsedSharedLabel] : []);

    const result = await pool.query(
      `INSERT INTO files
         (file_name, original_name, file_path, file_size, mime_type,
          uploaded_by, uploader_ip, visibility, target_users, shared_label,
          description, virtual_path, content_raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        finalFileName, file.originalname, relativePath, file.size, file.mimetype,
        req.user.user_id, getClientIp(req), visibility,
        finalTargetUsers, finalSharedLabel, description, virtual_path, extractedText,
      ]
    );

    return result.rows[0];
  } catch (err) {
    // Clean up temp file on any error
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }
    throw err;
  }
}

// ─── Single-file upload (original route, now queue-aware) ───────────────────

const uploadFile = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const socketId = req.headers['x-socket-id'] || null;

  try {
    const fileRow = await uploadQueue.enqueue(
      { userId: req.user.user_id, socketId, fileName: req.file.originalname },
      () => processUpload(req, req.file, req.body)
    );

    if (req.io) {
      req.io.emit('file_uploaded', { file: fileRow, uploader: req.user.user_id });
    }
    res.status(201).json({ file: fileRow });
  } catch (err) {
    if (err.message === 'Upload queue is full. Please try again shortly.')
      return res.status(503).json({ error: err.message, retryAfterSeconds: 30 });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// ─── Batch upload (NEW) ──────────────────────────────────────────────────────

/**
 * POST /api/files/upload-batch
 *
 * Accepts multipart/form-data with field name "files" (up to 50 files).
 * Each file is queued individually so progress can be tracked per-file.
 *
 * Returns:
 *  {
 *    results: [
 *      { status: 'fulfilled', fileName: '...', file: { ...dbRow } },
 *      { status: 'rejected',  fileName: '...', error: '...' },
 *    ]
 *  }
 */
const uploadFileBatch = async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0)
    return res.status(400).json({ error: 'No files uploaded' });

  const socketId = req.headers['x-socket-id'] || null;

  // Kick off all files concurrently — the queue controls actual parallelism
  const promises = files.map((file) =>
    uploadQueue
      .enqueue(
        { userId: req.user.user_id, socketId, fileName: file.originalname },
        () => processUpload(req, file, req.body)
      )
      .then((row) => ({ status: 'fulfilled', fileName: file.originalname, file: row }))
      .catch((err) => ({ status: 'rejected',  fileName: file.originalname, error: err.message }))
  );

  const results = await Promise.all(promises);

  const successes = results.filter(r => r.status === 'fulfilled');

  if (req.io && successes.length > 0) {
    successes.forEach(r =>
      req.io.emit('file_uploaded', { file: r.file, uploader: req.user.user_id })
    );
  }

  const httpStatus = results.every(r => r.status === 'rejected') ? 500
                   : results.some(r  => r.status === 'rejected') ? 207   // Multi-Status
                   : 201;

  res.status(httpStatus).json({ results });
};

// ─── Queue stats endpoint ────────────────────────────────────────────────────

const getQueueStats = (_req, res) => {
  res.json(uploadQueue.stats());
};

// ─── All original handlers below — ZERO changes ─────────────────────────────

const listFiles = async (req, res) => {
  try {
    const userId      = req.user.user_id;
    const isAdmin     = req.user.role === 'admin';
    const userBasePath = req.user.base_path || '/';
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const search      = (req.query.search      || '').trim();
    const searchField = (req.query.search_field || 'name').toLowerCase();
    const sortMap = {
      name: 'f.file_name', upload_date: 'f.upload_timestamp',
      size: 'f.file_size', type: 'f.mime_type', uploader: 'f.uploaded_by',
      visibility: 'f.visibility', last_modified: 'f.last_modified',
    };
    const sortCol   = sortMap[req.query.sort] || null;
    const sortOrder = (req.query.order || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const isContentSearch = searchField === 'content' && !!search;
    const selectClause = isContentSearch
      ? `SELECT f.*, ts_rank(f.content_vector, websearch_to_tsquery('english', $1)) AS rank`
      : `SELECT f.*`;
    const filterVisibility = req.query.filterVisibility || '';
    const filterType       = req.query.filterType       || '';
    const filterUploader   = req.query.filterUploader   || '';
    const filterDateFrom   = req.query.filterDateFrom   || '';
    const filterDateTo     = req.query.filterDateTo     || '';
    const filterSizeMin    = req.query.filterSizeMin ? parseInt(req.query.filterSizeMin) : null;
    const filterSizeMax    = req.query.filterSizeMax ? parseInt(req.query.filterSizeMax) : null;
    const conditions = [], params = [];
    params.push(`${userBasePath}%`);
    const pathCondition = `f.virtual_path LIKE $${params.length}`;
    if (isAdmin) {
      conditions.push(pathCondition);
    } else {
      params.push(userId);
      const uid = params.length;
      conditions.push(`(
        (${pathCondition})
        OR f.visibility = 'public'
        OR f.uploaded_by = $${uid}
        OR (
          (f.visibility = 'private' OR f.visibility = 'group')
          AND (cardinality(f.target_users) = 0 OR $${uid} = ANY(f.target_users))
        )
      )`);
    }
    if (search) {
      const term = `%${search}%`;
      if (searchField === 'content') {
        params.push(search);
        conditions.push(`f.content_vector @@ websearch_to_tsquery('english', $${params.length})`);
      } else if (searchField === 'id') {
        params.push(search);
        conditions.push(`f.id::text = $${params.length}`);
      } else if (searchField === 'uploader') {
        params.push(term);
        conditions.push(`f.uploaded_by ILIKE $${params.length}`);
      } else if (searchField === 'shared') {
        params.push(search.toLowerCase());
        conditions.push(`EXISTS (SELECT 1 FROM unnest(f.shared_label) AS sl WHERE lower(sl) LIKE '%' || $${params.length} || '%')`);
      } else {
        params.push(term);
        conditions.push(`(f.file_name ILIKE $${params.length} OR f.original_name ILIKE $${params.length})`);
      }
    }
    if (filterVisibility) { params.push(filterVisibility); conditions.push(`f.visibility = $${params.length}`); }
    if (filterType) {
      const mimeMap = { pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml', pptx:'application/vnd.openxmlformats-officedocument.presentationml', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', svg:'image/svg', mp4:'video/mp4', mp3:'audio/mpeg', zip:'application/zip', rar:'application/x-rar', txt:'text/plain', csv:'text/csv', json:'application/json', image:'image/', video:'video/', audio:'audio/', text:'text/', archive:'application/zip' };
      const mimeFragment = mimeMap[filterType.toLowerCase()] || filterType;
      params.push(`%${mimeFragment}%`);
      conditions.push(`f.mime_type ILIKE $${params.length}`);
    }
    if (filterUploader) { params.push(filterUploader); conditions.push(`f.uploaded_by = $${params.length}`); }
    if (filterDateFrom) { params.push(filterDateFrom); conditions.push(`f.upload_timestamp >= $${params.length}::timestamptz`); }
    if (filterDateTo)   { params.push(filterDateTo);   conditions.push(`f.upload_timestamp <= ($${params.length}::date + INTERVAL '1 day - 1 second')::timestamptz`); }
    if (filterSizeMin !== null) { params.push(filterSizeMin); conditions.push(`f.file_size >= $${params.length}`); }
    if (filterSizeMax !== null) { params.push(filterSizeMax); conditions.push(`f.file_size <= $${params.length}`); }
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    let orderClause;
    if (sortCol) orderClause = `ORDER BY ${sortCol} ${sortOrder}`;
    else if (isContentSearch) orderClause = 'ORDER BY rank DESC';
    else orderClause = 'ORDER BY f.is_pinned DESC, f.upload_timestamp DESC';
    const countResult = await pool.query(`SELECT COUNT(*) FROM files f ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    const filesResult = await pool.query(
      `${selectClause} FROM files f ${whereClause} ${orderClause} LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json({ files: filesResult.rows, pagination: { total, page, limit, totalPages: Math.ceil(total/limit) } });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const token = req.query.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId  = decoded.user_id;
    const isAdmin = decoded.role === 'admin';
    const result  = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    if (!isAdmin) {
      const stringUserId     = String(userId).trim();
      const stringUploadedBy = String(file.uploaded_by).trim();
      const fileVisibility   = String(file.visibility || '').toLowerCase();
      const isTargeted       = Array.isArray(file.target_users) && file.target_users.some(id => String(id).trim() === stringUserId);
      const canAccess        = fileVisibility === 'public' || fileVisibility === 'directory' || stringUploadedBy === stringUserId || isTargeted;
      if (!canAccess) return res.status(403).json({ error: 'Access denied' });
    }
    const fullPath = path.join(storageBase, file.file_path);
    if (!fullPath.startsWith(storageBase))  return res.status(403).json({ error: 'Invalid path' });
    if (!fs.existsSync(fullPath))           return res.status(404).json({ error: 'File not found on disk' });
    await pool.query('INSERT INTO download_logs (file_id, user_id, downloader_ip) VALUES ($1,$2,$3)', [fileId, userId, getClientIp(req)]);
    await pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [fileId]);
    const stat     = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range    = req.headers.range;
    const mode     = req.query.mode === 'view' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${mode}; filename="${encodeURIComponent(file.file_name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    const isMedia = file.mime_type?.startsWith('video/') || file.mime_type?.startsWith('audio/');
    let readStream;
    if (isMedia && range) {
      const parts    = range.replace(/bytes=/, '').split('-');
      const start    = parseInt(parts[0], 10);
      const end      = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': file.mime_type });
      readStream = fs.createReadStream(fullPath, { start, end });
    } else {
      res.setHeader('Content-Length', fileSize);
      readStream = fs.createReadStream(fullPath);
    }
    readStream.pipe(res);
    readStream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    console.error('Download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    const result  = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    if (!isAdmin && file.uploaded_by !== userId) return res.status(403).json({ error: 'Not authorized' });
    const fullPath = path.join(storageBase, file.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await pool.query('DELETE FROM files WHERE id = $1', [fileId]);
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const togglePin = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    const result  = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    if (!isAdmin && file.uploaded_by !== userId) return res.status(403).json({ error: 'Not authorized' });
    const updated = await pool.query('UPDATE files SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING *', [fileId]);
    res.json({ file: updated.rows[0] });
  } catch (err) {
    console.error('Pin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const editFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { file_name, visibility, description, original_name, file_path, target_users } = req.body;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    const result  = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    if (!isAdmin && file.uploaded_by !== userId) return res.status(403).json({ error: 'Not authorized' });
    let sharedlabel;
    const postgretargetuser = `{${target_users.map(u => `"${u}"`).join(',')}}`;
    if (visibility === 'public') { sharedlabel = '{"Public"}'; }
    else { sharedlabel = postgretargetuser; }
    const oldPhysicalPath = path.join(storageBase, file.file_path);
    const newPhysicalPath = path.join(storageBase, file_path);
    if (fs.existsSync(oldPhysicalPath)) fs.renameSync(oldPhysicalPath, newPhysicalPath);
    const updated = await pool.query(
      `UPDATE files SET file_name=$1,visibility=$2,original_name=$3,description=$4,file_path=$5,shared_label=$6,target_users=$7 WHERE id=$8 RETURNING *`,
      [file_name, visibility, original_name, description, file_path, sharedlabel, postgretargetuser, fileId]
    );
    res.json({ file: updated.rows[0] });
  } catch (err) {
    console.error('Edit file error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getStats = async (req, res) => {
  try {
    const [totalFiles, totalSize, topDownload] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM files'),
      pool.query('SELECT COALESCE(SUM(file_size),0) AS total FROM files'),
      pool.query(`SELECT file_name,original_name,download_count FROM files WHERE upload_timestamp > NOW()-INTERVAL '7 days' ORDER BY download_count DESC LIMIT 1`),
    ]);
    res.json({
      totalFiles:        parseInt(totalFiles.rows[0].count),
      totalStorageBytes: parseInt(totalSize.rows[0].total),
      topDownloadedFile: topDownload.rows[0] || null,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getUploaders = async (req, res) => {
  try {
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    let query, params = [];
    if (isAdmin) {
      query = `SELECT DISTINCT uploaded_by FROM files ORDER BY uploaded_by ASC`;
    } else {
      params = [userId];
      query = `SELECT DISTINCT uploaded_by FROM files WHERE (visibility='public' OR uploaded_by=$1 OR (visibility='private' AND $1=ANY(target_users)) OR (visibility='group' AND $1=ANY(target_users))) ORDER BY uploaded_by ASC`;
    }
    const result = await pool.query(query, params);
    res.json({ uploaders: result.rows.map(r => r.uploaded_by) });
  } catch (err) {
    console.error('Uploaders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  uploadFile,
  uploadFileBatch,
  getQueueStats,
  listFiles,
  downloadFile,
  deleteFile,
  togglePin,
  getStats,
  checkCollision,
  getUploaders,
  editFile,
};
