const express = require('express');
const router = express.Router();
const { getUsersByBasePath } = require('../controllers/generalController');
const { authenticate } = require('../middleware/auth');

// ── General APIs ─────────────────────────────────────────────────────────────
router.get('/users-by-path', authenticate, getUsersByBasePath);

module.exports = router;