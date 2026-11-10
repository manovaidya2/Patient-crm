const express = require('express');
const { listTransit, getTransitCase, listStaff, getPccCalendar, runAction, removeFromTransit, restoreToTransit, ackExplanation, getTransitReminders, listExplanations, completeExplanation } = require('../controllers/transitController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadTransitFile } = require('../middleware/fileUploads');

const router = express.Router();
const TRANSIT_ROLES = [ROLES.ADMIN, ROLES.IN_TRANSIT];

router.use(protect);
router.get('/reminders', authorize(ROLES.ADMIN, ROLES.IN_TRANSIT, ROLES.ASSISTANT_DOCTOR, ROLES.MEDICINE_DEPARTMENT), getTransitReminders);
router.get('/explanations', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR), listExplanations);
router.post('/:patientId/:number/complete-explanation', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR), completeExplanation);
router.post('/:patientId/:number/medicine-start', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR), require('../controllers/transitController').setMedicineStart);
router.post('/:patientId/:number/reschedule-explanation', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR), require('../controllers/transitController').rescheduleExplanation);
router.get('/staff', authorize(...TRANSIT_ROLES), listStaff);
router.get('/staff/:id/calendar', authorize(...TRANSIT_ROLES, ROLES.ASSISTANT_DOCTOR), getPccCalendar);
router.get('/', authorize(...TRANSIT_ROLES), listTransit);
router.get('/follow-ups', authorize(...TRANSIT_ROLES), require('../controllers/transitController').listFollowUps);
router.get('/:patientId/:number', authorize(...TRANSIT_ROLES), getTransitCase);
router.delete('/:patientId/:number', authorize(ROLES.ADMIN), removeFromTransit);
router.post('/:patientId/:number/restore', authorize(ROLES.ADMIN, ROLES.MANAGER), restoreToTransit);
router.post('/:patientId/:number/ack-explanation', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR), ackExplanation);
router.patch('/:patientId/:number', authorize(...TRANSIT_ROLES), uploadTransitFile.array('files', 10), runAction);

module.exports = router;
