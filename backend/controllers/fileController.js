/**
 * fileController.js  (SFMS v2 — Enhanced)
 *
 * Changes from v1:
 *  • uploadFile   — now accepts & stores `shared_label` array
 *  • listFiles    — full server-side sort, filter, and search support
 *                   (query params: sort, order, search, search_field,
 *                    filterVisibility, filterType, filterUploader,
 *                    filterDateFrom, filterDateTo, filterSizeMin,
 *                    filterSizeMax, filterStatus)
 *  • togglePin    — unchanged (trigger updates last_modified automatically)
 *  • All other handlers — unchanged
 */

const path = require('path');
const fs   = require('fs');
const fsPromises = require('fs').promises;
const pool = require('../config/db');
const jwt = require('jsonwebtoken'); // Ensure you have this imported
const mammoth = require("mammoth");
const { pdfParse } = require("pdf-parse");
const Tesseract = require('tesseract.js');
const xlsx = require('xlsx');
const { buildStoragePath, storageBase } = require('../config/multer');

// ─── Helpers ────────────────────────────────────────────────────────────────

const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

/**
 * Derive human-readable shared_label array from visibility + target_users.
 * Called when the client does NOT explicitly supply shared_label.
 *   public  → ['Public']
 *   others  → target_users array (may be empty → ['—'])
 */
const deriveSharedLabel = (visibility, targetUsers) => {
  if (visibility === 'public') return ['Public'];
  if (Array.isArray(targetUsers) && targetUsers.length > 0) return targetUsers;
  return ['—'];
};

// ─── Collision Check ─────────────────────────────────────────────────────────

const checkCollision = async (req, res) => {
  try {
    const { filename } = req.query; // virtual_path is no longer strictly needed for scope
    const userBasePath = req.user.base_path || '/';

    if (!filename) {
      return res.status(400).json({ error: 'filename required' });
    }

    // Logic:
    // 1. Match the file name
    // 2. AND the path must start with the user's base_path (User's full tree)
    // 3. OR the path is exactly '/public/'
    const query = `
      SELECT file_path, upload_timestamp, uploaded_by, file_size, virtual_path 
      FROM files 
      WHERE file_name = $1 
      AND (
        virtual_path LIKE $2 
        OR virtual_path = '/public/'
      )
      LIMIT 1
    `;
    
    // Pattern matches the user's root and all sub-directories
    const basePattern = `${userBasePath}%`; 

    const result = await pool.query(query, [filename.trim(), basePattern]);

    const exists = result.rows.length > 0;
    const responseData = { exists };

    if (exists) {
      const { upload_timestamp, uploaded_by, file_size, virtual_path: foundPath } = result.rows[0];
      responseData.fileDetails = {
        uploadTimestamp: upload_timestamp,
        uploadedBy: uploaded_by,
        filesize: file_size,
        foundInFolder: foundPath 
      };
    }

    res.json(responseData);
  } catch (err) {
    console.error('Collision check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const LIMITS = {
  TEXT_CHAR_COUNT: 20000, // Stop extracting after 10k characters
  PDF_MAX_PAGES: 20,       // Don't process more than 5 pages
  IMAGE_MAX_SIZE_MB: 15    // Reject huge images before OCR
};

async function extractText(fileBuffer, mimeType) {
  try {
    // 1. Text & Code (Stream-like approach for buffers)
    if (mimeType === 'text/plain' || mimeType === 'application/json' || mimeType.startsWith('text/')) {
      return fileBuffer.toString('utf-8', 0, LIMITS.TEXT_CHAR_COUNT);
    }

    // 2. PDF (Limit pages at the parser level)
    if (mimeType === 'application/pdf') {
      const data = await pdfParse(fileBuffer, { max: LIMITS.PDF_MAX_PAGES });
      
      // If result is empty, fallback to OCR
      if (data.text.trim().length < 50) {
        return await performLocalOCR(fileBuffer);
      }
      return data.text.substring(0, LIMITS.TEXT_CHAR_COUNT);
    }

    // 3. Word Documents (Mammoth is efficient by default)
    if (mimeType.includes('officedocument.wordprocessingml')) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value.substring(0, LIMITS.TEXT_CHAR_COUNT);
    }

    // 4. Excel/CSV (Extract headers + first few rows only)
    if (mimeType.includes('spreadsheetml') || mimeType === 'csv') {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      // Only get data from the first sheet
      const sheetName = workbook.SheetNames[0];
      const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName], { FS: ",", RS: "\n" });
      
      // Extract only the first X lines to save memory
      return csv.split('\n').slice(0, 50).join('\n').substring(0, LIMITS.TEXT_CHAR_COUNT);
    }

    // 5. Images (Check size before OCR)
    if (mimeType.startsWith('image/')) {
      if (fileBuffer.length > LIMITS.IMAGE_MAX_SIZE_MB * 1024 * 1024) {
        return "Error: Image too large for offline processing.";
      }
      return await performLocalOCR(fileBuffer);
    }

    return "Unsupported format";
  } catch (err) {
    console.error("Extraction error:", err);
    return "Error during extraction";
  }
}

async function performLocalOCR(buffer) {
  // Tesseract processes the whole buffer; for better performance, 
  // ensure images are resized before hitting this function.
  const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
  return text.substring(0, LIMITS.TEXT_CHAR_COUNT);
}

// ─── Upload ──────────────────────────────────────────────────────────────────

const uploadFile = async (req, res) => {
  const tempFilePath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      visibility = 'public',
      description = '',
      target_users = '[]',
      conflict_resolution,
      virtual_path,
      folder_id,
      shared_label: sharedLabelRaw,
    } = req.body;

    const fileBuffer = await fsPromises.readFile(tempFilePath);
    const mimeType = req.file.mimetype;

    // Now pass them to your helper
    const extractedText = await extractText(fileBuffer, mimeType);


    if(visibility === "private" && target_users.length === 0){
      res.status(400).json({ error: 'select one targer user'});
      return
    }

    if(visibility === "public" && virtual_path !== "/public/"){
      return res.status(400).json({ error: 'public files must be uploaded in public folder' });
    }
    if(virtual_path && !virtual_path.endsWith("/")){
          return res.status(400).json({ error: 'Path must end with a forward slash (/)' });
        }
    
    const parsedTargetUsers = JSON.parse(target_users);

    // Build shared_label: use client-supplied value, or derive automatically
    let parsedSharedLabel;
    if (sharedLabelRaw) {
      try {
        parsedSharedLabel = JSON.parse(sharedLabelRaw);
      } catch {
        parsedSharedLabel = [sharedLabelRaw]; // treat as single string
      }
    } else {
      parsedSharedLabel = deriveSharedLabel(visibility, parsedTargetUsers);
    }

    const targetDir  = buildStoragePath(storageBase);
    const ext        = path.extname(req.file.originalname);
    const baseName   = path.basename(req.file.originalname, ext)

    // Check if original_name already exists in DB
    const existingResult = await pool.query(
      'SELECT file_path FROM files WHERE original_name = $1 LIMIT 1',
      [req.file.originalname.trim()]
    );

    let finalFileName;
    let finalFilePath;

    if (conflict_resolution === 'replace') {
      const dbRelativePath = existingResult.rows[0].file_path;

      await pool.query('DELETE FROM files WHERE file_path = $1', [dbRelativePath]);

      const oldPhysicalPath = path.join(storageBase, dbRelativePath);
      if (fs.existsSync(oldPhysicalPath)) fs.unlinkSync(oldPhysicalPath);

      finalFileName = req.file.originalname;
      finalFilePath = path.join(targetDir, finalFileName);

    } else if (conflict_resolution === 'rename') {
      let counter = 1;
      let candidateName;
      let dbCheck;
      do {
        candidateName = `${baseName}_(${counter})${ext}`;
        dbCheck = await pool.query(
          'SELECT 1 FROM files WHERE file_name = $1 LIMIT 1',
          [candidateName]
        );
        counter++;
      } while (dbCheck.rows.length > 0);

      finalFileName = candidateName;
      finalFilePath = path.join(targetDir, finalFileName);

    } else {
      finalFileName = `${baseName}${ext}`;
      finalFilePath = path.join(targetDir, finalFileName);
    }

    // Move temp → final
    let moveSuccess = false;

    try {
      fs.renameSync(tempFilePath, finalFilePath);
      moveSuccess = true; 
      console.log('File moved successfully:', moveSuccess); // Prints: true
    } catch (error) {
      moveSuccess = false;
      console.error('File move failed:', error.message);    // Prints error message
      console.log('File moved successfully:', moveSuccess); // Prints: false
    }

    const relativePath = path.relative(storageBase, finalFilePath);

    // --- FIX STAGE: Force empty/falsy values to native empty arrays ---
    const finalTargetUsers = Array.isArray(parsedTargetUsers) ? parsedTargetUsers : [];
    const finalSharedLabel = Array.isArray(parsedSharedLabel) ? parsedSharedLabel : 
                             (parsedSharedLabel ? [parsedSharedLabel] : []);
    // -----------------------------------------------------------------

    // INSERT — now includes shared_label
    const result = await pool.query(
      `INSERT INTO files
         (file_name, original_name, file_path, file_size, mime_type,
          uploaded_by, uploader_ip, visibility, target_users, shared_label, description,virtual_path,content_raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        finalFileName,
        req.file.originalname,
        relativePath,
        req.file.size,
        req.file.mimetype,
        req.user.user_id,
        getClientIp(req),
        visibility,
        finalTargetUsers, // FIXED: Safely passed as verified native array
        finalSharedLabel, // FIXED: Safely passed as verified native array
        description,
        virtual_path,
        extractedText
      ]
    );

    // console.log('DB insert result:', result.rows[0]);

    if (req.io) {
      req.io.emit('file_uploaded', {
        file:     result.rows[0],
        uploader: req.user.user_id,
      });
    }

    res.status(201).json({ file: result.rows[0] });

  } catch (err) {
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// ─── List Files (v2 — with sort / filter / search) ───────────────────────────

/**
 * GET /api/files
 *
 * Query Parameters (all optional):
 *   page             – page number (default 1)
 *   limit            – page size   (default 100, max 500)
 *
 *   — Search ————————————————————————————
 *   search           – search term
 *   search_field     – 'name' | 'id' | 'uploader' | 'shared' (default 'name')
 *                      'name'     → searches file_name + original_name
 *                      'id'       → exact match on files.id (UUID)
 *                      'uploader' → prefix-match on uploaded_by
 *                      'shared'   → ANY match in shared_label array
 *
 *   — Sort ——————————————————————————————
 *   sort             – 'name'|'upload_date'|'size'|'type'|'uploader'|
 *                      'visibility'|'last_modified'  (default: pinned→date)
 *   order            – 'asc' | 'desc' (default 'desc')
 *
 *   — Filters ———————————————————————————
 *   filterVisibility – 'public' | 'private' | 'group'
 *   filterType       – mime prefix e.g. 'pdf', 'docx', 'jpg', 'png', 'zip', 'xlsx'
 *   filterUploader   – exact user_id
 *   filterDateFrom   – ISO date string  (inclusive)
 *   filterDateTo     – ISO date string  (inclusive, extended to end-of-day)
 *   filterSizeMin    – bytes
 *   filterSizeMax    – bytes
 */
const listFiles = async (req, res) => {
  try {
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    const userBasePath = req.user.base_path || '/';

    // ── Pagination ───────────────────────────────────────────
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    // ── Search params ────────────────────────────────────────
    const search      = (req.query.search      || '').trim();
    const searchField = (req.query.search_field || 'name').toLowerCase();

    // ── Sort params ──────────────────────────────────────────
    const sortMap = {
      name:          'f.file_name',
      upload_date:   'f.upload_timestamp',
      size:          'f.file_size',
      type:          'f.mime_type',
      uploader:      'f.uploaded_by',
      visibility:    'f.visibility',
      last_modified: 'f.last_modified',
    };
    const sortCol   = sortMap[req.query.sort] || null; // null → default pinned+date
    const sortOrder = (req.query.order || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const isContentSearch = searchField === 'content' && !!search;
const selectClause = isContentSearch
  ? `SELECT f.*, ts_rank(f.content_vector, websearch_to_tsquery('english', $1)) AS rank`
  : `SELECT f.*`;

    // ── Filter params ────────────────────────────────────────
    const filterVisibility = req.query.filterVisibility || '';
    const filterType       = req.query.filterType       || ''; // e.g. 'pdf', 'image', 'zip'
    const filterUploader   = req.query.filterUploader   || '';
    const filterDateFrom   = req.query.filterDateFrom   || '';
    const filterDateTo     = req.query.filterDateTo     || '';
    const filterSizeMin    = req.query.filterSizeMin    ? parseInt(req.query.filterSizeMin)  : null;
    const filterSizeMax    = req.query.filterSizeMax    ? parseInt(req.query.filterSizeMax)  : null;

    // ── Build WHERE clause ───────────────────────────────────
    const conditions = [];
    const params     = [];

    // Access control (unchanged from v1)
    // Access control
// ── Access control ──────────────────────────────────────────
params.push(`${userBasePath}%`);
const pathCondition = `f.virtual_path LIKE $${params.length}`;

if (isAdmin) {
  conditions.push(pathCondition);
} else {
  params.push(userId);
  const uid = params.length;
  // Group the path OR public visibility logic
  conditions.push(`(
    (${pathCondition})
    OR f.visibility = 'public'
    OR f.uploaded_by = $${uid}
    OR (
      (f.visibility = 'private' OR f.visibility = 'group') 
      AND (
        cardinality(f.target_users) = 0 
        OR $${uid} = ANY(f.target_users)
      )
    )
  )`);
}

    // ── Search condition ─────────────────────────────────────
    if (search) {
      const term = `%${search}%`;
      if (searchField === 'content') {
    // Full-text search using tsvector column
    params.push(search);
    conditions.push(
      `f.content_vector @@ websearch_to_tsquery('english', $${params.length})`
    );
  }else if (searchField === 'id') {
        // exact UUID match (cast so partial strings don't crash)
        params.push(search);
        conditions.push(`f.id::text = $${params.length}`);
      } else if (searchField === 'uploader') {
        params.push(term);
        conditions.push(`f.uploaded_by ILIKE $${params.length}`);
      } else if (searchField === 'shared') {
        // match any element inside the shared_label array (case-insensitive)
        params.push(search.toLowerCase());
        conditions.push(
          `EXISTS (
            SELECT 1 FROM unnest(f.shared_label) AS sl
            WHERE lower(sl) LIKE '%' || $${params.length} || '%'
          )`
        );
      } else {
        // default: file_name OR original_name
        params.push(term);
        conditions.push(
          `(f.file_name ILIKE $${params.length} OR f.original_name ILIKE $${params.length})`
        );
      }
    }

    // ── Filter: visibility ───────────────────────────────────
    if (filterVisibility) {
      params.push(filterVisibility);
      conditions.push(`f.visibility = $${params.length}`);
    }

    // ── Filter: file type (mime_type substring) ───────────────
    if (filterType) {
      // Map friendly extension names → mime_type substrings
      const mimeMap = {
        pdf:  'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml',
        jpg:  'image/jpeg',
        jpeg: 'image/jpeg',
        png:  'image/png',
        gif:  'image/gif',
        svg:  'image/svg',
        mp4:  'video/mp4',
        mp3:  'audio/mpeg',
        zip:  'application/zip',
        rar:  'application/x-rar',
        txt:  'text/plain',
        csv:  'text/csv',
        json: 'application/json',
        image:  'image/',
        video:  'video/',
        audio:  'audio/',
        text:   'text/',
        archive:'application/zip',
      };
      const mimeFragment = mimeMap[filterType.toLowerCase()] || filterType;
      params.push(`%${mimeFragment}%`);
      conditions.push(`f.mime_type ILIKE $${params.length}`);
    }

    // ── Filter: uploader ─────────────────────────────────────
    if (filterUploader) {
      params.push(filterUploader);
      conditions.push(`f.uploaded_by = $${params.length}`);
    }

    // ── Filter: date range ────────────────────────────────────
    if (filterDateFrom) {
      params.push(filterDateFrom);
      conditions.push(`f.upload_timestamp >= $${params.length}::timestamptz`);
    }
    if (filterDateTo) {
      // extend to end of day
      params.push(filterDateTo);
      conditions.push(`f.upload_timestamp <= ($${params.length}::date + INTERVAL '1 day - 1 second')::timestamptz`);
    }

    // ── Filter: size range ────────────────────────────────────
    if (filterSizeMin !== null) {
      params.push(filterSizeMin);
      conditions.push(`f.file_size >= $${params.length}`);
    }
    if (filterSizeMax !== null) {
      params.push(filterSizeMax);
      conditions.push(`f.file_size <= $${params.length}`);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // ── ORDER BY ─────────────────────────────────────────────
    let orderClause;
if (sortCol) {
  orderClause = `ORDER BY ${sortCol} ${sortOrder}`;
} else if (isContentSearch) {
  orderClause = 'ORDER BY rank DESC';
} else {
  orderClause = 'ORDER BY f.is_pinned DESC, f.upload_timestamp DESC';  // ← same for all users
}

    // ── Execute queries ───────────────────────────────────────
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM files f ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const filesResult = await pool.query(
  `${selectClause}
   FROM files f
   ${whereClause}
   ${orderClause}
   LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
  [...params, limit, offset]
);

    res.json({
      files: filesResult.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Download ────────────────────────────────────────────────────────────────
// (unchanged from v1)

const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // 1. Manually get the token from URL query or Authorization header
    const token = req.query.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    // 2. Manually verify the token to get the user
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user_id;
    const isAdmin = decoded.role === 'admin';

    // 3. Database lookup for file
    const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    // 4. Authorization logic
  // 4. Authorization logic
// 4. Authorization logic
if (!isAdmin) {
  const stringUserId = String(userId).trim();
  const stringUploadedBy = String(file.uploaded_by).trim();
  
  // Normalize visibility to lowercase for comparison
  const fileVisibility = String(file.visibility || '').toLowerCase();
  
  const isTargeted = Array.isArray(file.target_users) && file.target_users.some(
    (id) => String(id).trim() === stringUserId
  );

  // Logic: 
  // 1. Is it 'public'?
  // 2. Are they the owner?
  // 3. Are they in target_users?
  // 4. Is the folder accessible via base_path? (We use a simple check here)
  const canAccess = fileVisibility === 'public' ||
                    fileVisibility === 'directory' ||
                    stringUploadedBy === stringUserId || 
                    isTargeted;

  if (!canAccess) {
    // Debug log to help you pinpoint if it's the visibility or the owner check
    console.log(`Access Denied: User ${stringUserId} | File ${fileId} | Visibility: ${fileVisibility} | Owner: ${stringUploadedBy}`);
    return res.status(403).json({ error: 'Access denied' });
  }
}

    const fullPath = path.join(storageBase, file.file_path);
    
    // Safety check
    if (!fullPath.startsWith(storageBase)) return res.status(403).json({ error: 'Invalid path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found on disk' });

    // 5. Log download
    await pool.query('INSERT INTO download_logs (file_id, user_id, downloader_ip) VALUES ($1, $2, $3)', [fileId, userId, getClientIp(req)]);
    await pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [fileId]);

    // 6. Stream the file
    const stat = fs.statSync(fullPath);
    const mode = req.query.mode === 'view' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${mode}; filename="${encodeURIComponent(file.file_name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);

    const readStream = fs.createReadStream(fullPath);
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

// ─── Delete ──────────────────────────────────────────────────────────────────
// (unchanged from v1)

const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    if (!isAdmin && file.uploaded_by !== userId)
      return res.status(403).json({ error: 'Not authorized to delete this file' });

    const fullPath = path.join(storageBase, file.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    await pool.query('DELETE FROM files WHERE id = $1', [fileId]);

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Toggle Pin ───────────────────────────────────────────────────────────────
// (unchanged from v1 — last_modified auto-updates via DB trigger)

const togglePin = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    if (!isAdmin && file.uploaded_by !== userId)
      return res.status(403).json({ error: 'Not authorized to pin this file' });

    const updated = await pool.query(
      'UPDATE files SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING *',
      [fileId]
    );

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
    const userId = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    // 1. Verify file existence
    const result = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];
    let sharedlabel;

    // 2. Authorization Check (Admin or Owner)
    if (!isAdmin && file.uploaded_by !== userId)
      return res.status(403).json({ error: 'Not authorized to edit this file' });
      postgretargetuser = `{${target_users.map(u => `"${u}"`).join(',')}}`;
      if(visibility==="public"){
        sharedlabel = '{"Public"}'
      }else{
        sharedlabel = postgretargetuser;
      }

    // ==========================================
    // START NEW CHANGES: PHYSICAL FILE RENAME
    // ==========================================
    // Check if the physical file exists at the old location before trying to rename it
    const oldPhysicalPath = path.join(storageBase, file.file_path);
    const newPhysicalPath = path.join(storageBase, file_path);

    if (fs.existsSync(oldPhysicalPath)) {
      fs.renameSync(oldPhysicalPath, newPhysicalPath);
      console.log('Actual file renamed successfully in storage directory');
    } else {
      console.warn('Warning: Source file not found on disk at:', oldPhysicalPath);
    }
    // ==========================================
    // END NEW CHANGES
    // ==========================================

    // 3. Update File Metadata
    const updated = await pool.query(
      `UPDATE files 
       SET file_name = $1, visibility = $2, original_name = $3, description = $4, file_path = $5, shared_label = $6, target_users = $7 
       WHERE id = $8 
       RETURNING *`,
      [file_name, visibility, original_name, description, file_path,  sharedlabel,  postgretargetuser, fileId]
    );

    res.json({ file: updated.rows[0] });
  } catch (err) {
    console.error('Edit file error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
// ─── Stats ────────────────────────────────────────────────────────────────────
// (unchanged from v1)

const getStats = async (req, res) => {
  try {
    const [totalFiles, totalSize, topDownload] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM files'),
      pool.query('SELECT COALESCE(SUM(file_size), 0) AS total FROM files'),
      pool.query(`
        SELECT file_name, original_name, download_count
        FROM files
        WHERE upload_timestamp > NOW() - INTERVAL '7 days'
        ORDER BY download_count DESC
        LIMIT 1
      `),
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

// ─── Get unique uploaders (for filter dropdown) ───────────────────────────────
/**
 * GET /api/files/uploaders
 * Returns distinct uploaded_by values visible to the caller.
 * Used to populate the "Uploaded By" filter dropdown.
 */
const getUploaders = async (req, res) => {
  try {
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    let query;
    let params = [];

    if (isAdmin) {
      query = `SELECT DISTINCT uploaded_by FROM files ORDER BY uploaded_by ASC`;
    } else {
      params = [userId];
      query = `
        SELECT DISTINCT uploaded_by FROM files
        WHERE (
          visibility = 'public'
          OR uploaded_by = $1
          OR (visibility = 'private' AND $1 = ANY(target_users))
          OR (visibility = 'group'   AND $1 = ANY(target_users))
        )
        ORDER BY uploaded_by ASC
      `;
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
  listFiles,
  downloadFile,
  deleteFile,
  togglePin,
  getStats,
  checkCollision,
  getUploaders,
  editFile,   // NEW v2
};