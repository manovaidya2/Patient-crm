const express = require('express');
const { getTaskCounts } = require('../controllers/taskCountController');
const { getMyDay } = require('../controllers/myDayController');
const { getTeamPending } = require('../controllers/teamPendingController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();
router.get('/counts', protect, getTaskCounts);
router.get('/my-day', protect, getMyDay);
// "Your pending work" step by step (fulfilment steps, medicine requests to accept / being made).
router.get('/steps', protect, require('../controllers/pendingStepsController').getPendingSteps);
// Every role's pending work: the Team pending page (Admin, Manager) and the Control Room sections (also the Doctor).
router.get('/team', protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR), getTeamPending);
// Everything waiting on the doctor (top of the Control Room).
router.get('/doctor-actions', protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR), require('../controllers/doctorActionsController').getDoctorActions);

module.exports = router;
