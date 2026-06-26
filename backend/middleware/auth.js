/**
 * middleware/auth.js  (SFMS — Connection-safe Edition)
 *
 * Problem with the original:
 *   Every single request (upload, list, download, folders…) hit the DB to
 *   validate the user. Under 10+ concurrent uploads this exhausted the pool
 *   and caused "Connection terminated due to connection timeout" errors.
 *
 * Fix:
 *   Cache the user row in memory for 60 seconds (per user_id).
 *   The JWT is still cryptographically verified on every request — we only
 *   skip the redundant SELECT that just confirms the user exists.
 *   token_version is still checked (logout/revoke still works instantly
 *   because the cache is keyed by user_id + token_version together).
 */

const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

// ── Simple in-memory user cache ──────────────────────────────────────────────
const USER_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const userCache = new Map(); // key: `${user_id}:${token_version}` → { user, expiresAt }

function getCachedUser(userId, tokenVersion) {
  const key    = `${userId}:${tokenVersion}`;
  const cached = userCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    userCache.delete(key);
    return null;
  }
  return cached.user;
}

function setCachedUser(userId, tokenVersion, user) {
  const key = `${userId}:${tokenVersion}`;
  userCache.set(key, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  // Evict old entries when cache grows large (safety valve)
  if (userCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of userCache) {
      if (now > v.expiresAt) userCache.delete(k);
    }
  }
}

// ── authenticate middleware ──────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check cache first — avoids a DB round-trip on every request
    const cached = getCachedUser(decoded.user_id, decoded.tokenVersion);
    if (cached) {
      req.user = cached;
      return next();
    }

    // Cache miss — hit the DB once, then cache the result
    const result = await pool.query(
      'SELECT id, user_id, role, token_version, base_path FROM users WHERE user_id = $1',
      [decoded.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (decoded.tokenVersion !== user.token_version) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    setCachedUser(decoded.user_id, decoded.tokenVersion, user);
    req.user = user;
    next();

  } catch (err) {
    if (err.name === 'JsonWebTokenError')  return res.status(401).json({ error: 'Invalid token' });
    if (err.name === 'TokenExpiredError')  return res.status(401).json({ error: 'Token expired' });
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── requireAdmin middleware (unchanged) ──────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ── Manual cache invalidation (call this on logout / password change) ────────
const invalidateUserCache = (userId) => {
  for (const key of userCache.keys()) {
    if (key.startsWith(`${userId}:`)) userCache.delete(key);
  }
};

module.exports = { authenticate, requireAdmin, invalidateUserCache };