const express = require('express');
const {
  getPatients,
  getDashboardStats,
  getPaymentsLedger,
  getPatientById,
  getPatientCallLogs,
  createPatient,
  updatePatient,
  updatePatientStage,
  addStagePayment,
  updateStagePayment,
  uploadStageRecord,
  requestStageMedicine,
  addFollowUp,
  updateFollowUp,
  addFamilySession,
  updateFamilySession,
} = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');
const { uploadPaymentScreenshot } = require('../middleware/upload');
const { uploadStageRecord: uploadRecordMiddleware, uploadPrescription } = require('../middleware/fileUploads');
const { PATIENT_ACCESS_ROLES, PATIENT_FULL_ACCESS_ROLES, ROLES } = require('../constants/roles');

const router = express.Router();
const PATIENT_WRITE_ROLES = PATIENT_ACCESS_ROLES.filter((role) => role !== ROLES.ACCOUNTANT);
const PATIENT_CREATE_ROLES = PATIENT_FULL_ACCESS_ROLES.filter((role) => role !== ROLES.ACCOUNTANT);

router.use(protect, authorize(...PATIENT_ACCESS_ROLES));

router.get('/', getPatients);
router.post('/', authorize(...PATIENT_CREATE_ROLES), createPatient);
router.get('/dashboard-stats', authorize(ROLES.ADMIN, ROLES.DOCTOR), getDashboardStats);
router.get('/payments-ledger', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT), getPaymentsLedger);
router.get('/:id/calls', getPatientCallLogs);
router.get('/:id', getPatientById);
router.patch('/:id', authorize(...PATIENT_WRITE_ROLES), updatePatient);
router.patch('/:id/stages/:number', authorize(...PATIENT_WRITE_ROLES), updatePatientStage);
router.post('/:id/stages/:number/payments', authorize(...PATIENT_WRITE_ROLES), uploadPaymentScreenshot.array('screenshot', 10), addStagePayment);
router.patch('/:id/stages/:number/payments/:paymentId', authorize('admin'), uploadPaymentScreenshot.array('screenshot', 10), updateStagePayment);
router.post('/:id/stages/:number/record', authorize(...PATIENT_WRITE_ROLES), uploadRecordMiddleware.single('record'), uploadStageRecord);
router.post('/:id/stages/:number/medicine-request', authorize(...PATIENT_WRITE_ROLES), uploadPrescription.array('prescription', 10), requestStageMedicine);
router.post('/:id/stages/:number/followups', authorize(...PATIENT_WRITE_ROLES), addFollowUp);
router.patch('/:id/stages/:number/followups/:entryId', authorize(...PATIENT_WRITE_ROLES), updateFollowUp);
router.post('/:id/stages/:number/family-sessions', authorize(...PATIENT_WRITE_ROLES), addFamilySession);
router.patch('/:id/stages/:number/family-sessions/:entryId', authorize(...PATIENT_WRITE_ROLES), updateFamilySession);

module.exports = router;
