const express = require('express');
const { MASTER_EDIT_ROLES, MASTER_VIEW_ROLES, listMasters, updateMaster, resetMaster } = require('../controllers/formulationMasterController');
const { protect, authorize } = require('../middleware/auth');
const { listDoseTemplates, addDoseTemplate } = require('../controllers/doseTemplateController');

const router = express.Router();
router.use(protect);
router.get('/dose-templates', authorize(...MASTER_VIEW_ROLES), listDoseTemplates);
router.post('/dose-templates', authorize(...MASTER_EDIT_ROLES), addDoseTemplate);
router.get('/', authorize(...MASTER_VIEW_ROLES), listMasters);
router.put('/:ageBand', authorize(...MASTER_EDIT_ROLES), updateMaster);
router.post('/:ageBand/reset', authorize(...MASTER_EDIT_ROLES), resetMaster);

module.exports = router;
