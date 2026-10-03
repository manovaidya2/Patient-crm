const express = require('express');
const { getAccountsOverview, createAccountEntry, updateAccountEntry } = require('../controllers/accountController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const ledger = require('../controllers/financialLedgerController');
const { uploadConsultationFeeProof } = require('../middleware/fileUploads');

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT));

router.get('/overview', getAccountsOverview);
router.get('/ledger', ledger.getLedger);
router.get('/ledger/references', ledger.references);
router.get('/ledger/banks', ledger.banks);
router.post('/consultation-receipts', uploadConsultationFeeProof.array('proof', 5), ledger.createReceipt);
router.patch('/consultation-receipts/:id', ledger.reviewReceipt);
router.delete('/consultation-receipts/:id', authorize(ROLES.ADMIN), ledger.deleteReceipt);
router.post('/entries', createAccountEntry);
router.patch('/entries/:id', updateAccountEntry);

module.exports = router;
