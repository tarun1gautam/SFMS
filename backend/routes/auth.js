const express = require('express');
const router = express.Router();
const {
  login,
  register,
  getProfile,
  listUsers,
  deleteUser,
  searchUsers,
  updateUser,
  forceLogoutAll,
  changeOwnPassword,
  getTransferEligibleUsers,
} = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', authenticate, requireAdmin, register);
router.get('/profile', authenticate, getProfile);
router.get('/users', authenticate, requireAdmin, listUsers);
router.delete('/users/:userId', authenticate, requireAdmin, deleteUser);
router.get('/users/search', authenticate, searchUsers);
router.patch('/users/:userId', authenticate, requireAdmin, updateUser);
router.post('/users/:userId/logout-all', authenticate, requireAdmin, forceLogoutAll);
router.patch('/change-password', authenticate, changeOwnPassword);
router.get('/users/transfer-eligible', authenticate, getTransferEligibleUsers);

module.exports = router;