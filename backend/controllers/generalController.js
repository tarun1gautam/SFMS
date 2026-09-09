const pool = require('../config/db');

/**
 * GET /api/general/users-by-path?path=/SPMU/
 * Fetches users whose base_path covers or is broader than the provided path.
 * Example: Input '/SPMU/' matches users with base_path '/' or '/SPMU/'.
 */
const getUsersByBasePath = async (req, res) => {
  try {
    const { path: inputPath } = req.query;

    if (!inputPath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    // Decoded path used for matching and comparisons
    const decodedPath = decodeURIComponent(inputPath).trim();
    const normalizedPath = decodedPath.toLowerCase();

    // -------------------------------------------------------------
    // SPECIAL CASE 1: /public/ or /public (Case-Insensitive)
    // Return "all" for count and a descriptive message
    // -------------------------------------------------------------
    if (normalizedPath === '/public' || normalizedPath.startsWith('/public/')) {
      return res.json({ 
        users: [],
        count: "All", // Or use "Infinity"
        message: "ALL users have access to this path"
      });
    }

    // -------------------------------------------------------------
    // SPECIAL CASE 2: /shared/ or /shared (Case-Insensitive)
    // Return only currently online users with count
    // -------------------------------------------------------------
    if (normalizedPath === '/shared' || normalizedPath.startsWith('/shared/')) {
  // const onlineUsersRes = await pool.query(
  //   `SELECT user_id 
  //    FROM users 
  //    WHERE is_online = true OR status = 'online'
  //    ORDER BY user_id ASC`
  // );
  
  return res.json({ 
    users: [
      { user_id: req.user_id }
    ],
    count: 1,
    message: "Shared folders showing only to you"
  });
}

    // -------------------------------------------------------------
    // STANDARD DIRECTORY PROCESSING
    // -------------------------------------------------------------
    // Re-encoded path matching the %2F format stored in virtual_folders.full_path
    const encodedPath = encodeURIComponent(decodedPath);

    // 1. Fetch visibility, target_users, and created_by from virtual_folders
    const folderRes = await pool.query(
      `SELECT visibility, target_users, created_by 
       FROM virtual_folders 
       WHERE full_path = $1 OR full_path = $2
       LIMIT 1`,
      [inputPath, encodedPath]
    );

    let targetUsers = [];
    let creatorUserId = null;
    let isPrivate = false;

    if (folderRes.rows.length > 0) {
      const folder = folderRes.rows[0];
      isPrivate = folder.visibility === 'private';

      if (Array.isArray(folder.target_users)) {
        targetUsers = folder.target_users.filter(Boolean);
      }

      // Look up creator's user_id string from integer ID
      if (folder.created_by) {
        const creatorRes = await pool.query(
          `SELECT user_id FROM users WHERE id = $1`,
          [folder.created_by]
        );
        if (creatorRes.rows.length > 0) {
          creatorUserId = creatorRes.rows[0].user_id;
        }
      }
    }

    // Array to hold folder-level users (target_users + creator)
    const folderUsers = [...targetUsers];
    if (creatorUserId) {
      folderUsers.push(creatorUserId);
    }

    // 2. If visibility is strictly 'private', return target_users + creator
    if (isPrivate) {
      const uniqueFolderUsers = [...new Set(folderUsers)].sort();
      const mappedPrivateUsers = uniqueFolderUsers.map((id) => ({ user_id: id }));
      
      return res.json({
        users: mappedPrivateUsers,
        count: mappedPrivateUsers.length,
        message: "Private folder access list"
      });
    }

    // 3. If folder is public or doesn't exist in virtual_folders, run base_path logic
    const basePathRes = await pool.query(
      `SELECT user_id 
       FROM users 
       WHERE base_path IS NOT NULL 
         AND base_path != '' 
         AND STARTS_WITH($1, base_path)
       ORDER BY user_id ASC`,
      [decodedPath]
    );

    const basePathUsers = basePathRes.rows.map((row) => row.user_id);

    // 4. Combine base_path matches, target_users, and creator, removing duplicates
    const combinedUserIds = [...new Set([...basePathUsers, ...folderUsers])].sort();

    const finalUsersList = combinedUserIds.map((id) => ({ user_id: id }));

    return res.json({ 
      users: finalUsersList,
      count: finalUsersList.length,
      message: "Users with path access"
    });
  } catch (err) {
    console.error('Get users by base path error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getUsersByBasePath,
};