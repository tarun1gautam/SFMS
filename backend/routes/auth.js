const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const {
  login,
  verifyLoginMfa,
  setupMfa,
  verifyMfaSetup,
  disableMfa,
  verifyStepUpCode,
  register,
  getProfile,
  listUsers,
  deleteUser,
  searchUsers,
  updateUser,
  forceLogoutAll,
  changeOwnPassword,
  getTransferEligibleUsers,
  // ── Admin MFA management ──
  adminSetMfaStatus,
  adminGenerateMfaSecret,
  adminVerifyMfaSetup,
} = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// A 6-digit OTP has only 1,000,000 combinations — cap attempts per window
// so a leaked session can't be used to brute-force MFA checks.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public Routes ────────────────────────────────────────────────────────────
router.post('/login', login);
router.post('/login/mfa-verify', otpLimiter, verifyLoginMfa);

// ── Authenticated Self‑Service MFA ─────────────────────────────────────────
router.post('/mfa/setup', authenticate, setupMfa);
router.post('/mfa/verify-setup', authenticate, otpLimiter, verifyMfaSetup);
router.post('/mfa/disable', authenticate, otpLimiter, disableMfa);
router.post('/mfa/verify-code', authenticate, otpLimiter, verifyStepUpCode); // step-up check before MGMT/ADMIN

// ── User Management ─────────────────────────────────────────────────────────
router.post('/register', authenticate, requireAdmin, register);
router.get('/profile', authenticate, getProfile);
router.get('/users', authenticate, requireAdmin, listUsers);
router.delete('/users/:userId', authenticate, requireAdmin, deleteUser);
router.get('/users/search', authenticate, searchUsers);
router.patch('/users/:userId', authenticate, requireAdmin, updateUser);
router.post('/users/:userId/logout-all', authenticate, requireAdmin, forceLogoutAll);
router.patch('/change-password', authenticate, changeOwnPassword);
router.get('/users/transfer-eligible', authenticate, getTransferEligibleUsers);

// ── Admin MFA Management ────────────────────────────────────────────────────
// Grant/revoke MFA enabled status for a user
router.patch('/users/:userId/mfa-status', authenticate, requireAdmin, adminSetMfaStatus);
// Generate a fresh pending secret + QR for a user
router.post('/users/:userId/mfa/generate', authenticate, requireAdmin, adminGenerateMfaSecret);
// Verify the code and promote the pending secret to active for a user
router.post('/users/:userId/mfa/verify-setup', authenticate, requireAdmin, adminVerifyMfaSetup);

module.exports = router;