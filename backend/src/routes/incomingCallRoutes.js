const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/incomingCallController');

// In Transit's Incoming Call Log (the manager passes as a department supervisor).
const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.IN_TRANSIT));
router.get('/patients', controller.searchPatients);
router.get('/', controller.listIncomingCalls);
router.post('/', controller.createIncomingCall);
router.patch('/:id', controller.updateIncomingCall);
router.post('/:id/follow-up-done', controller.markFollowUpDone);

module.exports = router;
