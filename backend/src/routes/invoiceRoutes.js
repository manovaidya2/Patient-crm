const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { findPatients, listInvoices, createInvoice, getPdf } = require('../controllers/invoiceController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.DOCTOR));
router.get('/patients', findPatients);
router.get('/', listInvoices);
router.post('/', createInvoice);
router.get('/:id/pdf', getPdf);
module.exports = router;
