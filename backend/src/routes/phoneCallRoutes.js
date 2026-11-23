const express = require('express');
const c = require('../controllers/phoneCallController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

// Calls from the staff phones. The webhook answers to the call app's key only (no login); the Calls page, its setup
// and the recordings are for the Admin.
const router = express.Router();
router.post('/webhook', c.verifySecret, c.takeRecording, c.receive);
router.get('/', protect, authorize(ROLES.ADMIN), c.listCalls);
router.get('/setup', protect, authorize(ROLES.ADMIN), c.setup);
router.get('/:id/recording', protect, authorize(ROLES.ADMIN), c.recordingFile);

module.exports = router;
