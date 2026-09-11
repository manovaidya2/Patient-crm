const express = require('express');
const { getFollowUps, getFamilySessions, getScheduleReminders } = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.use(protect);

router.get('/followups', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR), getFollowUps);
router.get('/family-sessions', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR), getFamilySessions);
router.get('/reminders', getScheduleReminders);

module.exports = router;
