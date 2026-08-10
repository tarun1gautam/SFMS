const express = require('express');
const router = express.Router();
const { adminSetMfaStatus, adminGenerateMfaSecret, adminVerifyMfaSetup } = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Mount this in your app entry point as:
//   app.use('/api/admin/users', require('./routes/adminMfa'));
//
// If you already have another router mounted at /api/admin (e.g. for
// system-stats / audit-logs), you can instead copy these two lines into
// that router under a /users prefix — same handlers either way.

router.patch('/:userId/mfa-status', authenticate, requireAdmin, adminSetMfaStatus);
router.post('/:userId/mfa/generate', authenticate, requireAdmin, adminGenerateMfaSecret);
router.post('/:userId/mfa/verify-setup', authenticate, requireAdmin, adminVerifyMfaSetup);

module.exports = router;