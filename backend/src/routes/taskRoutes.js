const express = require('express');
const { getTaskCounts } = require('../controllers/taskCountController');
const { getMyDay } = require('../controllers/myDayController');
const { getTeamPending } = require('../controllers/teamPendingController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();
router.get('/counts', protect, getTaskCounts);
router.get('/my-day', protect, getMyDay);
router.get('/team', protect, authorize(ROLES.ADMIN, ROLES.MANAGER), getTeamPending);

module.exports = router;
