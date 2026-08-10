'use strict';

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pool = require('../config/db');
const { storageBase } = require('../config/multer');
const PptxParser = require('node-pptx-parser').default;

// Copy limits & helpers matching your controller configuration
const LIMITS = {
  TEXT_CHAR_COUNT: 20000,
  MAX_PPTX_BYTES: 200 * 1024 * 1024, // 200 MB Limit
};

function sanitizeForPostgres(text) {
  if (!text) return text;
  return text.replace(/\u0000/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

async function extractPptxTextFromPath(filePath) {
  try {
    const stat = await fsPromises.stat(filePath);
    if (stat.size > LIMITS.MAX_PPTX_BYTES) {
      console.warn(`    ⚠️ File skipped: Exceeds max size limit of 200MB (${stat.size} bytes)`);
      return '';
    }

    const parser = new PptxParser(filePath);
    const slideData = await parser.extractText();

    const rawText = slideData
      .map((slide) => (Array.isArray(slide.text) ? slide.text.join('\n') : slide.text || ''))
      .join('\n\n');

    const extracted = rawText.substring(0, LIMITS.TEXT_CHAR_COUNT);
    return sanitizeForPostgres(extracted);
  } catch (err) {
    console.error(`    ❌ Text extraction error for file [${filePath}]:`, err.message);
    return '';
  }
}

async function runPptxExtractionMigration() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('🚀 Starting One-Time Migration: PPTX Text & Vector Update');
  console.log('====================================================\n');

  try {
    // 1. Fetch all PPTX / PPT files from the database
    console.log('🔍 Searching PostgreSQL for existing PowerPoint files...');
    const selectQuery = `
      SELECT id, file_name, file_path, mime_type, content_raw
      FROM files
      WHERE mime_type IN (
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint'
      ) OR mime_type ILIKE '%presentationml%';
    `;

    const res = await pool.query(selectQuery);
    const files = res.rows;

    console.log(`📊 Found ${files.length} PowerPoint file(s) requiring text & vector processing.\n`);

    if (files.length === 0) {
      console.log('✅ No PowerPoint files to process. Process complete!');
      return;
    }

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // 2. Loop through each file and process sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const absolutePath = path.join(storageBase, file.file_path);

      console.log(`[${i + 1}/${files.length}] Processing File ID: ${file.id}`);
      console.log(`    📁 File Name: ${file.file_name}`);
      console.log(`    📍 Disk Path : ${absolutePath}`);

      // Check file existence on disk
      if (!fs.existsSync(absolutePath)) {
        console.warn(`    ⚠️ Skipped: File does not exist on disk at specified path.`);
        skippedCount++;
        console.log('----------------------------------------------------');
        continue;
      }

      // Extract text using PPTX parser
      console.log(`    ⚙️ Extracting slide text...`);
      const extractedText = await extractPptxTextFromPath(absolutePath);

      if (!extractedText || extractedText.trim().length === 0) {
        console.warn(`    ⚠️ Warning: No text could be extracted (empty slides or binary .ppt format).`);
      } else {
        console.log(`    📝 Extracted ${extractedText.length} characters.`);
      }

      // 3. Update database record (Populate content_raw and rebuild content_vector)
      console.log(`    💾 Updating PostgreSQL record and regenerating search vector...`);
      const updateQuery = `
        UPDATE files
        SET 
          content_raw = $1,
          content_vector = to_tsvector('english', COALESCE($1, '')),
          last_modified = NOW()
        WHERE id = $2
        RETURNING id;
      `;

      await pool.query(updateQuery, [extractedText, file.id]);
      console.log(`    ✅ Success: File ID ${file.id} updated successfully.`);
      successCount++;

      console.log('----------------------------------------------------');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n====================================================');
    console.log('🎉 Migration Completed Successfully!');
    console.log(`⏱️ Duration     : ${duration} seconds`);
    console.log(`✅ Updated      : ${successCount} file(s)`);
    console.log(`⚠️ Skipped      : ${skippedCount} file(s)`);
    console.log(`❌ Failed       : ${failedCount} file(s)`);
    console.log('====================================================');

  } catch (err) {
    console.error('\n❌ Fatal error during migration process:', err);
  } finally {
    // End pool database connection cleanly
    await pool.end();
    console.log('🔌 Database connection closed.');
  }
}

// Execute script immediately
runPptxExtractionMigration();