const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const c = require('../controllers/deliveryController');

// Treatment Delivery: the Admin, the Manager and the Doctor on every patient, a PCC on their own (checked per patient
// in the controller).
const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR));

router.get('/worklist', c.getWorklist);
router.get('/settings', c.getSettings);
router.put('/settings', c.saveSettings);

const phase = '/patients/:patientId/:number';
router.get(phase, c.getPlan);
router.post(`${phase}/setup`, c.setupPlan);
router.post(`${phase}/parts`, c.savePart);
router.post(`${phase}/supply-closed`, c.closeSupply);
router.post(`${phase}/confirm`, c.confirmSessions);
router.post(`${phase}/on-request`, c.bookOnRequest);
router.post(`${phase}/add`, c.addSkipped);
router.post(`${phase}/next-phase`, c.decideNextPhase);
router.post(`${phase}/tasks/:key/done`, c.completeTask);
router.post(`${phase}/sessions/:entryId/missed`, c.markMissed);
router.post(`${phase}/sessions/:entryId/reschedule`, c.rescheduleSession);
router.post(`${phase}/sessions/:entryId/complete`, c.completeSession);
router.post(`${phase}/sessions/:entryId/cancel`, c.cancelSession);

module.exports = router;
