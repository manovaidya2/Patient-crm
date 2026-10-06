const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { listHistory, listFilters } = require('../controllers/crmHistoryController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN));
router.get('/filters', listFilters);
router.get('/', listHistory);

module.exports = router;
