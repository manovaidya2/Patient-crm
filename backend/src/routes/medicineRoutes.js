const express = require('express');
const { listMedicineRequests, updateMedicineRequestStatus, deleteMedicineRequest } = require('../controllers/patientController');
const {
  listInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  addEntry,
  addCategory,
  addPackSize,
  removePackSize,
  listLedger,
  decideTransaction,
  getItemHistory,
  raisePurchaseRequest,
} = require('../controllers/medicineInventoryController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadMedicineImage } = require('../middleware/fileUploads');

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT));

router.get('/inventory', listInventory);
router.post('/inventory', createInventoryItem);
router.post('/inventory/entry', addEntry);
router.post('/inventory/categories', addCategory);
router.post('/inventory/pack-sizes', addPackSize);
router.delete('/inventory/pack-sizes', authorize(ROLES.ADMIN, ROLES.DOCTOR), removePackSize);
router.get('/inventory/ledger', listLedger);
router.post('/inventory/ledger/:itemId/:txnId/decision', authorize(ROLES.ADMIN, ROLES.DOCTOR), decideTransaction);
router.get('/inventory/:id/history', getItemHistory);
router.post('/inventory/:id/purchase-request', raisePurchaseRequest);
router.patch('/inventory/:id', updateInventoryItem);
router.delete('/inventory/:id', authorize(ROLES.ADMIN, ROLES.DOCTOR), deleteInventoryItem);

router.get('/requests', listMedicineRequests);
router.patch('/requests/:patientId/stages/:number', uploadMedicineImage.array('medicineImage', 10), updateMedicineRequestStatus);
router.delete('/requests/:patientId/stages/:number', deleteMedicineRequest);

module.exports = router;
