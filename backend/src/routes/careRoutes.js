const express = require('express');
const c = require('../controllers/careController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadRecordRoomImages, optimizeRecordRoomImages } = require('../middleware/fileUploads');

// Care Schedule (follow-ups, family sessions, development trackers). The PCC works their own sessions; Admin, Manager
// and Doctor see and work every patient's; Admin / Manager also reassign and reopen (checked in the controller).
const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR));

router.get('/sessions', c.listSessions);
router.get('/staff', c.listStaff);
router.get('/calendar', c.calendar);
router.get('/convert', c.convertPreview);
router.post('/convert', c.convertRun);
router.post('/leaves', c.markLeave);
router.delete('/leaves/:id', c.removeLeave);
router.get('/patients/:patientId', c.patientSessions);
router.get('/sessions/:id', c.getSession);
router.patch('/sessions/:id/call', c.setCallTime);
router.post('/sessions/:id/reschedule', c.reschedule);
router.post('/sessions/:id/attempt', c.addAttempt);
router.post('/sessions/:id/missed', c.markMissed);
router.post('/sessions/:id/cancel', c.cancelSession);
router.post('/sessions/:id/close', c.closeSession);
router.post('/sessions/:id/reopen', c.reopenSession);
router.post('/sessions/:id/assign', c.assignSession);
router.post('/sessions/:id/reassign-request', c.requestReassign);
router.post('/sessions/:id/reassign-request/decline', c.declineReassign);
router.put('/sessions/:id/form', c.saveForm);
router.post('/sessions/:id/complete', c.completeSession);
router.post('/sessions/:id/reminders', c.addReminder);
// Handwritten notes: photos / scans / PDFs, added to the patient's Records Room PDF.
router.post('/sessions/:id/notes', uploadRecordRoomImages.array('files', 10), optimizeRecordRoomImages, c.uploadNotes);
router.patch('/sessions/:id/reminders/:reminderId', c.updateReminder);
router.get('/sessions/:id/advice', c.sessionAdvice);
router.post('/sessions/:id/advice', c.askDoctor);

module.exports = router;
