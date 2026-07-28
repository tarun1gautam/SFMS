const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

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

    // Mirror into the unified audit trail too, so nearby-share transfers
    // show up alongside every other action in one place for admins.
    await logAction({
      req,
      action: status === 'completed' ? 'share.transfer_completed' : 'share.transfer_failed',
      targetType: 'share',
      targetId: String(result.rows[0].id),
      targetLabel: file_name,
      status: status === 'completed' ? 'success' : 'failure',
      metadata: {
        receiver_id,
        file_size,
        checksum_sha256,
        transfer_method,
      },
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Failed to log share transfer:', err.message);
    // Even if the primary insert fails, still leave a trace in audit_logs —
    // this is the one spot where losing the record entirely would be worse
    // than a partial/failure-tagged entry.
    await logAction({
      req,
      action: 'share.transfer_log_failed',
      targetType: 'share',
      targetLabel: req.body?.file_name || 'unknown',
      status: 'failure',
      metadata: { error: err.message },
    });
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