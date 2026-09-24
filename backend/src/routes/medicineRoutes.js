const express = require('express');
const { listMedicineRequests, updateMedicineRequestStatus, deleteMedicineRequest } = require('../controllers/patientController');
const {
  listInventory,
  createInventoryItem,
  updateInventoryItem,
  addInventoryTransaction,
} = require('../controllers/medicineInventoryController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadMedicineImage } = require('../middleware/fileUploads');

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT));

router.get('/inventory', listInventory);
router.post('/inventory', createInventoryItem);
router.patch('/inventory/:id', updateInventoryItem);
router.post('/inventory/:id/transactions', addInventoryTransaction);

router.get('/requests', listMedicineRequests);
router.patch('/requests/:patientId/stages/:number', uploadMedicineImage.array('medicineImage', 10), updateMedicineRequestStatus);
router.delete('/requests/:patientId/stages/:number', deleteMedicineRequest);

module.exports = router;
