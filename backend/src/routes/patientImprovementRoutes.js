const express = require('express');
const { IMPROVEMENT_ACCESS_ROLES, getImprovementBoard, syncMonthToMarketing, addPatientToMarketing } = require('../controllers/patientImprovementController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.use(protect, authorize(...IMPROVEMENT_ACCESS_ROLES));

router.get('/', getImprovementBoard);
router.post('/sync', authorize(ROLES.ADMIN, ROLES.DOCTOR), syncMonthToMarketing);
router.post('/:patientId/marketing', addPatientToMarketing);

module.exports = router;
