const express = require('express');
const {
  PO_VIEW_ROLES, PO_CREATE_ROLES, PO_VERIFY_ROLES,
  listPurchaseOrders, getPurchaseOrder, getPurchaseOrderForm, uploadPaperFiles, createPurchaseOrder, updatePurchaseOrder, addPurchaseOrderPayment,
  verifyDetails, verifyPayment, rejectPurchaseOrder, requestMedicine, activatePhase,
} = require('../controllers/purchaseOrderController');
const { protect, authorize } = require('../middleware/auth');
const { uploadPurchaseOrderFile, uploadPrescription } = require('../middleware/fileUploads');
const { uploadPaymentScreenshot } = require('../middleware/upload');

const router = express.Router();
const poFiles = uploadPurchaseOrderFile.fields([{ name: 'paper', maxCount: 10 }, { name: 'screenshot', maxCount: 10 }]);

router.use(protect);
router.get('/', authorize(...PO_VIEW_ROLES), listPurchaseOrders);
router.get('/form', authorize(...PO_CREATE_ROLES), getPurchaseOrderForm);
router.post('/upload', authorize(...PO_CREATE_ROLES), uploadPaymentScreenshot.array('screenshot', 10), uploadPaperFiles);
router.post('/', authorize(...PO_CREATE_ROLES), createPurchaseOrder);
router.get('/:id', authorize(...PO_VIEW_ROLES), getPurchaseOrder);
router.patch('/:id', authorize(...PO_CREATE_ROLES), poFiles, updatePurchaseOrder);
router.post('/:id/payments', authorize(...PO_CREATE_ROLES), poFiles, addPurchaseOrderPayment);
router.post('/:id/verify-details', authorize(...PO_VERIFY_ROLES), verifyDetails);
router.post('/:id/verify-payment', authorize(...PO_VERIFY_ROLES), verifyPayment);
router.post('/:id/reject', authorize(...PO_VERIFY_ROLES), rejectPurchaseOrder);
router.post('/:id/medicine-request', authorize(...PO_VERIFY_ROLES), uploadPrescription.array('prescription', 10), requestMedicine);
router.post('/:id/activate-phase', authorize(...PO_VERIFY_ROLES), activatePhase);

module.exports = router;
