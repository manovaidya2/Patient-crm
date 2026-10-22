const express = require('express');
const { getTaskCounts } = require('../controllers/taskCountController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.get('/counts', protect, getTaskCounts);

module.exports = router;
