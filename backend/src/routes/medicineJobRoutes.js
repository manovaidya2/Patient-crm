const express = require('express');
const { ringTransit, transitAlarms, doctorAlarms, JOB_ROLES, JOB_VIEW_ROLES, getPatientFile, openForRequest, listJobs, getJob, setSupply, editFormulation, rebuildSheet, completeStage, holdJob, resumeJob, revertJob, returnToTransit } = require('../controllers/medicineJobController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadMedicineImage } = require('../middleware/fileUploads');

const router = express.Router();
router.use(protect);
router.get('/', authorize(...JOB_VIEW_ROLES), listJobs);
router.get('/box-receipts', authorize(...JOB_VIEW_ROLES), require('../controllers/medicineJobController').listBoxReceipts);
router.get('/release-requests', authorize(...JOB_VIEW_ROLES), require('../controllers/medicineJobController').listReleaseRequests);
// Formulations pending with the doctor for over a day (the doctor's alarm).
router.get('/doctor-alarms', authorize(ROLES.DOCTOR, ROLES.ADMIN), doctorAlarms);
// In Transit's alarm, rung by the Medicine Department while a job waits on In Transit.
// The Manager's quality-check alarm (rung by the Medicine Department); /transit-alarms is the old name.
router.get('/qc-alarms', authorize(ROLES.MANAGER, ROLES.ADMIN), transitAlarms);
router.get('/transit-alarms', authorize(ROLES.MANAGER, ROLES.ADMIN), transitAlarms);
router.post('/for-request', authorize(...JOB_ROLES), openForRequest);
router.get('/patient-file/:patientId', authorize(...JOB_VIEW_ROLES), getPatientFile);
router.get('/:id', authorize(...JOB_VIEW_ROLES), getJob);
router.get('/:id/release-payments', authorize(ROLES.IN_TRANSIT, ROLES.MEDICINE_DEPARTMENT, ROLES.ADMIN), require('../controllers/medicineJobController').getReleasePayments);
router.patch('/:id/supply', authorize(...JOB_ROLES), setSupply);
router.patch('/:id/formulation', authorize(...JOB_ROLES), editFormulation);
router.post('/:id/rebuild', authorize(...JOB_ROLES), rebuildSheet);
router.post('/:id/stages/:key', authorize(...JOB_ROLES, ROLES.IN_TRANSIT, ROLES.ASSISTANT_DOCTOR), uploadMedicineImage.fields([{ name: 'photoA', maxCount: 10 }, { name: 'photoB', maxCount: 10 }, ...Array.from({ length: 10 }, (_, i) => ({ name: `paper_${i}`, maxCount: 30 }))]), completeStage);
router.post('/:id/hold', authorize(...JOB_ROLES, ROLES.IN_TRANSIT, ROLES.ASSISTANT_DOCTOR), holdJob);
router.post('/:id/doctor-verification', authorize(ROLES.ASSISTANT_DOCTOR), require('../controllers/medicineJobController').confirmDoctorVerification);
router.post('/:id/box-receipt/:action(request|receive)', authorize(ROLES.MEDICINE_DEPARTMENT, ROLES.ASSISTANT_DOCTOR, ROLES.ADMIN), require('../controllers/medicineJobController').updateBoxReceipt);
router.post('/:id/release-request/:action(request|verify-payment|accept|status|extend|cancel|reopen)', authorize(ROLES.IN_TRANSIT, ROLES.MEDICINE_DEPARTMENT, ROLES.ADMIN), require('../controllers/medicineJobController').updateReleaseRequest);
router.post('/:id/return', authorize(...JOB_ROLES), returnToTransit);
router.post('/:id/ring-transit', authorize(ROLES.MEDICINE_DEPARTMENT, ROLES.ADMIN), ringTransit);
router.post('/:id/revert', authorize(ROLES.ADMIN, ROLES.MANAGER), revertJob);
router.post('/:id/resume', authorize(...JOB_ROLES), resumeJob);

module.exports = router;
