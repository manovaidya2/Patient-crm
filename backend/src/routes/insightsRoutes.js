const express = require('express');
const c = require('../controllers/insightsController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

// Patient 360° (everyone who works with patients) and the PCC report (Admin, Manager, Doctor; a PCC sees their own).
const router = express.Router();
router.get('/patient-360', protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.POST_COUNSELOR), c.patient360);
router.get('/pcc-report', protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR), c.pccReport);

module.exports = router;
