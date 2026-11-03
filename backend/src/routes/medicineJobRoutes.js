const express = require('express');
const { ringTransit, transitAlarms, doctorAlarms, JOB_ROLES, JOB_VIEW_ROLES, getPatientFile, openForRequest, listJobs, getJob, setSupply, editFormulation, rebuildSheet, completeStage, holdJob, resumeJob, revertJob, returnToTransit } = require('../controllers/medicineJobController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadMedicineImage } = require('../middleware/fileUploads');

const router = express.Router();
router.use(protect);
router.get('/', authorize(...JOB_VIEW_ROLES), listJobs);
// Formulations pending with the doctor for over a day (the doctor's alarm).
router.get('/doctor-alarms', authorize(ROLES.DOCTOR, ROLES.ADMIN), doctorAlarms);
// In Transit's alarm, rung by the Medicine Department while a job waits on In Transit.
router.get('/transit-alarms', authorize(ROLES.IN_TRANSIT, ROLES.ADMIN), transitAlarms);
router.post('/for-request', authorize(...JOB_ROLES), openForRequest);
router.get('/patient-file/:patientId', authorize(...JOB_VIEW_ROLES), getPatientFile);
router.get('/:id', authorize(...JOB_VIEW_ROLES), getJob);
router.patch('/:id/supply', authorize(...JOB_ROLES), setSupply);
router.patch('/:id/formulation', authorize(...JOB_ROLES), editFormulation);
router.post('/:id/rebuild', authorize(...JOB_ROLES), rebuildSheet);
router.post('/:id/stages/:key', authorize(...JOB_ROLES, ROLES.IN_TRANSIT, ROLES.ASSISTANT_DOCTOR), uploadMedicineImage.fields([{ name: 'photoA', maxCount: 10 }, { name: 'photoB', maxCount: 10 }, ...Array.from({ length: 10 }, (_, i) => ({ name: `paper_${i}`, maxCount: 30 }))]), completeStage);
router.post('/:id/hold', authorize(...JOB_ROLES, ROLES.IN_TRANSIT, ROLES.ASSISTANT_DOCTOR), holdJob);
router.post('/:id/return', authorize(...JOB_ROLES), returnToTransit);
router.post('/:id/ring-transit', authorize(ROLES.MEDICINE_DEPARTMENT, ROLES.ADMIN), ringTransit);
router.post('/:id/revert', authorize(ROLES.ADMIN), revertJob);
router.post('/:id/resume', authorize(...JOB_ROLES), resumeJob);

module.exports = router;
