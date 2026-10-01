const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/helpDeskController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN));
router.get('/lookup', controller.lookup);
router.get('/', controller.list);

module.exports = router;
