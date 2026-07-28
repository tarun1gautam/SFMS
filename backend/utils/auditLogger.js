const pool = require('../config/db');

const getClientIp = (req) =>
  req?.headers?.['x-forwarded-for']?.split(',')[0] || req?.socket?.remoteAddress || null;

/**
 * Writes one audit log row. Never throws — a logging failure must never
 * break the actual request it's describing.
 *
 * @param {object} opts
 * @param {object} opts.req          - Express req (for actor + IP); pass null if unauthenticated context
 * @param {string} opts.action       - dot-namespaced action name, e.g. 'file.delete'
 * @param {string} [opts.targetType] - 'file' | 'folder' | 'user' | 'system' | 'print'
 * @param {string} [opts.targetId]
 * @param {string} [opts.targetLabel]
 * @param {'success'|'failure'} [opts.status]
 * @param {object} [opts.metadata]   - any extra structured detail
 * @param {string} [opts.actorOverride] - for pre-auth events (e.g. failed login) where req.user doesn't exist
 */
async function logAction({
  req = null,
  action,
  targetType = null,
  targetId = null,
  targetLabel = null,
  status = 'success',
  metadata = {},
  actorOverride = null,
}) {
  try {
    const actorUserId = req?.user?.user_id || actorOverride || null;
    const actorRole   = req?.user?.role || null;
    const ip          = req ? getClientIp(req) : null;

    await pool.query(
      `INSERT INTO audit_logs
         (actor_user_id, actor_role, action, target_type, target_id, target_label, status, ip_address, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [actorUserId, actorRole, action, targetType, targetId, targetLabel, status, ip, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAction };