// const pool = require('../config/db');

// /**
//  * True if `fullPathDecoded` (e.g. "/SPMU/Reports/") sits at or inside ANY
//  * folder flagged download_only — so marking one folder locks every
//  * subfolder underneath it automatically, no per-folder tagging needed.
//  */
// async function isInDownloadOnlyZone(fullPathDecoded) {
//   if (!fullPathDecoded) return false;
//   const result = await pool.query(
//     `SELECT full_path FROM virtual_folders WHERE download_only = true`
//   );
//   const norm = fullPathDecoded.endsWith('/') ? fullPathDecoded : `${fullPathDecoded}/`;
//   return result.rows.some((r) => {
//     const p = decodeURIComponent(r.full_path);
//     const pn = p.endsWith('/') ? p : `${p}/`;
//     return norm.startsWith(pn);
//   });
// }

// module.exports = { isInDownloadOnlyZone };





// utils/downloadOnlyZone.js
'use strict';

const pool = require('../config/db');

/**
 * Finds the most specific download-only ancestor (or self) covering
 * `fullPathDecoded`, along with who created that folder.
 * Returns null if the path isn't inside any locked folder.
 */
async function getDownloadOnlyLock(fullPathDecoded) {
  if (!fullPathDecoded) return null;

  const result = await pool.query(
    `SELECT vf.full_path, u.user_id AS created_by_user_id
     FROM virtual_folders vf
     LEFT JOIN users u ON u.id = vf.created_by
     WHERE vf.download_only = true`
  );

  const norm = fullPathDecoded.endsWith('/') ? fullPathDecoded : `${fullPathDecoded}/`;

  const matches = result.rows
    .map((r) => ({ ...r, decodedPath: decodeURIComponent(r.full_path) }))
    .filter((r) => {
      const pn = r.decodedPath.endsWith('/') ? r.decodedPath : `${r.decodedPath}/`;
      return norm.startsWith(pn);
    });

  if (matches.length === 0) return null;

  // Nested locks are possible (parent + child both flagged) — the
  // closest enclosing lock is the one that actually governs this path.
  matches.sort((a, b) => b.decodedPath.length - a.decodedPath.length);
  return matches[0]; // { full_path, created_by_user_id, decodedPath }
}

/**
 * True if `fullPathDecoded` sits inside a download-only zone AND the
 * given user should still be blocked by it.
 * Exempt: admins, and the user who created the locked folder itself.
 */
async function isDownloadOnlyRestrictedForUser(fullPathDecoded, userId, isAdmin) {
  const lock = await getDownloadOnlyLock(fullPathDecoded);
  if (!lock) return false;
  if (isAdmin) return false;
  if (lock.created_by_user_id && String(lock.created_by_user_id) === String(userId)) return false;
  return true;
}

// Kept for any other call sites that just want the raw "is this locked at all" check
async function isInDownloadOnlyZone(fullPathDecoded) {
  return !!(await getDownloadOnlyLock(fullPathDecoded));
}

module.exports = { isInDownloadOnlyZone, isDownloadOnlyRestrictedForUser, getDownloadOnlyLock };