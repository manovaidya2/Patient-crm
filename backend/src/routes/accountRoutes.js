const express = require('express');
const { getAccountsOverview, createAccountEntry, updateAccountEntry } = require('../controllers/accountController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT));

router.get('/overview', getAccountsOverview);
router.post('/entries', createAccountEntry);
router.patch('/entries/:id', updateAccountEntry);

module.exports = router;
