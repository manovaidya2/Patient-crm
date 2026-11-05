const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadExpenseBill } = require('../middleware/fileUploads');
const c = require('../controllers/expenseController');

// Expenses & vouchers: Reception (clinic), Medicine Department (medicine purchases), Admin / Doctor (both, approve and
// settle), the Manager (both departments). The controller scopes each person to their kind.
const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.RECEPTIONIST, ROLES.MEDICINE_DEPARTMENT));
router.get('/', c.listExpenses);
router.post('/', uploadExpenseBill.array('bills', 5), c.createExpense);
router.post('/repay-person', c.repayPerson);
router.patch('/:id', uploadExpenseBill.array('bills', 5), c.updateExpense);
router.post('/:id/voucher', c.makeVoucher);
router.post('/:id/voucher/approve', c.approveVoucher);
router.post('/:id/voucher/reject', c.rejectVoucher);
router.post('/:id/settle', c.settleExpense);
router.post('/:id/not-needed', c.markNotNeeded);
router.delete('/:id', c.deleteExpense);

module.exports = router;
