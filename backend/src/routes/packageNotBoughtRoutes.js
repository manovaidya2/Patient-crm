const express = require('express');
const {
  ACCESS_ROLES,
  FOLLOWUP_WRITE_ROLES,
  listPackageNotBought,
  getPackageNotBoughtById,
  createPackageNotBought,
  updatePackageNotBought,
  closePackageNotBought,
  reopenPackageNotBought,
  addPackageNotBoughtFollowUp,
  completePackageNotBoughtFollowUp,
  markPackageNotBoughtConverted,
  getPurchaseForm,
  deletePackageNotBought,
} = require('../controllers/packageNotBoughtController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect, authorize(...ACCESS_ROLES));

router.get('/', listPackageNotBought);
router.post('/', createPackageNotBought);
router.get('/:id', getPackageNotBoughtById);
router.patch('/:id', updatePackageNotBought);
router.post('/:id/followups', authorize(...FOLLOWUP_WRITE_ROLES), addPackageNotBoughtFollowUp);
router.patch('/:id/followups/:followUpId/complete', authorize(...FOLLOWUP_WRITE_ROLES), completePackageNotBoughtFollowUp);
router.get('/:id/purchase-form', getPurchaseForm);
router.patch('/:id/convert', markPackageNotBoughtConverted);
router.patch('/:id/close', closePackageNotBought);
router.patch('/:id/reopen', reopenPackageNotBought);
router.delete('/:id', deletePackageNotBought);

module.exports = router;
