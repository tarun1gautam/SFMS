'use strict';

const path       = require('path');
const fs         = require('fs');
const fsPromises = require('fs').promises;
const pool       = require('../config/db');
const { isInDownloadOnlyZone } = require('../utils/downloadOnlyZone');
const { isDownloadOnlyRestrictedForUser } = require('../utils/downloadOnlyZone');
const crypto     = require('crypto');
const jwt        = require('jsonwebtoken');
const mammoth    = require('mammoth');
const pdfParse   = require('pdf-parse');
const Tesseract  = require('tesseract.js');
const pdfjsLib   = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas, loadImage } = require('canvas');
const { PDFDocument } = require('pdf-lib');
const xlsx       = require('xlsx');
const { buildStoragePath, storageBase } = require('../config/multer');
const uploadQueue = require('../queues/uploadQueue');
const archiver   = require('archiver');
const { logAction } = require('../utils/auditLogger');
const PptxParser = require("node-pptx-parser").default;
const JSZip = require('jszip');
const libre = require("libreoffice-convert");
const os = require('os');

const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

const deriveSharedLabel = (visibility, targetUsers) => {
  if (visibility === 'public') return ['Public'];
  if (Array.isArray(targetUsers) && targetUsers.length > 0) return targetUsers;
  return ['—'];
};

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

// Add this helper near the top of the file
function sanitizeForPostgres(text) {
  if (!text) return text;
  // Postgres text columns cannot store the null byte (\u0000) at all —
  // even though it's valid UTF-8, libpq/the server rejects it outright.
  // Also strip other C0 control characters except newline/tab, which are
  // occasionally left behind by OCR or malformed PDF/DOCX text streams.
  return text.replace(/\u0000/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

async function extractTextFromPath(filePath, mimeType) {
  try {
    const stat          = await fsPromises.stat(filePath);
    const fileSizeBytes = stat.size;
    let extracted = '';

    if (mimeType === 'text/plain' || mimeType === 'application/json' || mimeType.startsWith('text/')) {
      extracted = await readStreamCapped(filePath, LIMITS.TEXT_CHAR_COUNT);

    } else if (mimeType === 'application/pdf') {
      const MAX_PDF_BYTES = 500 * 1024 * 1024;
      if (fileSizeBytes > MAX_PDF_BYTES) return '';
      const buf  = await fsPromises.readFile(filePath);
      const data = await pdfParse(buf, { max: LIMITS.PDF_MAX_PAGES });
      if (!data.text || data.text.trim().length < 50) {
        extracted = await performLocalOCR(filePath, true);
      } else {
        extracted = data.text.substring(0, LIMITS.TEXT_CHAR_COUNT);
      }

    } else if (mimeType.includes('officedocument.wordprocessingml')) {
      const MAX_DOCX_BYTES = 200 * 1024 * 1024;
      if (fileSizeBytes > MAX_DOCX_BYTES) return '';
      const buf    = await fsPromises.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer: buf });
      extracted = result.value.substring(0, LIMITS.TEXT_CHAR_COUNT);

    } else if (mimeType.includes('spreadsheetml') || mimeType === 'text/csv') {
      const MAX_XLSX_BYTES = 200 * 1024 * 1024;
      if (fileSizeBytes > MAX_XLSX_BYTES) return '';
      const buf      = await fsPromises.readFile(filePath);
      const workbook = xlsx.read(buf, { type: 'buffer' });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      const csv      = xlsx.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
      extracted = csv.split('\n').slice(0, 50).join('\n').substring(0, LIMITS.TEXT_CHAR_COUNT);

    }else if (mimeType.includes('presentationml') || mimeType === 'application/vnd.ms-powerpoint') {
      const MAX_PPTX_BYTES = 200 * 1024 * 1024;
      if (fileSizeBytes > MAX_PPTX_BYTES) return '';

      const parser = new PptxParser(filePath);
      const slideData = await parser.extractText();

      // Flatten slide array into a single text string
      const rawText = slideData
        .map(slide => (Array.isArray(slide.text) ? slide.text.join('\n') : slide.text || ''))
        .join('\n\n');

      extracted = rawText.substring(0, LIMITS.TEXT_CHAR_COUNT);

    } else if (mimeType.startsWith('image/')) {
      if (fileSizeBytes > LIMITS.IMAGE_MAX_SIZE_MB * 1024 * 1024) {
        return 'Image too large for OCR processing.';
      }
      extracted = await performLocalOCR(filePath, false);
    }

    return sanitizeForPostgres(extracted);
  } catch (err) {
    console.error('extractTextFromPath error:', err);
    return '';
  }
}

async function renderThumbnail(input, isPdf = false) {
  try {
    const MAX_DIM = 200;
    let sourceImage;

    if (isPdf) {
      const pdfData = typeof input === 'string'
        ? new Uint8Array(await fsPromises.readFile(input))
        : new Uint8Array(input);

      const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
      if (!pdfDoc || pdfDoc.numPages < 1) return null;

      const page = await pdfDoc.getPage(1);
      const highResViewport = page.getViewport({ scale: 2.0 });

      const pdfCanvas = createCanvas(highResViewport.width, highResViewport.height);
      const pdfCtx = pdfCanvas.getContext('2d');
      await page.render({ canvasContext: pdfCtx, viewport: highResViewport }).promise;
      page.cleanup();

      sourceImage = pdfCanvas;
    } else {
      sourceImage = await loadImage(input);
    }

    if (!sourceImage || !sourceImage.width || !sourceImage.height) {
      return null;
    }

    const w = sourceImage.width;
    const h = sourceImage.height;
    const scale = Math.min(MAX_DIM / w, MAX_DIM / h, 1);
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = createCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceImage, 0, 0, targetW, targetH);

    return canvas.toDataURL('image/png');
  } catch (err) {
    return null;
  }
}

async function generateThumbnail(filePath, mimeType) {
  let tempPdfPath = null;
  console.log(`\n--- [Thumbnail Generator Start] ---`);
  console.log(`Target File Path: "${filePath}"`);
  console.log(`Provided MIME Type: "${mimeType}"`);

  try {
    if (!filePath) {
      console.error('[Error]: No filePath provided.');
      return null;
    }

    const ext = path.extname(filePath).toLowerCase();
    console.log(`Detected Extension: "${ext}"`);

    const blacklisted = /\.(exe|dll|msi|apk|zip|rar|7z|tar|gz|bat|cmd|sh|bin|jar|iso)$/i;
    if (blacklisted.test(ext)) {
      console.warn(`[Blocked]: File extension "${ext}" is blacklisted.`);
      return null;
    }

    const isImage = (mimeType && mimeType.startsWith('image/')) || /\.(jpg|jpeg|png|gif|bmp|webp|tiff?)$/i.test(ext);
    const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
    const isOffice = /\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(ext) || [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ].includes(mimeType);

    console.log(`Detected Type Flags -> Image: ${isImage}, PDF: ${isPdf}, Office: ${isOffice}`);

    if (isImage) {
      console.log('[Step]: Routing to renderThumbnail for Image...');
      const result = await renderThumbnail(filePath, false);
      console.log('[Success]: Image thumbnail generated.');
      return result;
    }

    if (isPdf) {
      console.log('[Step]: Routing to renderThumbnail for PDF...');
      const result = await renderThumbnail(filePath, true);
      console.log('[Success]: PDF thumbnail generated.');
      return result;
    }

    if (isOffice) {
      console.log('[Step 1/4]: Reading office file buffer from disk...');
      const fileBuffer = await fsPromises.readFile(filePath);
      console.log(`[Step 1/4 Completed]: File read successfully (${fileBuffer.length} bytes).`);

      console.log('[Step 2/4]: Invoking LibreOffice conversion to PDF...');
      const pdfBuffer = await new Promise((resolve, reject) => {
        libre.convert(fileBuffer, '.pdf', undefined, (err, done) => {
          if (err) {
            console.error('[LibreOffice Error]: Conversion process failed.', err);
            reject(err);
          } else {
            console.log('[Step 2/4 Completed]: LibreOffice PDF conversion successful.');
            resolve(done);
          }
        });
      });

      tempPdfPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.pdf`);
      console.log(`[Step 3/4]: Writing converted PDF to temp location: ${tempPdfPath}`);
      await fsPromises.writeFile(tempPdfPath, pdfBuffer);
      console.log('[Step 3/4 Completed]: Temp PDF written.');

      console.log('[Step 4/4]: Rendering thumbnail from converted temp PDF...');
      const result = await renderThumbnail(tempPdfPath, true);
      console.log('[Success]: Office document thumbnail generated successfully.');
      return result;
    }

    console.warn('[Warning]: File type did not match Image, PDF, or Office criteria.');
    return null;
  } catch (err) {
    console.error('=== [THUMBNAIL GENERATION FAILED] ===');
    console.error('Error Details:', err);
    return null;
  } finally {
    if (tempPdfPath) {
      try {
        await fsPromises.unlink(tempPdfPath);
        console.log(`[Cleanup]: Deleted temp file ${tempPdfPath}`);
      } catch (cleanupErr) {
        console.error(`[Cleanup Error]: Could not delete temp file ${tempPdfPath}`, cleanupErr);
      }
    }
    console.log(`--- [Thumbnail Generator End] ---\n`);
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

const checkCollision = async (req, res) => {
  try {
    const { filename, folder_id } = req.query;
    const userBasePath = req.user.base_path || '/';
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const result = await pool.query(
      `SELECT file_path, upload_timestamp, uploaded_by, file_size, f.visibility, vf.folder_name
       FROM files f
       JOIN virtual_folders vf ON vf.folder_id::text = f.virtual_path
       WHERE file_name = $1
         AND f.virtual_path = $2
         AND (
       regexp_replace(vf.full_path, '%2F', '/', 'gi') LIKE $3
       OR LOWER(vf.visibility) = 'public'
     )
       LIMIT 1`,
      [filename.trim(), folder_id, `${userBasePath}%`]
    );

    const exists = result.rows.length > 0;
    const response = { exists };
    if (exists) {
      const { upload_timestamp, uploaded_by, file_size, file_vis ,folder_name } = result.rows[0];
      response.fileDetails = { uploadTimestamp: upload_timestamp, uploadedBy: uploaded_by, filesize: file_size, filevis: file_vis, foundInFolder: folder_name };
    }
    res.json(response);
  } catch (err) {
    console.error('Collision check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function processUpload(req, file, body) { 
  const tempFilePath = file.path;
  try {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const {
      visibility          = 'public',
      description         = '',
      target_users        = '[]',
      conflict_resolution,
      virtual_path,
      folder_path,
      shared_label:        sharedLabelRaw,
    } = body;

    const mimeType    = file.mimetype;
    const extractedText = await extractTextFromPath(tempFilePath, mimeType);
    const fileHash = await computeFileHash(tempFilePath);
    const thumbnailDataUrl = await generateThumbnail(tempFilePath, mimeType);

    if (folder_path === "/") {
  throw Object.assign(new Error('Uploading files directly to the root folder is not allowed.'), { statusCode: 400 });
}

// const folderRow = await pool.query('SELECT full_path FROM virtual_folders WHERE folder_id::text = $1', [virtual_path]);
//   if (folderRow.rows[0] && await isInDownloadOnlyZone(decodeURIComponent(folderRow.rows[0].full_path))) {
//     throw Object.assign(new Error('This folder is in download-only mode — uploads are disabled here.'), { statusCode: 403 });
//   }

const folderRow = await pool.query('SELECT full_path FROM virtual_folders WHERE folder_id::text = $1', [virtual_path]);
if (folderRow.rows[0]) {
  const decodedPath = decodeURIComponent(folderRow.rows[0].full_path);
  const restricted = await isDownloadOnlyRestrictedForUser(
    decodedPath,
    req.user.user_id,
    req.user.role === 'admin'
  );
  if (restricted) {
    await logAction({ req, action: 'file.upload_blocked', targetType: 'folder', targetId: virtual_path, status: 'failure', metadata: { reason: 'download-only zone' } });
    throw Object.assign(new Error('This folder is in download-only mode — uploads are disabled here.'), { statusCode: 403 });
  }
}

if (visibility === 'private')
      throw Object.assign(new Error('Private file uploading disable'), { statusCode: 400 });

    if (visibility === 'private' && (!target_users || JSON.parse(target_users).length === 0))
      throw Object.assign(new Error('select one target user'), { statusCode: 400 });

    // if (visibility === 'public' && virtual_path !== '77820e7c-e8ca-4467-8f43-9c131c7fb722')
    //   throw Object.assign(new Error('public files must be uploaded in public folder'), { statusCode: 400 });

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
      `SELECT file_path
       FROM files
       WHERE original_name = $1
         AND virtual_path = $2
         AND (LOWER(visibility) = 'public' OR uploaded_by = $3)
       LIMIT 1`,
      [file.originalname.trim(), virtual_path, req.user.user_id]
    );
    const uniqueSuffix     = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const physicalFileName = `${baseName}_${uniqueSuffix}${ext}`;
    let   finalFilePath    = path.join(targetDir, physicalFileName);
    let finalFileName;

    if (conflict_resolution === 'replace') {
      const ownerCheck = await pool.query(
    `SELECT uploaded_by FROM files WHERE file_name = $1 AND virtual_path = $2 LIMIT 1`,
    [filename, folder_id]
      );
      if (ownerCheck.rows[0]?.uploaded_by !== req.user.id) {
          return res.status(403).json({ error: 'You can only replace files you uploaded.' });
      }
      const dbRelativePath = existingResult.rows[0]?.file_path;
      if (dbRelativePath) {
        await pool.query('DELETE FROM files WHERE file_path = $1', [dbRelativePath]);
        const oldPhysical = path.join(storageBase, dbRelativePath);
        if (fs.existsSync(oldPhysical)) fs.unlinkSync(oldPhysical);
      }
      finalFileName = file.originalname;

    } else if (conflict_resolution === 'rename') {
      let counter = 1, candidateName, dbCheck;
      do {
        candidateName = `${baseName}_(${counter})${ext}`;
        dbCheck = await pool.query(
          `SELECT 1 FROM files
           WHERE file_name = $1
             AND virtual_path = $2
             AND (LOWER(visibility) = 'public' OR uploaded_by = $3)
           LIMIT 1`,
          [candidateName, virtual_path, req.user.user_id]
        );
        counter++;
      } while (dbCheck.rows.length > 0);
      finalFileName = candidateName;

    } else {
      finalFileName = file.originalname;
    }
    try {
      fs.renameSync(tempFilePath, finalFilePath);
    } catch (moveErr) {
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
      description, virtual_path, content_raw, file_hash, thumbnail)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, $15)
   RETURNING *`,
  [
    finalFileName, file.originalname, relativePath, file.size, file.mimetype,
    req.user.user_id, getClientIp(req), visibility,
    finalTargetUsers, finalSharedLabel, description, virtual_path, extractedText, fileHash,thumbnailDataUrl,
  ]
);

await logAction({
  req, action: 'file.upload', targetType: 'file', targetId: result.rows[0].id, targetLabel: finalFileName,
  metadata: { size: file.size, mimeType: file.mimetype, visibility, virtual_path, conflict_resolution: conflict_resolution || 'none' }
});

    return result.rows[0];
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }
    throw err;
  }
}

const uploadFile = async (req, res) => {
  if (!req.file) {
    if (res && typeof res.status === 'function') {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    throw Object.assign(new Error('No file uploaded'), { statusCode: 400 });
  }

  const socketId = req.headers?.['x-socket-id'] || null;

  try {
    const fileRow = await uploadQueue.enqueue(
      { userId: req.user.user_id, socketId, fileName: req.file.originalname },
      () => processUpload(req, req.file, req.body)
    );

    if (req.io) {
      req.io.emit('file_uploaded', { file: fileRow, uploader: req.user.user_id });
    }

    // Check if res exists and is an Express response object
    if (res && typeof res.status === 'function') {
      return res.status(201).json({ file: fileRow });
    }

    // Return the result directly if called non-HTTP / programmatically
    return fileRow;

  } catch (err) {
    if (res && typeof res.status === 'function') {
      if (err.message === 'Upload queue is full. Please try again shortly.') {
        return res.status(503).json({ error: err.message, retryAfterSeconds: 30 });
      }
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    }

    // Re-throw for background queue worker / background services
    throw err;
  }
};

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

const getQueueStats = (_req, res) => {
  res.json(uploadQueue.stats());
};

const listFiles = async (req, res) => {
  try {
    const userId       = req.user.user_id;          // varchar, e.g. "parwinder"
    const isAdmin      = req.user.role === 'admin';
    const userBasePath = req.user.base_path || '/';
    const folder_id    = (req.query.folder_id && req.query.folder_id !== 'null') 
      ? req.query.folder_id 
      : null;
    const search      = (req.query.search      || '').trim();
    const searchField = (req.query.search_field || 'name').toLowerCase();
    const isSearchMode = !!search;

    if (!folder_id) {
      return res.status(200).json({ 
        files: [], 
        pagination: { total: 0, page: 1, limit: 100, totalPages: 0 },
        meta: { isSearchMode: false, searchField: null }
      });
    }

    // ── 1. PRE-CHECK FOR FOLDER SCOPE & PERMISSIONS (NON-SEARCH) ───────────
    if (folder_id && !isAdmin && !isSearchMode) {
      // Check if folder exists and verify if the user has access directly, via path, or via shared ancestor
      const folderCheck = await pool.query(
        `SELECT 
           vf.full_path, 
           vf.visibility, 
           vf.target_users, 
           u.user_id AS created_by_user_id,
           EXISTS (
             SELECT 1 FROM virtual_folders anc
             WHERE LOWER(anc.visibility) = 'public'
               AND anc.target_users @> ARRAY[$2]::text[]
               AND regexp_replace(vf.full_path, '%2F', '/', 'gi')
                   LIKE regexp_replace(anc.full_path, '%2F', '/', 'gi') || '%'
           ) AS is_inside_shared_ancestor
         FROM virtual_folders vf
         LEFT JOIN users u ON u.id = vf.created_by
         WHERE vf.folder_id::text = $1`,
        [folder_id, userId]
      );

      // 1. Folder must exist
      if (folderCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const folder = folderCheck.rows[0];
      const decodedFullPath = decodeURIComponent(folder.full_path);

      let targetUserscheck = [];
      try {
        targetUserscheck = typeof folder?.target_users === 'string' 
          ? JSON.parse(folder.target_users) 
          : (folder?.target_users || []);
      } catch (e) {
        console.error("Failed to parse target_users:", e);
      }

      const isOwner            = folder.created_by_user_id === userId;
      const isPublic           = folder.visibility?.toLowerCase() === 'public';
      const isTargeted         = Array.isArray(targetUserscheck) && targetUserscheck.includes(userId);
      const isInsideSharedTree = folder.is_inside_shared_ancestor;

      // 2. Scope check: Folder must be within user's base_path, public directory, shared view, or part of a shared tree
      const isInScope = (
        decodedFullPath.startsWith(userBasePath) ||
        decodedFullPath.startsWith('/public/') ||
        decodedFullPath.startsWith('/shared/') ||
        isTargeted ||
        isInsideSharedTree
      );

      if (!isInScope) {
        return res.status(403).json({ error: 'Access denied: folder out of scope' });
      }

      // 3. Permission check: User must be owner, folder must be public, explicitly targeted, or inside a shared tree
      if (!isOwner && !isPublic && !isTargeted && !isInsideSharedTree) {
        return res.status(403).json({ error: 'Access denied: insufficient folder permissions' });
      }
    }

    const page      = Math.max(1, parseInt(req.query.page)  || 1);
    const limit     = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset    = (page - 1) * limit;
    const sortMap   = {
      name          : 'f.file_name',
      upload_date   : 'f.upload_timestamp',
      size          : 'f.file_size',
      type          : 'f.mime_type',
      uploader      : 'f.uploaded_by',
      visibility    : 'f.visibility',
      last_modified : 'f.last_modified',
    };
    const sortCol   = sortMap[req.query.sort] || null;
    const sortOrder = (req.query.order || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const isContentSearch = searchField === 'content' && !!search;

    const selectClause = isContentSearch
  ? `SELECT f.id, f.file_name, f.original_name, f.file_path, f.file_size, f.mime_type,
     f.uploaded_by, f.uploader_ip, f.visibility, f.target_users, f.is_pinned,
     f.download_count, f.upload_timestamp, f.last_modified, f.shared_label,
     f.description, f.virtual_path,
     regexp_replace(vf.full_path, '%2F', '/', 'gi') AS vvirtual_path,
     vf.folder_name AS vvirtual_name,
     ts_rank(f.content_vector, websearch_to_tsquery('english', $1)) AS rank`
  : `SELECT f.id, f.file_name, f.original_name, f.file_path, f.file_size, f.mime_type,
     f.uploaded_by, f.uploader_ip, f.visibility, f.target_users, f.is_pinned,
     f.download_count, f.upload_timestamp, f.last_modified, f.shared_label,
     f.description, f.virtual_path,
     regexp_replace(vf.full_path, '%2F', '/', 'gi') AS vvirtual_path,
     vf.folder_name AS vvirtual_name`;
     
    // const selectClause = isContentSearch
    //   ? `SELECT f.id, f.file_name, f.original_name, f.file_path, f.file_size, f.mime_type,
    //      f.uploaded_by, f.uploader_ip, f.visibility, f.target_users, f.is_pinned,
    //      f.download_count, f.upload_timestamp, f.last_modified, f.shared_label,
    //      f.description, f.virtual_path,
    //      regexp_replace(vf.full_path, '%2F', '/', 'gi') AS vvirtual_path,
    //      vf.folder_name AS vvirtual_name,
    //      ts_rank(f.content_vector, websearch_to_tsquery('english', $1)) AS rank`
    //   : `SELECT f.id, f.file_name, f.original_name, f.file_path, f.file_size, f.mime_type,
    //      f.uploaded_by, f.uploader_ip, f.visibility, f.target_users, f.is_pinned,
    //      f.download_count, f.upload_timestamp, f.last_modified, f.shared_label,
    //      f.description, f.virtual_path,
    //      regexp_replace(vf.full_path, '%2F', '/', 'gi') AS vvirtual_path,
    //      vf.folder_name AS vvirtual_name`;

    const filterVisibility = req.query.filterVisibility || '';
    const filterType       = req.query.filterType       || '';
    const filterUploader   = req.query.filterUploader   || '';
    const filterDateFrom   = req.query.filterDateFrom   || '';
    const filterDateTo     = req.query.filterDateTo     || '';
    const filterSizeMin    = req.query.filterSizeMin ? parseInt(req.query.filterSizeMin) : null;
    const filterSizeMax    = req.query.filterSizeMax ? parseInt(req.query.filterSizeMax) : null;
    const conditions = [], params = [];

    // ── 2. QUERY CONDITIONS FOR SEARCH AND NORMAL BROWSE ────────────────────
    if (isSearchMode) {
      // Search within current folder's subtree only
      params.push(folder_id);          // $N — current folder being browsed
      const pCurrentFolder = params.length;

      let pUid;
if (!isAdmin) {
  params.push(userId); // Only push $2 if user is NOT an admin
  pUid = params.length;
}

      conditions.push(`
      EXISTS (
        SELECT 1
        FROM virtual_folders vf
        LEFT JOIN users u ON u.id = vf.created_by
        WHERE
          vf.folder_id::text = f.virtual_path

          -- Folder must be current folder OR a subfolder under it
          AND (
            vf.folder_id::text = $${pCurrentFolder}
            OR vf.parent_path LIKE (
              SELECT
                regexp_replace(
                  regexp_replace(full_path, '%2F', '/', 'gi'),
                '%20', ' ', 'gi')
                || '%'
              FROM virtual_folders
              WHERE folder_id::text = $${pCurrentFolder}
            )
          )

          -- 🔒 Folder-level access check (supports shared root & subfolders)
          AND (
            ${isAdmin ? 'TRUE' : `
            LOWER(vf.visibility) = 'public'
            OR u.user_id = $${pUid}
            OR $${pUid} = ANY(vf.target_users)
            OR EXISTS (
              SELECT 1 FROM virtual_folders anc
              WHERE LOWER(anc.visibility) = 'public'
                AND anc.target_users @> ARRAY[$${pUid}]::text[]
                AND regexp_replace(vf.full_path, '%2F', '/', 'gi')
                    LIKE regexp_replace(anc.full_path, '%2F', '/', 'gi') || '%'
            )
            `}
          )
      )

      -- File-level access check
      -- File-level access check
AND (
  ${isAdmin ? 'TRUE' : `
  f.visibility = 'public'
  OR f.uploaded_by = $${pUid}
  OR cardinality(f.target_users) = 0
  OR $${pUid} = ANY(f.target_users)
  `}
)
    `);
    } else {
      if (folder_id) {
        params.push(folder_id);
        const folderIdx = params.length;

        if (isAdmin) {
          conditions.push(`f.virtual_path = $${folderIdx}`);
        } else {
          params.push(userId);
          const uid = params.length;

          conditions.push(`(
            f.virtual_path = $${folderIdx}
            AND (
              f.visibility = 'public'                                   -- open to everyone
              OR f.visibility = 'directory'                            -- open to anyone who can browse this folder
              OR f.uploaded_by = $${uid}                                -- owner can always see their own
              OR (
                (f.visibility = 'private' OR f.visibility = 'group')   -- restricted tier
                AND $${uid} = ANY(f.target_users)
              )
            )
          )`);
        }
      } else {
        params.push(`${userBasePath}%`);
        const pathCondition = `f.virtual_path LIKE $${params.length}`;

        if (isAdmin) {
          conditions.push(pathCondition);
        } else {
          params.push(userId);
          const uid = params.length;
          conditions.push(`(
            ${pathCondition}
            AND (
              f.visibility = 'public'
              OR f.visibility = 'directory'
              OR f.uploaded_by = $${uid}
              OR (
                (f.visibility = 'private' OR f.visibility = 'group')
                AND $${uid} = ANY(f.target_users)
              )
            )
          )`);
        }
      }
    }

    // ── 3. SEARCH TERM CONDITIONS ─────────────────────────────────────────
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
        conditions.push(`EXISTS (
          SELECT 1 FROM unnest(f.shared_label) AS sl 
          WHERE lower(sl) LIKE '%' || $${params.length} || '%'
        )`);

      } else if (searchField === 'description') {
        params.push(term);
        conditions.push(`f.description ILIKE $${params.length}`);
      } else {
        params.push(term);
        conditions.push(`(f.file_name ILIKE $${params.length} OR f.original_name ILIKE $${params.length})`);
      }
    }

    // ── 4. FILTER CONDITIONS ──────────────────────────────────────────────
    if (filterVisibility) {
      params.push(filterVisibility);
      conditions.push(`f.visibility = $${params.length}`);
    }

    if (filterType) {
      const mimeMap = {
        pdf    : 'application/pdf',
        docx   : 'application/vnd.openxmlformats-officedocument.wordprocessingml',
        xlsx   : 'application/vnd.openxmlformats-officedocument.spreadsheetml',
        pptx   : 'application/vnd.openxmlformats-officedocument.presentationml',
        jpg    : 'image/jpeg',
        jpeg   : 'image/jpeg',
        png    : 'image/png',
        gif    : 'image/gif',
        svg    : 'image/svg',
        mp4    : 'video/mp4',
        mp3    : 'audio/mpeg',
        zip    : 'application/zip',
        rar    : 'application/x-rar',
        txt    : 'text/plain',
        csv    : 'text/csv',
        json   : 'application/json',
        image  : 'image/',
        video  : 'video/',
        audio  : 'audio/',
        text   : 'text/',
        archive: 'application/zip',
      };
      const mimeFragment = mimeMap[filterType.toLowerCase()] || filterType;
      params.push(`%${mimeFragment}%`);
      conditions.push(`f.mime_type ILIKE $${params.length}`);
    }

    if (filterUploader) {
      params.push(filterUploader);
      conditions.push(`f.uploaded_by = $${params.length}`);
    }

    if (filterDateFrom) {
      params.push(filterDateFrom);
      conditions.push(`f.upload_timestamp >= $${params.length}::timestamptz`);
    }

    if (filterDateTo) {
      params.push(filterDateTo);
      conditions.push(`f.upload_timestamp <= ($${params.length}::date + INTERVAL '1 day - 1 second')::timestamptz`);
    }

    if (filterSizeMin !== null) {
      params.push(filterSizeMin);
      conditions.push(`f.file_size >= $${params.length}`);
    }

    if (filterSizeMax !== null) {
      params.push(filterSizeMax);
      conditions.push(`f.file_size <= $${params.length}`);
    }

    // ── 5. BUILD AND EXECUTE FINAL QUERY ──────────────────────────────────
    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    let orderClause;
    if (sortCol)             orderClause = `ORDER BY ${sortCol} ${sortOrder}`;
    else if (isContentSearch) orderClause = 'ORDER BY rank DESC';
    else                    orderClause = 'ORDER BY f.is_pinned DESC, f.upload_timestamp DESC';

    const countResult = await pool.query(
      `SELECT COUNT(*) 
       FROM files f 
       LEFT JOIN virtual_folders vf ON vf.folder_id::text = f.virtual_path
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const filesResult = await pool.query(
      `${selectClause} 
       FROM files f 
       LEFT JOIN virtual_folders vf ON vf.folder_id::text = f.virtual_path
       ${whereClause} ${orderClause} 
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      files: filesResult.rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      meta: { isSearchMode, searchField: isSearchMode ? searchField : null }
    });

  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getFileThumbnail = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT thumbnail FROM files WHERE id = $1 LIMIT 1',
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].thumbnail) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    const base64Data = result.rows[0].thumbnail;

    // Optional cache control for instant subsequent loads
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // If data URL format (e.g. data:image/png;base64,...)
    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(';base64,');
      const mime = parts[0].replace('data:', '');
      const imgBuf = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', mime);
      return res.send(imgBuf);
    }

    return res.json({ thumbnail: base64Data });
  } catch (err) {
    console.error('Thumbnail fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch thumbnail' });
  }
};

// POST /api/files/:fileId/download-token
const generateDownloadToken = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { duration = '24h' } = req.body;

    // Restrict duration options
    const allowedDurations = ['1h', '6h', '12h', '24h', '7d'];
    if (!allowedDurations.includes(duration)) {
      return res.status(400).json({ error: 'Invalid duration specified' });
    }

    // req.user comes from your main login authentication middleware
    const userId = req.user.user_id || req.user.id;

    // Generate token valid ONLY for file download
    const downloadToken = jwt.sign(
      {
        userId,
        fileId,
        purpose: 'FILE_DOWNLOAD_ONLY'
      },
      process.env.JWT_SECRET,
      { expiresIn: duration }
    );

    const downloadUrl = `${req.protocol}://${req.get('host')}/api/files/download/${fileId}?token=${downloadToken}`;

    res.json({
      downloadToken,
      expiresIn: duration,
      downloadUrl
    });
  } catch (err) {
    console.error('Error generating download token:', err);
    res.status(500).json({ error: 'Failed to generate download token' });
  }
};

const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const token = req.query.token || req.headers.authorization?.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'No token provided' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Download token has expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Identify user ID and Admin status based on token type
    let userId;
    let isAdmin = false;

    if (decoded.purpose === 'FILE_DOWNLOAD_ONLY') {
      // Validating dynamic scoped download token
      if (String(decoded.fileId) !== String(fileId)) {
        return res.status(403).json({ error: 'Token is not valid for this file' });
      }
      userId = decoded.userId;
    } else {
      // Validating standard login user session token
      userId = decoded.user_id || decoded.userId || decoded.id;
      isAdmin = decoded.role === 'admin';
    }

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];

    // Access control checks
    if (!isAdmin) {
      const stringUserId = String(userId).trim();
      const stringUploadedBy = String(file.uploaded_by).trim();
      const fileVisibility = String(file.visibility || '').toLowerCase();
      const isTargeted = Array.isArray(file.target_users) && file.target_users.some(id => String(id).trim() === stringUserId);
      const canAccess = fileVisibility === 'public' || fileVisibility === 'directory' || stringUploadedBy === stringUserId || isTargeted;
      
      if (!canAccess) return res.status(403).json({ error: 'Access denied' });
    }

    const fullPath = path.join(storageBase, file.file_path);
    if (!fullPath.startsWith(storageBase)) return res.status(403).json({ error: 'Invalid path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found on disk' });

    await pool.query('INSERT INTO download_logs (file_id, user_id, downloader_ip) VALUES ($1,$2,$3)', [fileId, userId, getClientIp(req)]);
    await pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [fileId]);
    await logAction({ actorOverride: userId, action: 'file.download', targetType: 'file', targetId: fileId, targetLabel: file.file_name });

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mode = req.query.mode === 'view' ? 'inline' : 'attachment';

    res.setHeader('Content-Disposition', `${mode}; filename="${encodeURIComponent(file.file_name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');

    const isMedia = file.mime_type?.startsWith('video/') || file.mime_type?.startsWith('audio/');
    let readStream;

    if (isMedia && range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': file.mime_type
      });
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
    console.error('Download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
};

// const downloadFile = async (req, res) => {
//   try {
//     const { fileId } = req.params;
//     const token = req.query.token || req.headers.authorization?.split(' ')[1];
//     if (!token) return res.status(401).json({ error: 'No token provided' });
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const userId  = decoded.user_id;
//     const isAdmin = decoded.role === 'admin';
//     const result  = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
//     if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
//     const file = result.rows[0];
//     if (!isAdmin) {
//       const stringUserId     = String(userId).trim();
//       const stringUploadedBy = String(file.uploaded_by).trim();
//       const fileVisibility   = String(file.visibility || '').toLowerCase();
//       const isTargeted       = Array.isArray(file.target_users) && file.target_users.some(id => String(id).trim() === stringUserId);
//       const canAccess        = fileVisibility === 'public' || fileVisibility === 'directory' || stringUploadedBy === stringUserId || isTargeted;
//       if (!canAccess) return res.status(403).json({ error: 'Access denied' });
//     }
//     const fullPath = path.join(storageBase, file.file_path);
//     if (!fullPath.startsWith(storageBase))  return res.status(403).json({ error: 'Invalid path' });
//     if (!fs.existsSync(fullPath))           return res.status(404).json({ error: 'File not found on disk' });
//     await pool.query('INSERT INTO download_logs (file_id, user_id, downloader_ip) VALUES ($1,$2,$3)', [fileId, userId, getClientIp(req)]);
//     await pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [fileId]);
//     await logAction({ actorOverride: userId, action: 'file.download', targetType: 'file', targetId: fileId, targetLabel: file.file_name });
//     const stat     = fs.statSync(fullPath);
//     const fileSize = stat.size;
//     const range    = req.headers.range;
//     const mode     = req.query.mode === 'view' ? 'inline' : 'attachment';
//     res.setHeader('Content-Disposition', `${mode}; filename="${encodeURIComponent(file.file_name)}"`);
//     res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
//     const isMedia = file.mime_type?.startsWith('video/') || file.mime_type?.startsWith('audio/');
//     let readStream;
//     if (isMedia && range) {
//       const parts    = range.replace(/bytes=/, '').split('-');
//       const start    = parseInt(parts[0], 10);
//       const end      = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
//       const chunksize = end - start + 1;
//       res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': file.mime_type });
//       readStream = fs.createReadStream(fullPath, { start, end });
//     } else {
//       res.setHeader('Content-Length', fileSize);
//       readStream = fs.createReadStream(fullPath);
//     }
//     readStream.pipe(res);
//     readStream.on('error', (err) => {
//       console.error('Stream error:', err);
//       if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
//     });
//   } catch (err) {
//     if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
//     console.error('Download error:', err);
//     if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
//   }
// };

const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId  = req.user.user_id;
    const userID = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const result  = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    let isSourceFolderOwner = false;
if (file.virtual_path) {
  const srcFolderRes = await pool.query('SELECT * FROM virtual_folders WHERE folder_id = $1', [file.virtual_path]);
  if (srcFolderRes.rows.length > 0) {
    // Check if logged-in user owns the source folder
    isSourceFolderOwner = srcFolderRes.rows[0].created_by === userID;
  }
}
    if (!isAdmin && file.uploaded_by !== userId && !isSourceFolderOwner) return res.status(403).json({ error: 'Not authorized' });
    const fullPath = path.join(storageBase, file.file_path);
    // if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    if (fs.existsSync(fullPath)) {
      const start = process.hrtime.bigint();
      fs.unlinkSync(fullPath);
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1_000_000;
      console.log(`[deleteFile] unlink took ${ms.toFixed(2)}ms for ${fullPath}`);
    }
    await pool.query('DELETE FROM files WHERE id = $1', [fileId]);
    await logAction({ req, action: 'file.delete', targetType: 'file', targetId: fileId, targetLabel: file.file_name, metadata: { size: file.file_size } });
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteMultipleFiles = async (req, res) => {
  try {
    const { fileIds } = req.body;
    const userId  = req.user.user_id;
    const userID  = req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }

    // 1. Fetch all requested files in a single query instead of a loop
    const filesRes = await pool.query('SELECT * FROM files WHERE id = ANY($1)', [fileIds]);
    const filesMap = new Map(filesRes.rows.map(f => [f.id, f]));

    // 2. Extract unique source folders and fetch them all at once
    const folderIds = [...new Set(filesRes.rows.map(f => f.virtual_path).filter(Boolean))];
    let folderOwners = new Map();
    if (folderIds.length > 0) {
      const foldersRes = await pool.query('SELECT folder_id, created_by FROM virtual_folders WHERE folder_id = ANY($1)', [folderIds]);
      folderOwners = new Map(foldersRes.rows.map(f => [f.folder_id, f.created_by]));
    }

    const deleted = [];
    const skipped = [];

    // 3. Process authorizations and asynchronous file deletions
    for (const fileId of fileIds) {
      const file = filesMap.get(fileId);
      if (!file) {
        skipped.push({ fileId, reason: 'File not found' });
        continue;
      }

      const isSourceFolderOwner = folderOwners.get(file.virtual_path) === userID;
      const isFileOwner = file.uploaded_by === userId;

      if (!isAdmin && !isFileOwner && !isSourceFolderOwner) {
        skipped.push({ fileId, reason: 'Not authorized' });
        continue;
      }

      // Async unlinking (Non-blocking)
      const fullPath = path.join(storageBase, file.file_path);
      try {
        if (fs.existsSync(fullPath)) {
          await fsPromises.unlink(fullPath);
        }
      } catch (fsErr) {
        console.error(`Failed to delete disk file ${fullPath}:`, fsErr);
      }

      // DB Delete & Log
      await pool.query('DELETE FROM files WHERE id = $1', [fileId]);
      await logAction({
        req,
        action: 'file.delete',
        targetType: 'file',
        targetId: fileId,
        targetLabel: file.file_name,
        metadata: { size: file.file_size },
      });

      deleted.push(fileId);
    }

    res.json({
      message: `${deleted.length} file(s) deleted successfully`,
      deleted,
      skipped,
    });
  } catch (err) {
    console.error('Batch delete error:', err);
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
    await logAction({ req, action: 'file.pin_toggled', targetType: 'file', targetId: fileId, targetLabel: file.file_name, metadata: { isPinned: updated.rows[0].is_pinned } });
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
    const userID = req.user.id;
    const isAdmin = req.user.role === 'admin';

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    let isSourceFolderOwner = false;
if (file.virtual_path) {
  const srcFolderRes = await pool.query('SELECT * FROM virtual_folders WHERE folder_id = $1', [file.virtual_path]);
  if (srcFolderRes.rows.length > 0) {
    // Check if logged-in user owns the source folder
    isSourceFolderOwner = srcFolderRes.rows[0].created_by === userID;
  }
}
    if (!isAdmin && file.uploaded_by !== userId && !isSourceFolderOwner) return res.status(403).json({ error: 'Not authorized' });
    // const folderRow = await pool.query('SELECT full_path FROM virtual_folders WHERE folder_id::text = $1', [file.virtual_path]);
    // if (folderRow.rows[0] && await isInDownloadOnlyZone(decodeURIComponent(folderRow.rows[0].full_path))) {
    //   return res.status(403).json({ error: 'This file is in a download-only folder — editing is disabled here.' });
    // }

    const folderRow = await pool.query('SELECT full_path FROM virtual_folders WHERE folder_id::text = $1', [file.virtual_path]);
if (folderRow.rows[0]) {
  const decodedPath = decodeURIComponent(folderRow.rows[0].full_path);
  const restricted = await isDownloadOnlyRestrictedForUser(
    decodedPath,
    req.user.user_id,
    isAdmin
  );
  if (restricted) {
    return res.status(403).json({ error: 'This file is in a download-only folder — editing is disabled here.' });
  }
}

    // ── Server-side collision guard ─────────────────────────────────────
    // Never trust the frontend's pre-check alone — re-verify here, scoped
    // to the SAME folder this file lives in, excluding the file's own
    // row (so renaming "report.pdf" to itself, i.e. no-op, doesn't
    // falsely block on its own existing name).
    if (file_name && file_name.toLowerCase() !== file.file_name.toLowerCase()) {
      const dupeCheck = await pool.query(
        `SELECT 1 FROM files
         WHERE file_name = $1
           AND virtual_path = $2
           AND id != $3
           AND (LOWER(visibility) IN ('public', 'directory') OR uploaded_by = $4)
         LIMIT 1`,
        [file_name.trim(), file.virtual_path, fileId, userId]
      );
      if (dupeCheck.rows.length > 0) {
        return res.status(409).json({ error: 'A file with this name already exists in this folder.' });
      }
    }

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
    await logAction({
  req, action: 'file.edit', targetType: 'file', targetId: fileId, targetLabel: file_name,
  metadata: { oldName: file.file_name, newName: file_name, oldVisibility: file.visibility, newVisibility: visibility }
});
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

const getFilePath = async (fileId) => {
  const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
  if (!result.rows.length) throw new Error('File not found');
  return result.rows[0];
};

const imageToPdfBytes = async (imageBuffer, mimeType) => {
  const pdfDoc = await PDFDocument.create();
  const image  = mimeType.includes('png')
    ? await pdfDoc.embedPng(imageBuffer)
    : await pdfDoc.embedJpg(imageBuffer);
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return await pdfDoc.save();
};

const getPdfInfo = async (req, res) => {
  try {
    const file = await getFilePath(req.params.id);
    if (!file.mime_type?.includes('pdf'))
      return res.status(400).json({ error: 'File is not a PDF' });

    const fullPath = path.join(storageBase, file.file_path); // ← fix
    if (!fs.existsSync(fullPath))
      return res.status(404).json({ error: 'File not found on disk' });

    const bytes  = fs.readFileSync(fullPath);
    const pdfDoc = await PDFDocument.load(bytes);
    res.json({ pageCount: pdfDoc.getPageCount() });
  } catch (err) {
    console.error('getPdfInfo error:', err);
    res.status(500).json({ error: 'Could not read PDF info' });
  }
};

const splitPdf = async (req, res) => {
  try {
    const file     = await getFilePath(req.params.id);
    const fromPage = parseInt(req.body.fromPage);
    const toPage   = parseInt(req.body.toPage);

    if (!file.mime_type?.includes('pdf'))
      return res.status(400).json({ error: 'File is not a PDF' });

    const fullPath = path.join(storageBase, file.file_path);
    if (!fs.existsSync(fullPath))
      return res.status(404).json({ error: 'File not found on disk' });

    const bytes      = fs.readFileSync(fullPath);
    const sourcePdf  = await PDFDocument.load(bytes);
    const totalPages = sourcePdf.getPageCount();

    if (isNaN(fromPage) || isNaN(toPage) || fromPage < 1 || toPage > totalPages || fromPage > toPage)
      return res.status(400).json({ error: `Invalid range. PDF has ${totalPages} pages.` });

    const newPdf  = await PDFDocument.create();
    const indices = Array.from({ length: toPage - fromPage + 1 }, (_, i) => fromPage - 1 + i);

    // ✅ copyPages not copyPagesFromDocument
    const copied  = await newPdf.copyPages(sourcePdf, indices);
    copied.forEach(p => newPdf.addPage(p));

    const newBytes    = await newPdf.save();
    const ext         = path.extname(file.file_name);
    const baseName    = path.basename(file.file_name, ext);
    const newFileName = `${baseName}_pages${fromPage}-${toPage}${ext}`;
    const newFilePath = path.join(path.dirname(fullPath), newFileName);
    const newRelPath  = path.join(path.dirname(file.file_path), newFileName);

    fs.writeFileSync(newFilePath, newBytes);

    fs.writeFileSync(newFilePath, newBytes);
const newFileHash = crypto.createHash('sha256').update(newBytes).digest('hex'); // NEW — small buffer already in memory, no need to stream

await pool.query(
  `INSERT INTO files 
    (file_name, original_name, file_path, file_size, mime_type, uploaded_by,
     visibility, target_users, virtual_path, description, upload_timestamp, last_modified, file_hash)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),$11)`,
  [
    newFileName, newFileName, newRelPath,
    newBytes.length, file.mime_type, file.uploaded_by,
    file.visibility, file.target_users, file.virtual_path,
    `Split from "${file.file_name}" pages ${fromPage}–${toPage}`,
    newFileHash,
  ]
);
await logAction({ req, action: 'file.pdf_split', targetType: 'file', targetId: file.id, targetLabel: newFileName, metadata: { fromPage, toPage } });

    res.json({ message: `Pages ${fromPage}–${toPage} extracted as "${newFileName}"` });
  } catch (err) {
    console.error('splitPdf error:', err);
    res.status(500).json({ error: 'Split failed' });
  }
};

const mergePages = async (req, res) => {
  const tempPath = req.file?.path;
  try {
    const file     = await getFilePath(req.params.id);
    const mode     = req.body.mode || 'append';
    const insertAt = parseInt(req.body.insertAt) || 0;
    // console.log(req.user);

    const userId  = req.user.user_id;
    const userID  = req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!file.mime_type?.includes('pdf'))
      return res.status(400).json({ error: 'Target file is not a PDF' });
    if (!req.file)
      return res.status(400).json({ error: 'No file uploaded' });

    const fullPath      = path.join(storageBase, file.file_path); // ← fix
    if (!fs.existsSync(fullPath))
      return res.status(404).json({ error: 'File not found on disk' });

    // ── Check Folder Ownership ──────────────────────────────────────────
let isSourceFolderOwner = false;
if (file.virtual_path) {
  const srcFolderRes = await pool.query(
    'SELECT * FROM virtual_folders WHERE folder_id = $1',
    [file.virtual_path]
  );
  if (srcFolderRes.rows.length > 0) {
    isSourceFolderOwner = srcFolderRes.rows[0].created_by === userID;
  }
}

// ── Reject Unauthorized Users ───────────────────────────────────────
if (!isAdmin && file.uploaded_by !== userId && !isSourceFolderOwner) {
  return res.status(403).json({ error: 'Not authorized' });
}

// ── Restrict Edit in Download-Only Folders ──────────────────────────
if (file.virtual_path) {
  const folderRow = await pool.query(
    'SELECT full_path FROM virtual_folders WHERE folder_id::text = $1',
    [file.virtual_path]
  );
  if (folderRow.rows[0]) {
    const decodedPath = decodeURIComponent(folderRow.rows[0].full_path);
    const restricted  = await isDownloadOnlyRestrictedForUser(
      decodedPath,
      userId,
      isAdmin
    );
    if (restricted) {
      return res.status(403).json({
        error: 'This file is in a download-only folder — merging pages is disabled here.',
      });
    }
  }
}

    const existingBytes = fs.readFileSync(fullPath);
    const existingPdf   = await PDFDocument.load(existingBytes);
    const uploadedBytes = fs.readFileSync(tempPath);

    let newPdf;
    if (req.file.mimetype.startsWith('image/')) {
      const pdfBytes = await imageToPdfBytes(uploadedBytes, req.file.mimetype);
      newPdf = await PDFDocument.load(pdfBytes);
    } else {
      newPdf = await PDFDocument.load(uploadedBytes);
    }

    const count   = newPdf.getPageCount();
    const indices = Array.from({ length: count }, (_, i) => i);
    const copied  = await existingPdf.copyPages(newPdf, indices);

    if (mode === 'insert') {
      copied.reverse().forEach(p => existingPdf.insertPage(insertAt, p));
    } else {
      copied.forEach(p => existingPdf.addPage(p));
    }

    const mergedBytes = await existingPdf.save();
fs.writeFileSync(fullPath, mergedBytes);
const mergedHash = crypto.createHash('sha256').update(mergedBytes).digest('hex'); // NEW

await pool.query(
  `UPDATE files SET file_size = $1, file_hash = $2, last_modified = NOW() WHERE id = $3`,
  [mergedBytes.length, mergedHash, file.id]
);
await logAction({ req, action: 'file.pdf_merged', targetType: 'file', targetId: file.id, targetLabel: file.file_name, metadata: { mode, pageCount: existingPdf.getPageCount() } });

    res.json({ message: 'Pages merged successfully', pageCount: existingPdf.getPageCount(), fileSize: mergedBytes.length });
  } catch (err) {
    console.error('mergePages error:', err);
    res.status(500).json({ error: 'Merge failed' });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
};

const moveFiles = async (req, res) => {
  try {
    const { fileIds, target_folder_id } = req.body;
    const userId  = req.user.user_id;
    const userID = req.user.id;
    // console.log(userID);
    const isAdmin = req.user.role === 'admin';

    if (!Array.isArray(fileIds) || fileIds.length === 0)
      return res.status(400).json({ error: 'fileIds required' });
    if (!target_folder_id)
      return res.status(400).json({ error: 'target_folder_id required' });

    const folderRes = await pool.query('SELECT * FROM virtual_folders WHERE folder_id = $1', [target_folder_id]);
    if (folderRes.rows.length === 0) return res.status(404).json({ error: 'Target folder not found' });

    const moved = [], skipped = [];

    for (const fileId of fileIds) {
      const fRes = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
      if (fRes.rows.length === 0) { skipped.push({ fileId, reason: 'not found' }); continue; }
      const file = fRes.rows[0];
      // 1. Fetch current (source) folder to verify ownership
let isSourceFolderOwner = false;
if (file.virtual_path) {
  const srcFolderRes = await pool.query('SELECT * FROM virtual_folders WHERE folder_id = $1', [file.virtual_path]);
  if (srcFolderRes.rows.length > 0) {
    // Check if logged-in user owns the source folder
    isSourceFolderOwner = srcFolderRes.rows[0].created_by === userID;
  }
}

      if (!isAdmin && file.uploaded_by !== userId && !isSourceFolderOwner) {
        skipped.push({ fileId, reason: 'not authorized' }); continue;
      }
      if (file.virtual_path === target_folder_id) {
        skipped.push({ fileId, reason: 'already in this folder' }); continue;
      }

      const dupe = await pool.query(
        `SELECT 1 FROM files WHERE file_name = $1 AND virtual_path = $2 AND id != $3 LIMIT 1`,
        [file.file_name, target_folder_id, fileId]
      );
      if (dupe.rows.length > 0) {
        skipped.push({ fileId, reason: `"${file.file_name}" already exists in the destination folder` });
        continue;
      }

      await pool.query('UPDATE files SET virtual_path = $1, last_modified = NOW() WHERE id = $2', [target_folder_id, fileId]);
      await logAction({ req, action: 'file.move', targetType: 'file', targetId: fileId, targetLabel: file.file_name, metadata: { targetFolderId: target_folder_id } });
      moved.push(fileId);
    }

    res.json({ moved, skipped });
  } catch (err) {
    console.error('Move files error:', err);
    res.status(500).json({ error: 'Move failed' });
  }
};

const copyFiles = async (req, res) => {
  try {
    const { fileIds, target_folder_id } = req.body;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    if (!Array.isArray(fileIds) || fileIds.length === 0)
      return res.status(400).json({ error: 'fileIds required' });
    if (!target_folder_id)
      return res.status(400).json({ error: 'target_folder_id required' });

    const folderRes = await pool.query('SELECT * FROM virtual_folders WHERE folder_id = $1', [target_folder_id]);
    if (folderRes.rows.length === 0) return res.status(404).json({ error: 'Target folder not found' });

    const copied = [], skipped = [];

    for (const fileId of fileIds) {
      const fRes = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
      if (fRes.rows.length === 0) { skipped.push({ fileId, reason: 'not found' }); continue; }
      const file = fRes.rows[0];

      const isTargeted = Array.isArray(file.target_users) && file.target_users.includes(userId);
      const canAccess  = isAdmin || file.uploaded_by === userId || file.visibility === 'public'||file.visibility === "directory" || isTargeted;
      if (!canAccess) { skipped.push({ fileId, reason: 'not authorized' }); continue; }

      const oldPhysical = path.join(storageBase, file.file_path);
      if (!fs.existsSync(oldPhysical)) { skipped.push({ fileId, reason: 'missing on disk' }); continue; }

      const ext      = path.extname(file.file_name);
      const baseName = path.basename(file.file_name, ext);

      // Resolve a non-colliding logical name in the destination folder
      let candidateName = file.file_name;
      let counter = 1;
      while (true) {
        const dupe = await pool.query(
          `SELECT 1 FROM files WHERE file_name = $1 AND virtual_path = $2 LIMIT 1`,
          [candidateName, target_folder_id]
        );
        if (dupe.rows.length === 0) break;
        candidateName = `${baseName}_copy(${counter})${ext}`;
        counter++;
      }

      const targetDir      = buildStoragePath(storageBase);
      const uniqueSuffix    = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const newPhysicalName = `${baseName}_${uniqueSuffix}${ext}`;
      const newPhysicalPath = path.join(targetDir, newPhysicalName);

      fs.copyFileSync(oldPhysical, newPhysicalPath);
      const newRelPath = path.relative(storageBase, newPhysicalPath);

      const inserted = await pool.query(
  `INSERT INTO files
     (file_name, original_name, file_path, file_size, mime_type,
      uploaded_by, uploader_ip, visibility, target_users, shared_label,
      description, virtual_path, content_raw, file_hash)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
   RETURNING *`,
  [
    candidateName, file.original_name, newRelPath, file.file_size, file.mime_type,
    userId, getClientIp(req), file.visibility, file.target_users, file.shared_label,
    file.description, target_folder_id, file.content_raw, file.file_hash, // ← added
  ]
);
await logAction({ req, action: 'file.copy', targetType: 'file', targetId: file.id, targetLabel: candidateName, metadata: { sourceFileId: fileId, targetFolderId: target_folder_id } });
      copied.push(inserted.rows[0]);
    }

    res.json({ copied, skipped });
  } catch (err) {
    console.error('Copy files error:', err);
    res.status(500).json({ error: 'Copy failed' });
  }
};

const downloadFilesZip = async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId  = decoded.user_id;
    const isAdmin = decoded.role === 'admin';

    const fileIds = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (fileIds.length === 0) return res.status(400).json({ error: 'No files specified' });

    const result = await pool.query('SELECT * FROM files WHERE id = ANY($1::uuid[])', [fileIds]);
    const files = result.rows.filter(file => {
      if (isAdmin) return true;
      const isTargeted = Array.isArray(file.target_users) && file.target_users.some(id => String(id).trim() === String(userId).trim());
      const vis = String(file.visibility || '').toLowerCase();
      return vis === 'public' || vis === 'directory' || String(file.uploaded_by).trim() === String(userId).trim() || isTargeted;
    });

    if (files.length === 0) return res.status(404).json({ error: 'No accessible files found' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="selected_files_${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    const usedNames = new Set();
    for (const file of files) {
      const fullPath = path.join(storageBase, file.file_path);
      if (!fs.existsSync(fullPath)) continue;
      let name = file.original_name || file.file_name;
      const ext  = path.extname(name);
      const base = path.basename(name, ext);
      let counter = 1;
      while (usedNames.has(name)) { name = `${base}_(${counter})${ext}`; counter++; }
      usedNames.add(name);
      archive.file(fullPath, { name });

      // Log each download for stats parity with the single-file endpoint
      pool.query('INSERT INTO download_logs (file_id, user_id, downloader_ip) VALUES ($1,$2,$3)', [file.id, userId, getClientIp(req)]).catch(() => {});
      pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [file.id]).catch(() => {});
    }
    await logAction({ actorOverride: userId, action: 'file.zip_download', targetType: 'file', metadata: { fileIds, count: files.length } });

    await archive.finalize();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    console.error('Zip download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Zip failed' });
  }
};

// PUT /files/transfer/:fileId
// body: { new_owner: <user_id>, confirmation: "TRANSFER" }
const transferFileOwnership = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { new_owner, confirmation } = req.body;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    if (confirmation !== 'TRANSFER')
      return res.status(400).json({ error: 'Confirmation phrase does not match.' });
    if (!new_owner)
      return res.status(400).json({ error: 'new_owner is required' });

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];

    if (!isAdmin && file.uploaded_by !== userId)
      return res.status(403).json({ error: 'Not authorized to transfer this file' });

    if (new_owner === file.uploaded_by)
      return res.status(400).json({ error: 'File already belongs to this user' });

    // Re-validate eligibility server-side — never trust the dropdown alone.
    const targetPathRaw = decodeURIComponent(
      // files store the folder path via virtual_folders; look it up
      (await pool.query(
        `SELECT full_path FROM virtual_folders WHERE folder_id::text = $1`,
        [file.virtual_path]
      )).rows[0]?.full_path || ''
    );

    const eligible = await pool.query(
      `SELECT 1 FROM users WHERE user_id = $1 AND base_path IS NOT NULL AND $2 LIKE (base_path || '%')`,
      [new_owner, targetPathRaw]
    );
    if (eligible.rows.length === 0)
      return res.status(400).json({ error: 'Target user does not have access scope over this file\'s folder.' });

    const updated = await pool.query(
      `UPDATE files SET uploaded_by = $1, last_modified = NOW() WHERE id = $2 RETURNING *`,
      [new_owner, fileId]
    );
    await logAction({
  req, action: 'file.ownership_transferred', targetType: 'file', targetId: fileId, targetLabel: file.file_name,
  metadata: { fromOwner: file.uploaded_by, toOwner: new_owner }
});

    res.json({ message: 'File ownership transferred successfully.', file: updated.rows[0] });
  } catch (err) {
    console.error('Transfer file ownership error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Express route for public SFMS Agent setup download
const downloadSfmsAgentSetup = async (req, res) => {
  try {
    // Points directly to backend/sfms-agent/exe/SFMS_Agent.exe
    const fullPath = path.join(__dirname, '../sfms-agent/SFMS_Agent_Setup.exe');
    console.log(fullPath);

    // 1. Check if the file exists on disk
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'SFMS Agent executable not found on server.' });
    }

    // 2. Set response headers for direct .exe download
    const stat = fs.statSync(fullPath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="SFMS_Agent_Setup.exe"');
    res.setHeader('Content-Length', stat.size);

    // 3. Stream the file directly to client
    const readStream = fs.createReadStream(fullPath);
    readStream.pipe(res);

    readStream.on('error', (err) => {
      console.error('Download stream error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    });
  } catch (err) {
    console.error('Agent download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /files/check-hashes-batch
// body: { hashes: string[] }
// const checkHashesBatch = async (req, res) => {
//   try {
//     const { hashes } = req.body;
//     if (!Array.isArray(hashes) || hashes.length === 0) {
//       return res.json({ results: [] });
//     }

//     const userId  = req.user.user_id;
//     const isAdmin = req.user.role === 'admin';

//     const result = await pool.query(
//       `SELECT DISTINCT ON (f.file_hash)
//          f.file_hash, f.file_name, f.uploaded_by, f.upload_timestamp,
//          regexp_replace(vf.full_path, '%2F', '/', 'gi') AS found_path
//        FROM files f
//        JOIN virtual_folders vf ON vf.folder_id::text = f.virtual_path
//        WHERE f.file_hash = ANY($1::text[])
//          AND (
//            $2 = true
//            OR f.visibility = 'public'
//            OR f.uploaded_by = $3
//            OR $3 = ANY(f.target_users)
//          )
//        ORDER BY f.file_hash, f.upload_timestamp ASC`, // earliest upload wins as "the original"
//       [hashes, isAdmin, userId]
//     );

//     const map = {};
//     result.rows.forEach(r => { map[r.file_hash] = r; });

//     const results = hashes.map(h => ({
//       hash: h,
//       exists: !!map[h],
//       details: map[h] ? {
//         fileName: map[h].file_name,
//         uploadedBy: map[h].uploaded_by,
//         uploadedAt: map[h].upload_timestamp,
//         foundInFolder: map[h].found_path,
//       } : null,
//     }));

//     res.json({ results });
//   } catch (err) {
//     console.error('Batch hash check error:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// Decode a stored/partially-encoded folder path safely.
// full_path in the DB has '%2F' swapped to '/' by the SQL regexp_replace,
// but other encoded characters (spaces as %20, etc.) are still raw —
// decodeURIComponent cleans up whatever's left. Wrapped in try/catch
// because a malformed/double-encoded path would otherwise throw and
// take down the whole request.
function safeDecodePath(path) {
  if (!path) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path; // fall back to raw value rather than 500ing
  }
}

const checkHashesBatch = async (req, res) => {
  try {
    const { hashes } = req.body;
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.json({ results: [] });
    }

    const userId = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    let userBasePath = req.user.base_path || '/';
    if (!userBasePath.endsWith('/')) userBasePath += '/';

    const query = `
      SELECT DISTINCT ON (f.file_hash)
        f.file_hash, f.file_name, f.uploaded_by, f.upload_timestamp,
        regexp_replace(vf.full_path, '%2F', '/', 'gi') AS found_path
      FROM files f
      JOIN virtual_folders vf ON vf.folder_id::text = f.virtual_path
      WHERE f.file_hash = ANY($1::text[])
        AND (
          $2 = ANY(f.target_users)
          OR (
            (f.target_users IS NULL OR cardinality(f.target_users) = 0)
            AND (
              regexp_replace(vf.full_path, '%2F', '/', 'gi') LIKE '/public/%'
              OR regexp_replace(vf.full_path, '%2F', '/', 'gi') LIKE '/shared/%'
              OR regexp_replace(vf.full_path, '%2F', '/', 'gi') = '/public'
              OR regexp_replace(vf.full_path, '%2F', '/', 'gi') = '/shared'
            )
          )
          OR ( regexp_replace(vf.full_path, '%2F', '/', 'gi') LIKE $3 || '%' )
        )
      ORDER BY f.file_hash, f.upload_timestamp ASC
    `;

    const result = await pool.query(query, [hashes, userId, userBasePath]);

    const map = {};
    result.rows.forEach(r => { map[r.file_hash] = r; });

    const results = hashes.map(h => ({
      hash: h,
      exists: !!map[h],
      details: map[h] ? {
        fileName: map[h].file_name,
        uploadedBy: map[h].uploaded_by,
        uploadedAt: map[h].upload_timestamp,
        foundInFolder: safeDecodePath(map[h].found_path), // ← decoded here now
      } : null,
    }));

    res.json({ results });
  } catch (err) {
    console.error('Batch hash check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  uploadFile,
  uploadFileBatch,
  getQueueStats,
  listFiles,
  getFileThumbnail,
  generateDownloadToken,
  downloadFile,
  deleteFile,
  deleteMultipleFiles,
  togglePin,
  getStats,
  transferFileOwnership,
  checkCollision,
  getUploaders,
  editFile,
  getPdfInfo,
  splitPdf,
  mergePages,
  moveFiles,
  copyFiles,
  downloadFilesZip,
  downloadSfmsAgentSetup,
  checkHashesBatch,
};
