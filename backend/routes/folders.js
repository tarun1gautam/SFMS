const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');

const {
  listFolders,
  createFolder,
  deleteFolder
} = require('../controllers/folderController');

// List folders
router.get(
  '/',
  authenticate,
  listFolders
);

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