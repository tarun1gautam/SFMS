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
    const userVarcharId = req.user.user_id;
    const userBasePath  = req.user.base_path || '/';
    const userRole      = req.user.role;
    const folderPath        = req.query.folder_path || userBasePath;
    const fetchAll = req.query.fetch_all === 'true';
    const encodedBasePath = encodeURIComponent(userBasePath);

    const folderLevelFilter = fetchAll ? '' : `
      AND (
        vf.parent_path = $4
        OR vf.full_path = $5
        OR vf.full_path = $6
      )
    `;

    const query = `
  SELECT 
    vf.folder_id,
    vf.folder_name,
    vf.parent_path,
    vf.full_path,
    vf.created_by,
    u.user_id AS created_by_name,
    vf.created_at,
    vf.shared_label,
    vf.target_users,
    vf.visibility
  FROM virtual_folders vf
  JOIN users me ON me.user_id = $1
  LEFT JOIN users u ON u.id = vf.created_by

  WHERE
    -- Base path constraint
    (
      $3 = '/'
      OR vf.full_path LIKE $2
    )

    ${folderLevelFilter}

    -- Visibility filter
    AND (
  LOWER(vf.visibility) = 'public'
  OR (
    LOWER(vf.visibility) = 'private'
    AND (
      -- Empty array = shared with everyone
      (vf.target_users = '{}' OR array_length(vf.target_users, 1) IS NULL)
      -- OR user is explicitly targeted
      OR $1 = ANY(vf.target_users)
      -- OR user owns the folder
      OR vf.created_by = me.id
    )
  )
)

  ORDER BY vf.folder_name ASC
`;

const queryParams = fetchAll
      ? [
          userVarcharId,         // $1
          `${encodedBasePath}%`, // $2
          userBasePath,          // $3
          // $4 $5 $6 not needed
        ]
      : [
          userVarcharId,                      // $1
          `${encodedBasePath}%`,              // $2
          userBasePath,                       // $3
          folderPath,                         // $4 — parent_path match
          folderPath,                         // $5 — current folder plain
          encodeURIComponent(folderPath),     // $6 — current folder encoded
        ];

    const result = await pool.query(query, queryParams);

    const decodedFolders = result.rows.map(folder => ({
      ...folder,
      full_path: decodeURIComponent(folder.full_path),
    }));

    res.json({ success: true, folders: decodedFolders });

  } catch (err) {
    console.error('List folders error:', err);
    res.status(500).json({ success: false, error: 'Failed to load folders' });
  }
};

const getParentFolderSettings = async (parentPath) => {
  if (!parentPath || parentPath === '/') return null;
  const res = await pool.query(
    `SELECT visibility, target_users, shared_label 
     FROM virtual_folders 
     WHERE full_path = $1 OR full_path = $2
     LIMIT 1`,
    [encodeURIComponent(parentPath), parentPath]
  );
  return res.rows[0] || null;
};

const createFolder = async (req, res) => {
  try {
    const {
      folder_name,
      full_path,
      visibility = 'public',
      target_users = [],
      parent_path,
      shared_label,
    } = req.body;

    let formattedTargetUsers = Array.isArray(target_users) ? target_users : [];
    let formattedSharedLabel = Array.isArray(shared_label) ? shared_label : ['—'];
    let finalVisibility = visibility;

    if (full_path && !full_path.endsWith('/'))
      return res.status(400).json({ error: 'Path must end with a forward slash (/)' });

    // ── Check parent folder constraints ────────────────────
    const parentSettings = await getParentFolderSettings(parent_path);
    if (parentSettings) {
      const permLevel = { private: 0, group: 1, directory: 2, public: 3 };
      const parentLevel = permLevel[parentSettings.visibility] ?? 3;
      const newLevel    = permLevel[visibility] ?? 3;

      if (newLevel > parentLevel) {
        return res.status(400).json({
          error: `Cannot create a "${visibility}" folder inside a "${parentSettings.visibility}" folder.`
        });
      }

      if (parentSettings?.visibility === 'private') {
  const parentUsers = new Set(parentSettings.target_users || []);
  const invalidUsers = formattedTargetUsers.filter(u => !parentUsers.has(u));
  
  if (invalidUsers.length > 0) {
    return res.status(400).json({
      error: `Users [${invalidUsers.join(', ')}] are not in the parent folder's access list.`
    });
  }
}

    }

    // ── Derive shared_label ────────────────────────────────
    if (finalVisibility === 'public') {
      formattedSharedLabel = ['Public'];
      formattedTargetUsers = [];
    } else if (formattedTargetUsers.length > 0) {
      formattedSharedLabel = formattedTargetUsers;
    } else {
      formattedSharedLabel = ['—'];
    }

    const encodedFolderPath = encodeURIComponent(full_path);

    const existingResult = await pool.query(
      'SELECT folder_id FROM virtual_folders WHERE folder_name = $1 AND full_path = $2 LIMIT 1',
      [folder_name, full_path]
    );
    if (existingResult.rows.length > 0)
      return res.status(400).json({ error: 'A folder with the same path already exists' });

    const insertResult = await pool.query(
      `INSERT INTO virtual_folders
         (folder_name, parent_path, full_path, created_by, visibility, target_users, shared_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [folder_name, parent_path, encodedFolderPath, req.user.id,
       finalVisibility, formattedTargetUsers, formattedSharedLabel]
    );

    res.status(201).json({ folder: insertResult.rows[0] });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

const editFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const isAdmin = req.user.role === 'admin';

    const result = await pool.query(
      'SELECT * FROM virtual_folders WHERE folder_id = $1', [folderId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Folder not found' });

    const folder = result.rows[0];

    if (!isAdmin && folder.created_by !== req.user.id)
      return res.status(403).json({ error: 'Not authorized to edit this folder' });

    const {
      folder_name,
      visibility = folder.visibility,
      target_users = [],
    } = req.body;

    // ── Check parent folder constraints ────────────────────
    const parentSettings = await getParentFolderSettings(folder.parent_path);
    if (parentSettings) {
      const permLevel   = { private: 0, group: 1, directory: 2, public: 3 };
      const parentLevel = permLevel[parentSettings.visibility] ?? 3;
      const newLevel    = permLevel[visibility] ?? 3;

      if (newLevel > parentLevel) {
        return res.status(400).json({
          error: `Cannot set visibility to "${visibility}" — parent folder is "${parentSettings.visibility}".`
        });
      }
    }

    // ── Derive shared_label ────────────────────────────────
    let shared_label;
    if (visibility === 'public')                                      shared_label = ['Public'];
    else if (Array.isArray(target_users) && target_users.length > 0) shared_label = target_users;
    else                                                              shared_label = ['—'];

    const oldDecodedPath = decodeURIComponent(folder.full_path);
    const parentPath     = folder.parent_path;
    const newDecodedPath = `${parentPath}${folder_name}/`;
    const newEncodedPath = encodeURIComponent(newDecodedPath);
    const nameChanged    = folder_name !== folder.folder_name;

    const updated = await pool.query(
      `UPDATE virtual_folders
       SET folder_name=$1, full_path=$2, visibility=$3, target_users=$4, shared_label=$5
       WHERE folder_id=$6 RETURNING *`,
      [folder_name, newEncodedPath, visibility, target_users, shared_label, folderId]
    );

    if (nameChanged) {
      const oldEncodedPath = folder.full_path;
      await pool.query(
        `UPDATE virtual_folders
         SET 
           parent_path = replace(parent_path, $1, $2),
           full_path   = replace(full_path,   $3, $4)
         WHERE parent_path LIKE $5 OR full_path LIKE $6`,
        [
          oldDecodedPath, newDecodedPath,
          oldEncodedPath, newEncodedPath,
          `${oldDecodedPath}%`,
          `${oldEncodedPath}%`,
        ]
      );
    }

    res.json({
      success: true,
      folder: {
        ...updated.rows[0],
        full_path: decodeURIComponent(updated.rows[0].full_path),
      }
    });
  } catch (err) {
    console.error('Edit folder error:', err);
    res.status(500).json({ success: false, error: 'Failed to edit folder' });
  }
};

const deleteFolder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { fileId } = req.params; // this is actually folderId
    const userId  = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    const result = await client.query(
      'SELECT * FROM virtual_folders WHERE folder_id = $1',
      [fileId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const folder = result.rows[0];

    if (!isAdmin && folder.created_by !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this folder' });
    }

    await client.query('BEGIN');

    // Check for subfolders (descendants, not just direct children)
    const subfolders = await client.query(
      `SELECT folder_id FROM virtual_folders 
       WHERE full_path LIKE $1 AND folder_id != $2`,
      [`${folder.full_path}%`, fileId]
    );

    if (subfolders.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot delete folder: it contains subfolders. Delete them first.',
      });
    }

    // Check for files inside this folder
    const files = await client.query(
      `SELECT id FROM files WHERE virtual_path = $1`,
      [fileId]
    );

    if (files.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot delete folder: it contains files. Delete them first.',
      });
    }

    await client.query('DELETE FROM virtual_folders WHERE folder_id = $1', [fileId]);

    await client.query('COMMIT');
    res.json({ message: 'Folder deleted successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// GET /folders/resolve?folder_path=/SPMU/Folder1/
const resolveFolder = async (req, res) => {
  try {
    const userVarcharId = req.user.user_id;
    const userBasePath  = req.user.base_path || '/';
    const folderPath    = req.query.folder_path || userBasePath;

    // Handle root case — find the folder whose full_path matches base_path
    const encodedPath = encodeURIComponent(folderPath);

    const query = `
      SELECT 
        vf.folder_id,
        vf.folder_name,
        vf.parent_path,
        vf.full_path,
        vf.visibility,
        vf.target_users,
        vf.created_by
      FROM virtual_folders vf
      JOIN users me ON me.user_id = $1

      WHERE
        -- Match by decoded path OR encoded path (handle both storage formats)
        (vf.full_path = $2 OR vf.full_path = $3)

        -- Visibility: user must have access to this folder
        AND (
          LOWER(vf.visibility) = 'public'
          OR (
            LOWER(vf.visibility) = 'private'
            AND (
              vf.created_by = me.id
              OR vf.target_users @> ARRAY[$1]::text[]
            )
          )
        )

      LIMIT 1
    `;

    const result = await pool.query(query, [
      userVarcharId,   // $1
      folderPath,      // $2 — plain:   "/SPMU/Folder1/"
      encodedPath,     // $3 — encoded: "%2FSPMU%2FFolder1%2F"
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Folder not found or access denied' 
      });
    }

    const folder = result.rows[0];

    res.json({ 
      success: true, 
      folder_id: folder.folder_id,
      folder: {
        ...folder,
        full_path: decodeURIComponent(folder.full_path),
      }
    });

  } catch (err) {
    console.error('Resolve folder error:', err);
    res.status(500).json({ success: false, error: 'Failed to resolve folder' });
  }
};

module.exports = {
  listFolders,
  createFolder,
  editFolder,
  deleteFolder,
  resolveFolder
};