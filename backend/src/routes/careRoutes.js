const express = require('express');
const c = require('../controllers/careController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

// Care Schedule (follow-ups, family sessions, development trackers). The PCC works their own sessions; Admin, Manager
// and Doctor see and work every patient's; Admin / Manager also reassign and reopen (checked in the controller).
const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR));

router.get('/sessions', c.listSessions);
router.get('/staff', c.listStaff);
router.get('/calendar', c.calendar);
router.post('/leaves', c.markLeave);
router.delete('/leaves/:id', c.removeLeave);
router.get('/patients/:patientId', c.patientSessions);
router.get('/sessions/:id', c.getSession);
router.patch('/sessions/:id/call', c.setCallTime);
router.post('/sessions/:id/reschedule', c.reschedule);
router.post('/sessions/:id/attempt', c.addAttempt);
router.post('/sessions/:id/missed', c.markMissed);
router.post('/sessions/:id/cancel', c.cancelSession);
router.post('/sessions/:id/reopen', c.reopenSession);
router.post('/sessions/:id/assign', c.assignSession);
router.put('/sessions/:id/form', c.saveForm);
router.post('/sessions/:id/complete', c.completeSession);

module.exports = router;
