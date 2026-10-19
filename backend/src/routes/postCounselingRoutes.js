const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { listPostCounselingPatients } = require('../controllers/receptionFlowController');
const { getRecord, saveRecord, listDone } = require('../controllers/postCounselingRecordController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.MANAGER));
router.get('/patients', listPostCounselingPatients);
router.get('/done', listDone);
router.get('/patients/:id/record', getRecord);
router.put('/patients/:id/record', saveRecord);

module.exports = router;
