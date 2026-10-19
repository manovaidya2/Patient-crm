const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { listPostCounselingPatients } = require('../controllers/receptionFlowController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.MANAGER));
router.get('/patients', listPostCounselingPatients);

module.exports = router;
