const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { getMedicineCategories, getPaymentDueCategories } = require('../controllers/medicineCategoryController');

// The Control Room sections "Medicine by category" and "Payment pending by category": on the Control Room of the
// Admin / Manager / Doctor, on My Day of In Transit and the Medicine Department, and on the Reception dashboard.
const CONTROL_SECTION_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.IN_TRANSIT, ROLES.MEDICINE_DEPARTMENT, ROLES.RECEPTIONIST];

const router = express.Router();
router.use(protect, authorize(...CONTROL_SECTION_ROLES));
router.get('/medicine-categories', getMedicineCategories);
router.get('/payment-due-categories', getPaymentDueCategories);

module.exports = router;
module.exports.CONTROL_SECTION_ROLES = CONTROL_SECTION_ROLES;
