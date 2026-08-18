const express = require('express');
const router = express.Router();
const { adminSetMfaStatus, adminGenerateMfaSecret, adminVerifyMfaSetup } = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ── Mount this router in your server entry (server.js) ──
// app.use('/api/admin/users', require('./routes/adminMfa'));
// 
// Full endpoints will be:
//   PATCH  /api/admin/users/:userId/mfa-status
//   POST   /api/admin/users/:userId/mfa/generate
//   POST   /api/admin/users/:userId/mfa/verify-setup

router.patch('/:userId/mfa-status', authenticate, requireAdmin, adminSetMfaStatus);
router.post('/:userId/mfa/generate', authenticate, requireAdmin, adminGenerateMfaSecret);
router.post('/:userId/mfa/verify-setup', authenticate, requireAdmin, adminVerifyMfaSetup);

module.exports = router;