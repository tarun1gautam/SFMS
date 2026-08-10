'use strict';

const path = require('path');
// Load environment variables from backend root directory
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const os = require('os');
const pool = require('../config/db');
const { storageBase } = require('../config/multer');

// Core Rendering Dependencies
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas, loadImage } = require('canvas');
const libre = require('libreoffice-convert');

/**
 * Renders a PNG thumbnail buffer/data URL from an image or PDF
 */
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

/**
 * Main thumbnail pipeline supporting Images, PDFs, and Office Documents via LibreOffice
 */
async function generateThumbnail(filePath, mimeType) {
  let tempPdfPath = null;

  try {
    if (!filePath) return null;

    const ext = path.extname(filePath).toLowerCase();
    const blacklisted = /\.(exe|dll|msi|apk|zip|rar|7z|tar|gz|bat|cmd|sh|bin|jar|iso)$/i;
    if (blacklisted.test(ext)) return null;

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

    if (isImage) {
      return await renderThumbnail(filePath, false);
    }

    if (isPdf) {
      return await renderThumbnail(filePath, true);
    }

    if (isOffice) {
      const fileBuffer = await fsPromises.readFile(filePath);

      const pdfBuffer = await new Promise((resolve, reject) => {
        libre.convert(fileBuffer, '.pdf', undefined, (err, done) => {
          if (err) reject(err);
          else resolve(done);
        });
      });

      tempPdfPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.pdf`);
      await fsPromises.writeFile(tempPdfPath, pdfBuffer);

      return await renderThumbnail(tempPdfPath, true);
    }

    return null;
  } catch (err) {
    throw err;
  } finally {
    if (tempPdfPath) {
      try {
        await fsPromises.unlink(tempPdfPath);
      } catch (_) {}
    }
  }
}

/**
 * Script Execution Runner
 */
async function runBatchThumbnailGenerator() {
  const forceAll = process.argv.includes('--force');
  console.log(`=======================================================`);
  console.log(`===    SFMS Existing Files Thumbnail Generator       ===`);
  console.log(`=======================================================`);
  console.log(`Mode: ${forceAll ? 'FORCE REGENERATE ALL' : 'MISSING THUMBNAILS ONLY'}\n`);

  const stats = { total: 0, success: 0, skipped: 0, failed: 0 };

  try {
    // Select candidates
    const query = forceAll
      ? `SELECT id, file_name, file_path, mime_type FROM files ORDER BY upload_timestamp DESC`
      : `SELECT id, file_name, file_path, mime_type FROM files WHERE thumbnail IS NULL OR thumbnail = '' ORDER BY upload_timestamp DESC`;

    const result = await pool.query(query);
    const files = result.rows;
    stats.total = files.length;

    console.log(`[Database]: Found ${stats.total} file(s) to process.\n`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const indexStr = `[${i + 1}/${stats.total}]`;
      const fullPath = path.join(storageBase, file.file_path);

      console.log(`${indexStr} Processing File ID: ${file.id}`);
      console.log(`  └─ Name: "${file.file_name}"`);
      console.log(`  └─ Path: "${fullPath}"`);
      console.log(`  └─ MIME: "${file.mime_type}"`);

      // Verify physical disk existence
      if (!fs.existsSync(fullPath)) {
        console.warn(`  └─ [SKIPPED]: File does not exist on disk.\n`);
        stats.skipped++;
        continue;
      }

      try {
        const thumbnailDataUrl = await generateThumbnail(fullPath, file.mime_type);

        if (!thumbnailDataUrl) {
          console.warn(`  └─ [SKIPPED]: File format unsupported or rendering yielded empty result.\n`);
          stats.skipped++;
          continue;
        }

        // Update database
        await pool.query(
          `UPDATE files SET thumbnail = $1, last_modified = NOW() WHERE id = $2`,
          [thumbnailDataUrl, file.id]
        );

        console.log(`  └─ [SUCCESS]: Thumbnail generated & DB updated.\n`);
        stats.success++;

      } catch (genErr) {
        console.error(`  └─ [FAILED]: Error processing file - ${genErr.message}\n`);
        stats.failed++;
      }
    }

  } catch (dbErr) {
    console.error(`[Fatal DB Error]:`, dbErr);
  } finally {
    console.log(`=======================================================`);
    console.log(`===                 SUMMARY REPORT                  ===`);
    console.log(`=======================================================`);
    console.log(` Total Found     : ${stats.total}`);
    console.log(` Successfully Updated : ${stats.success}`);
    console.log(` Skipped / Unsupported: ${stats.skipped}`);
    console.log(` Failed           : ${stats.failed}`);
    console.log(`=======================================================\n`);

    await pool.end();
    process.exit(0);
  }
}

runBatchThumbnailGenerator();