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
    vf.folder_id,
    vf.folder_name,
    vf.parent_path,
    vf.full_path,
    u.user_id AS created_by_name, -- This gets the name from the users table
    vf.created_at,
    vf.shared_label,
    vf.target_users,
    vf.visibility
FROM virtual_folders vf
LEFT JOIN users u ON vf.created_by = u.id
ORDER BY vf.folder_name ASC;
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
      target_users = [],
      parent_path,
      // NEW v2: optional explicit shared_label from client
      shared_label,
    } = req.body;

    const formattedTargetUsers = Array.isArray(target_users) ? target_users : [];
    const formattedSharedLabel = Array.isArray(shared_label) ? shared_label : ['—'];

if (!formattedTargetUsers || formattedTargetUsers === "" || formattedTargetUsers === "[]") {
    // If it's empty, null, or an empty string/array-string, force it to an empty array
    formattedTargetUsers = []; 
} else if (typeof formattedTargetUsers === 'string') {
    // If it's a JSON string like '["admin"]', parse it
    formattedTargetUsers = JSON.parse(formattedTargetUsers);
}


const encodedFolderPath = encodeURIComponent(full_path);

    // In folderController.js, at the start of createFolder
console.log("Incoming request body:", req.body);

    if(full_path && !full_path.endsWith("/")){
          return res.status(400).json({ error: 'Path must end with a forward slash (/)' });
        }
    
<<<<<<< HEAD
=======
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
<<<<<<< HEAD
>>>>>>> 1732eb47e3a46b885965fcd05186fe317a67dfa0
=======

>>>>>>> 52e2fcbb178da20c0ed65cb99e7022a7458aa7d9
    // Check if original_name already exists in DB
   const existingResult = await pool.query(
      'SELECT folder_id FROM virtual_folders WHERE folder_name = $1 AND full_path = $2 LIMIT 1',
      [folder_name, full_path]
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
          parent_path,
          encodedFolderPath,
          req.user.id,
          visibility,
          formattedTargetUsers,
          formattedSharedLabel,
        ]
      );

      res.status(201).json({ folder: insertResult.rows[0] });
    }
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

const deleteFolder = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    const result = await pool.query('SELECT * FROM virtual_folders WHERE folder_id = $1', [fileId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });

    const folder = result.rows[0];

    if (!isAdmin && folder.created_by !== userId)
      return res.status(403).json({ error: 'Not authorized to delete this folder' });
    await pool.query('DELETE FROM virtual_folders WHERE folder_id = $1', [fileId]);
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  listFolders,
  createFolder,
  deleteFolder
};