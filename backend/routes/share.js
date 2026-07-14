/**
 * routes/share.js — Nearby Share audit log (history only)
 *
 * File bytes never pass through these routes. The client calls POST /log
 * once a P2P or relay transfer completes successfully (checksum verified),
 * purely so a history/audit trail exists — identical in spirit to
 * download_logs for regular file downloads.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/share/log — record a completed (or failed) transfer
router.post('/log', authenticate, async (req, res) => {
  try {
    const {
      receiver_id = null,
      file_name,
      file_size,
      checksum_sha256 = null,
      transfer_method = 'p2p',
      status = 'completed',
    } = req.body;

    if (!file_name || !file_size) {
      return res.status(400).json({ error: 'file_name and file_size are required' });
    }

    const result = await pool.query(
      `INSERT INTO share_transfers
         (sender_id, receiver_id, file_name, file_size, checksum_sha256, transfer_method, status, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, started_at, completed_at`,
      [req.user.user_id, receiver_id, file_name, file_size, checksum_sha256, transfer_method, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Failed to log share transfer:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/share/history — this user's send/receive history
router.get('/history', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, sender_id, receiver_id, file_name, file_size, checksum_sha256,
              transfer_method, status, started_at, completed_at
         FROM share_transfers
        WHERE sender_id = $1 OR receiver_id = $1
        ORDER BY started_at DESC
        LIMIT 100`,
      [req.user.user_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch share history:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
