const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');

const {
  listFolders
} = require('../controllers/folderController');

// List folders
router.get(
  '/',
  authenticate,
  listFolders
);

module.exports = router;