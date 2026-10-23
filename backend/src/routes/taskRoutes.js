const express = require('express');
const { getTaskCounts } = require('../controllers/taskCountController');
const { getMyDay } = require('../controllers/myDayController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.get('/counts', protect, getTaskCounts);
router.get('/my-day', protect, getMyDay);

module.exports = router;
