const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getSystemStats, getAuditLogs } = require('../controllers/adminController');

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

router.get('/system-stats', authenticate, requireAdmin, getSystemStats);
router.get('/audit-logs', authenticate, requireAdmin, getAuditLogs);

module.exports = router;