const express = require('express');
const { MASTER_EDIT_ROLES, MASTER_VIEW_ROLES, listMasters, updateMaster, resetMaster } = require('../controllers/formulationMasterController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(protect);
router.get('/', authorize(...MASTER_VIEW_ROLES), listMasters);
router.put('/:ageBand', authorize(...MASTER_EDIT_ROLES), updateMaster);
router.post('/:ageBand/reset', authorize(...MASTER_EDIT_ROLES), resetMaster);

module.exports = router;
