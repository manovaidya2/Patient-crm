const express = require('express');
const { listCourierRequests, updateCourierRequest, deleteCourierRequest } = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadCourierImage } = require('../middleware/fileUploads');

const router = express.Router();

// Medicines made but not delivered yet, with why ("Ready, Not Delivered"): In Transit, and the Doctor / Manager / Admin to watch it.
router.get('/ready-not-delivered', protect, authorize(ROLES.ADMIN, ROLES.IN_TRANSIT, ROLES.DOCTOR), require('../controllers/purchaseOrderController').listReadyNotDelivered);

router.use(protect, authorize(ROLES.ADMIN, ROLES.IN_TRANSIT));

router.get('/requests', listCourierRequests);
// New flow: scheduled handovers from the PO / In Transit timeline.
router.get('/handovers', require('../controllers/purchaseOrderController').listCourierHandovers);
router.patch('/requests/:patientId/stages/:number', uploadCourierImage.array('courierImage', 10), updateCourierRequest);
router.delete('/requests/:patientId/stages/:number', deleteCourierRequest);

module.exports = router;
