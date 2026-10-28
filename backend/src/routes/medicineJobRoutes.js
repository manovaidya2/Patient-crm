const express = require('express');
const { JOB_ROLES, JOB_VIEW_ROLES, getPatientFile, openForRequest, listJobs, getJob, setSupply, editFormulation, rebuildSheet, completeStage, holdJob, resumeJob, revertJob } = require('../controllers/medicineJobController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadMedicineImage } = require('../middleware/fileUploads');

const router = express.Router();
router.use(protect);
router.get('/', authorize(...JOB_VIEW_ROLES), listJobs);
router.post('/for-request', authorize(...JOB_ROLES), openForRequest);
router.get('/patient-file/:patientId', authorize(...JOB_VIEW_ROLES), getPatientFile);
router.get('/:id', authorize(...JOB_VIEW_ROLES), getJob);
router.patch('/:id/supply', authorize(...JOB_ROLES), setSupply);
router.patch('/:id/formulation', authorize(...JOB_ROLES), editFormulation);
router.post('/:id/rebuild', authorize(...JOB_ROLES), rebuildSheet);
router.post('/:id/stages/:key', authorize(...JOB_ROLES), uploadMedicineImage.fields([{ name: 'photoA', maxCount: 5 }, { name: 'photoB', maxCount: 10 }]), completeStage);
router.post('/:id/hold', authorize(...JOB_ROLES), holdJob);
router.post('/:id/revert', authorize(ROLES.ADMIN), revertJob);
router.post('/:id/resume', authorize(...JOB_ROLES), resumeJob);

module.exports = router;
