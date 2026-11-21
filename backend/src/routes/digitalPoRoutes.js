const express = require('express');
const c = require('../controllers/digitalPoController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

// Digital purchase order. The two public routes answer only by the link's secret (no login); the signature image is
// and the signed PDF are for logged-in staff who see purchase orders.
const router = express.Router();
router.get('/public/:token', c.publicGuard, c.getPublic);
router.post('/public/:token/sign', c.publicGuard, c.takeSignature, c.signPublic);
router.get('/', protect, authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.POST_COUNSELOR), c.listDigitalPos);
const SEE_SIGNED = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT, ROLES.ASSISTANT_DOCTOR, ROLES.MEDICINE_DEPARTMENT];
router.get('/:id/signature', protect, authorize(...SEE_SIGNED), c.signatureFile);
router.get('/:id/pdf', protect, authorize(...SEE_SIGNED), c.downloadPdf);

module.exports = router;
