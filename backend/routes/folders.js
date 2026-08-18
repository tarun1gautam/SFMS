const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');

const {
  listFolders,
  createFolder,
  deleteFolder,
  resolveFolder,
  editFolder,
  moveFolder,
  downloadFolderZip,
  transferFolderOwnership,
  togglePinFolder,
} = require('../controllers/folderController');

// List folders
router.get(
  '/',
  authenticate,
  listFolders
);

router.get('/resolve', authenticate, resolveFolder);
router.put('/edit/:folderId', authenticate, editFolder);
router.put('/move/:folderId', authenticate, moveFolder);

// Zip download uses a query-string token (same pattern as file downloads)
// since a plain <a href="..."> download link can't set an Authorization header.
router.get('/download-zip/:folderId', downloadFolderZip);

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

router.put('/transfer/:folderId', authenticate, transferFolderOwnership);
router.put('/:folderId/pin', authenticate, togglePinFolder);

module.exports = router;