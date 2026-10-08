const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { findPatients, listInvoices, createInvoice, updateInvoice, deleteInvoice, getPdf, getSettings, updateSettings } = require('../controllers/invoiceController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.RECEPTIONIST));
router.get('/patients', findPatients);
router.get('/settings', getSettings);
router.put('/settings', authorize(ROLES.ADMIN), updateSettings);
router.get('/', listInvoices);
router.post('/', createInvoice);
router.put('/:id', authorize(ROLES.ADMIN), updateInvoice);
router.delete('/:id', authorize(ROLES.ADMIN), deleteInvoice);
router.get('/:id/revisions/:revision/pdf', getPdf);
router.get('/:id/pdf', getPdf);
module.exports = router;
