const express = require('express');
const { BANK_ACCESS_ROLES, BANK_READ_ROLES, listBanks, createBank, updateBank, lookupIfsc } = require('../controllers/bankController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', authorize(...BANK_READ_ROLES), listBanks);
router.use(authorize(...BANK_ACCESS_ROLES));
router.get('/ifsc/:code', lookupIfsc);
router.post('/', createBank);
router.patch('/:id', updateBank);

module.exports = router;
