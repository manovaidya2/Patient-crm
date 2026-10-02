const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/clinicInventoryController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.RECEPTIONIST));
const files = require('../controllers/clinicInventoryFiles');
const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.post('/:id/soft-copy', upload.single('file'), files.upload);
router.get('/:id/soft-copy', files.view);
router.get('/', controller.listClinicInventory);
router.post('/', controller.createClinicInventoryItem);
router.patch('/:id', controller.updateClinicInventoryItem);
router.delete('/:id', authorize(ROLES.ADMIN), controller.deleteClinicInventoryItem);
router.post('/:id/transactions', controller.addClinicInventoryTransaction);

module.exports = router;
