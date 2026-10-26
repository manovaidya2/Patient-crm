const express = require('express');
const { login, getMe, changePassword, updateMyAccount } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', protect, getMe);
router.patch('/password', protect, changePassword);
router.patch('/account', protect, updateMyAccount);

module.exports = router;
