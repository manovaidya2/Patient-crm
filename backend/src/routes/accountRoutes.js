const express = require('express');
const { getAccountsOverview, createAccountEntry, updateAccountEntry } = require('../controllers/accountController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const ledger = require('../controllers/financialLedgerController');
const { uploadConsultationFeeProof } = require('../middleware/fileUploads');

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.IN_TRANSIT));

router.get('/overview', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST), getAccountsOverview);
router.get('/ledger', ledger.getLedger);
router.get('/ledger/references', ledger.references);
router.get('/ledger/banks', ledger.banks);
router.post('/consultation-receipts', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST), uploadConsultationFeeProof.array('proof', 5), ledger.createReceipt);
router.patch('/consultation-receipts/:id', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST), ledger.reviewReceipt);
router.delete('/consultation-receipts/:id', authorize(ROLES.ADMIN), ledger.deleteReceipt);
router.delete('/consultation-receipts/:id/files', authorize(ROLES.ADMIN), ledger.deleteReceiptFile);
router.post('/entries', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST), createAccountEntry);
router.patch('/entries/:id', authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST), updateAccountEntry);

module.exports = router;
