const express = require('express');
const controller = require('../controllers/teamChatController');
const { protect, authorize } = require('../middleware/auth');
const { GENERAL_CRM_ROLES } = require('../constants/roles');
const { uploadTeamChatFile } = require('../middleware/fileUploads');

const router = express.Router();
router.use(protect, authorize(...GENERAL_CRM_ROLES));
router.get('/people', controller.people);
router.get('/with/:userId', controller.withUser);
router.get('/pairs', controller.pairs);
router.get('/pair/:pairKey', controller.pairView);
router.get('/staff', controller.staff);
router.get('/context', controller.poContext);
router.get('/unread', controller.unread);
router.get('/', controller.list);
router.post('/', uploadTeamChatFile.array('files', 5), controller.create);
router.get('/:id', controller.detail);
router.post('/:id/messages', uploadTeamChatFile.array('files', 5), controller.send);
router.post('/:id/action', controller.act);

module.exports = router;
