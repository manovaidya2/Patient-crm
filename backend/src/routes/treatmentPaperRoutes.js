const express = require('express');
const { getSetting, saveSetting, listPapers, paperAlarms } = require('../controllers/treatmentPaperController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

// Treatment papers: Medicine Department. Final medicine check: the chosen PCC.
const router = express.Router();
router.use(protect);
router.get('/', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR, ROLES.MEDICINE_DEPARTMENT), listPapers);
router.get('/alarms', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR), paperAlarms);
router.get('/setting', authorize(ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR), getSetting);
router.put('/setting', authorize(ROLES.ADMIN), saveSetting);

module.exports = router;
