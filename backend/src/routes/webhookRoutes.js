const express = require('express');
const { receivePatientWebhook, receiveCallWebhook, getCallLogs } = require('../controllers/webhookController');
const { protect, authorize } = require('../middleware/auth');
const { uploadCallRecording } = require('../middleware/fileUploads');
const { verifyWebhookSecret } = require('../middleware/webhookAuth');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.post('/patients', verifyWebhookSecret, receivePatientWebhook);
router.post('/calls', verifyWebhookSecret, uploadCallRecording.single('recording'), receiveCallWebhook);
router.get('/calls', protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.POST_COUNSELOR), getCallLogs);

module.exports = router;
