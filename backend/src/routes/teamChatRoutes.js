const express = require('express');
const controller = require('../controllers/teamChatController');
const { protect, authorize } = require('../middleware/auth');
const { GENERAL_CRM_ROLES } = require('../constants/roles');
const { uploadTeamChatFile } = require('../middleware/fileUploads');

const router = express.Router();
router.use(protect, authorize(...GENERAL_CRM_ROLES));
// Alarms: ring a member for something important (before /:id so they are not read as a chat id).
const alarms = require('../controllers/chatAlarmController');
router.post('/alarms', alarms.ringAlarm);
router.get('/alarms/mine', alarms.myAlarms);
router.get('/alarms/sent', alarms.sentAlarms);
router.post('/alarms/:id/ack', alarms.ackAlarm);
router.post('/alarms/:id/cancel', alarms.cancelAlarm);
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
router.post('/:id/clear', controller.clearForMe);
router.post('/:id/messages/:messageId/delete', controller.deleteMessage);
router.delete('/:id', controller.removeChat);

module.exports = router;
