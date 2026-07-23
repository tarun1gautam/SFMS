const pool = require('../config/db');

/**
 * True if `fullPathDecoded` (e.g. "/SPMU/Reports/") sits at or inside ANY
 * folder flagged download_only — so marking one folder locks every
 * subfolder underneath it automatically, no per-folder tagging needed.
 */
async function isInDownloadOnlyZone(fullPathDecoded) {
  if (!fullPathDecoded) return false;
  const result = await pool.query(
    `SELECT full_path FROM virtual_folders WHERE download_only = true`
  );
  const norm = fullPathDecoded.endsWith('/') ? fullPathDecoded : `${fullPathDecoded}/`;
  return result.rows.some((r) => {
    const p = decodeURIComponent(r.full_path);
    const pn = p.endsWith('/') ? p : `${p}/`;
    return norm.startsWith(pn);
  });
}

module.exports = { isInDownloadOnlyZone };