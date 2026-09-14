const express = require('express');
const { login, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', protect, getMe);
router.patch('/password', protect, changePassword);

module.exports = router;
