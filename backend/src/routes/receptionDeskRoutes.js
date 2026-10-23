const express = require('express');
const { getDesk } = require('../controllers/receptionDeskController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();
router.get('/desk', protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.SALES_TEAM), getDesk);

module.exports = router;
