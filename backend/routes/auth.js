const express = require('express');
const router = express.Router();
const { login, register, getProfile, listUsers, deleteUser, searchUsers } = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', authenticate, requireAdmin, register);
router.get('/profile', authenticate, getProfile);
router.get('/users', authenticate, requireAdmin, listUsers);
router.delete('/users/:userId', authenticate, requireAdmin, deleteUser);
router.get('/users/search', authenticate, searchUsers);

module.exports = router;