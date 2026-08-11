const express = require('express');
const router = express.Router();
const {
  listEntries, createEntry, updateEntry, deleteEntry, searchLinkableFiles,
  listMovements, addMovement, deleteMovement, listLocationSuggestions, adminSetDakAccess,
} = require('../controllers/dakRegisterController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Mount in server.js as: app.use('/api/dak-register', require('./routes/dakRegister'));

router.get('/', authenticate, listEntries);
router.post('/', authenticate, createEntry);
router.patch('/:id', authenticate, updateEntry);
// Delete no longer requires site-admin at the route level — permission
// (admin OR dak_register_manager OR original creator) is checked inside
// the controller itself, via hasFullDakAccess().
router.delete('/:id', authenticate, deleteEntry);
router.get('/files/search', authenticate, searchLinkableFiles);
router.get('/locations/suggestions', authenticate, listLocationSuggestions);
router.get('/:id/movements', authenticate, listMovements);
router.post('/:id/movements', authenticate, addMovement);
router.delete('/:id/movements/:movementId', authenticate, deleteMovement);

// Admin-only: grant/revoke full Dak Register access for a specific user
router.patch('/admin/users/:userId/access', authenticate, requireAdmin, adminSetDakAccess);

module.exports = router;