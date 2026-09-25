const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/clinicInventoryController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.RECEPTIONIST));
router.get('/', controller.listClinicInventory);
router.post('/', controller.createClinicInventoryItem);
router.patch('/:id', controller.updateClinicInventoryItem);
router.post('/:id/transactions', controller.addClinicInventoryTransaction);

module.exports = router;
