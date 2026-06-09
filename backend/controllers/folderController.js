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

const createFolder = async (req, res) => {
  try {
    // if (!req) {
    //   return res.status(400).json({ error: 'No file uploaded' });
    // }

    const {
      folder_name,
      full_path,
      visibility = 'public',
      target_users = '[]',
      // NEW v2: optional explicit shared_label from client
      shared_label: sharedLabelRaw,
    } = req.body;

    if(full_path && !full_path.endsWith("/")){
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
    // Check if original_name already exists in DB
    const existingResult = await pool.query(
      'SELECT full_path, folder_name FROM virtual_folders WHERE folder_path = $1 LIMIT 1',
      [full_path]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'A folder with the same path already exists' });
    } else {
      // Insert new folder into DB
      const insertResult = await pool.query(
        `INSERT INTO virtual_folders
           (folder_name, parent_path, full_path, created_by, visibility, target_users, shared_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          folder_name,
          path.dirname(full_path),
          full_path,
          req.user.user_id,
          visibility,
          parsedTargetUsers,
          parsedSharedLabel,
        ]
      );

      res.status(201).json({ folder: insertResult.rows[0] });
    }
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

module.exports = {
  listFolders,
  createFolder
};