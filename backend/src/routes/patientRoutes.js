const express = require('express');
const {
  getPatients,
  checkPatientCode,
  getDashboardStats,
  getStaffDashboardStats,
  getPaymentsLedger,
  getPatientById,
  deletePatient,
  getPatientCallLogs,
  createPatient,
  getPendingApprovals,
  approvePatient,
  updatePatientStatus,
  updatePatient,
  updatePatientStage,
  addStagePayment,
  updateStagePayment,
  deleteStagePayment,
  approveStagePayment,
  uploadStageRecord,
  deleteStageRecordScan,
  requestStageMedicine,
  addFollowUp,
  updateFollowUp,
  deleteFollowUp,
  addFamilySession,
  updateFamilySession,
  deleteFamilySession,
} = require('../controllers/patientController');
const {
  listScheduleNotes,
  addScheduleNote,
  deleteScheduleNote,
} = require('../controllers/scheduleNoteController');
const { protect, authorize } = require('../middleware/auth');
const { uploadPaymentScreenshot } = require('../middleware/upload');
const { uploadStageRecord: uploadRecordMiddleware, uploadPrescription, uploadScheduleCompletion } = require('../middleware/fileUploads');
const { PATIENT_ACCESS_ROLES, PATIENT_FULL_ACCESS_ROLES, ROLES } = require('../constants/roles');

const router = express.Router();
const PATIENT_WRITE_ROLES = PATIENT_ACCESS_ROLES.filter((role) => role !== ROLES.ACCOUNTANT);
const PATIENT_CREATE_ROLES = PATIENT_FULL_ACCESS_ROLES.filter((role) => role !== ROLES.ACCOUNTANT);
const PACKAGE_STAGE_EDIT_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR];
const PATIENT_RECORD_EDIT_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];
const PAYMENT_ADD_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];

router.use(protect, authorize(...PATIENT_ACCESS_ROLES));

router.get('/', getPatients);
router.get('/check-code', authorize(...PATIENT_CREATE_ROLES), checkPatientCode);
router.post('/', authorize(...PATIENT_CREATE_ROLES), createPatient);
router.get('/dashboard-stats', authorize(ROLES.ADMIN, ROLES.DOCTOR), getDashboardStats);
router.get('/staff-dashboard-stats', authorize(ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST), getStaffDashboardStats);
router.get('/payments-ledger', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT), getPaymentsLedger);
router.get('/pending-approvals', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT), getPendingApprovals);
router.get('/:id/calls', getPatientCallLogs);
router.get('/:id', getPatientById);
router.delete('/:id', authorize(ROLES.ADMIN), deletePatient);
router.patch('/:id/approve', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT), approvePatient);
router.patch('/:id/status', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR), updatePatientStatus);
router.patch('/:id', authorize(...PATIENT_WRITE_ROLES), updatePatient);
router.patch('/:id/stages/:number', authorize(...PACKAGE_STAGE_EDIT_ROLES, ROLES.ASSISTANT_DOCTOR, ROLES.MANAGER), updatePatientStage);
router.post('/:id/stages/:number/payments', authorize(...PAYMENT_ADD_ROLES), uploadPaymentScreenshot.array('screenshot', 10), addStagePayment);
router.patch('/:id/stages/:number/payments/:paymentId', authorize('admin'), uploadPaymentScreenshot.array('screenshot', 10), updateStagePayment);
router.delete('/:id/stages/:number/payments/:paymentId', authorize(ROLES.ADMIN), deleteStagePayment);
router.patch('/:id/stages/:number/payments/:paymentId/approve', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT), approveStagePayment);
router.post('/:id/stages/:number/record', authorize(...PATIENT_RECORD_EDIT_ROLES), uploadRecordMiddleware.array('record', 30), uploadStageRecord);
router.delete('/:id/stages/:number/record-scans/:scanId', authorize(...PATIENT_RECORD_EDIT_ROLES), deleteStageRecordScan);
router.post('/:id/stages/:number/medicine-request', authorize(...PATIENT_WRITE_ROLES), uploadPrescription.array('prescription', 10), requestStageMedicine);
router.post('/:id/stages/:number/followups', authorize(...PATIENT_WRITE_ROLES), addFollowUp);
router.patch('/:id/stages/:number/followups/:entryId', authorize(...PATIENT_WRITE_ROLES), uploadScheduleCompletion.array('completionFiles', 10), updateFollowUp);
router.delete('/:id/stages/:number/followups/:entryId', authorize(ROLES.ADMIN), deleteFollowUp);
router.post('/:id/stages/:number/family-sessions', authorize(...PATIENT_WRITE_ROLES), addFamilySession);
router.patch('/:id/stages/:number/family-sessions/:entryId', authorize(...PATIENT_WRITE_ROLES), uploadScheduleCompletion.array('completionFiles', 10), updateFamilySession);
router.delete('/:id/stages/:number/family-sessions/:entryId', authorize(ROLES.ADMIN), deleteFamilySession);

// One shared notepad per stage for Follow-ups and one for Family Sessions (not tied to
// a single scheduled entry) — every user only ever sees, adds and deletes their own
// notes here (enforced in the controller).
router.get('/:id/stages/:number/followups/notes', authorize(...PATIENT_WRITE_ROLES), listScheduleNotes('followup'));
router.post('/:id/stages/:number/followups/notes', authorize(...PATIENT_WRITE_ROLES), addScheduleNote('followup'));
router.delete('/:id/stages/:number/followups/notes/:noteId', authorize(...PATIENT_WRITE_ROLES), deleteScheduleNote('followup'));
router.get('/:id/stages/:number/family-sessions/notes', authorize(...PATIENT_WRITE_ROLES), listScheduleNotes('family_session'));
router.post('/:id/stages/:number/family-sessions/notes', authorize(...PATIENT_WRITE_ROLES), addScheduleNote('family_session'));
router.delete('/:id/stages/:number/family-sessions/notes/:noteId', authorize(...PATIENT_WRITE_ROLES), deleteScheduleNote('family_session'));

module.exports = router;
