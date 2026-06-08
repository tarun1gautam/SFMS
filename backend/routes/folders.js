const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');

const {
  listFolders,
  createFolder
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

module.exports = router;