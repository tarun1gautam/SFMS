const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');

const {
  listFolders,
  createFolder,
  deleteFolder,
  resolveFolder,
  editFolder
} = require('../controllers/folderController');

// List folders
router.get(
  '/',
  authenticate,
  listFolders
);

router.get('/resolve', authenticate, resolveFolder);
router.put('/edit/:folderId', authenticate, editFolder);

router.post(
  '/',
  authenticate,
  createFolder
);

router.delete(
  '/delete/:fileId',
  authenticate,
  deleteFolder
);

module.exports = router;