const express = require('express');
const { getFollowUps, getFamilySessions, getScheduleReminders } = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');
const { PATIENT_ACCESS_ROLES } = require('../constants/roles');

const router = express.Router();

router.use(protect, authorize(...PATIENT_ACCESS_ROLES));

router.get('/followups', getFollowUps);
router.get('/family-sessions', getFamilySessions);
router.get('/reminders', getScheduleReminders);

module.exports = router;
