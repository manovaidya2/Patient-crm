const express = require('express');
const { listCourierRequests, updateCourierRequest, deleteMedicineRequest } = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadCourierImage } = require('../middleware/fileUploads');

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.DISPATCH_COURIER));

router.get('/requests', listCourierRequests);
router.patch('/requests/:patientId/stages/:number', uploadCourierImage.array('courierImage', 10), updateCourierRequest);
router.delete('/requests/:patientId/stages/:number', deleteMedicineRequest);

module.exports = router;
