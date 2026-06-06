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
const pool = require('../config/db');
const jwt = require('jsonwebtoken'); // Ensure you have this imported
const { buildStoragePath, storageBase } = require('../config/multer');

const listFolders = async (req, res) => {
  try {
    const currentPath = req.query.path || '/';

    const result = await pool.query(
      `
      SELECT
        folder_id,
        folder_name,
        parent_path,
        full_path,
        created_by,
        created_at
      FROM virtual_folders
      ORDER BY folder_name ASC
      `
    );

    res.json({
      success: true,
      folders: result.rows
    });

  } catch (err) {
    console.error('List folders error:', err);

    res.status(500).json({
      success: false,
      error: 'Failed to load folders'
    });
  }
};

module.exports = {
    listFolders,
};