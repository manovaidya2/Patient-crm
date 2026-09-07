const express = require('express');
const {
  listConversations,
  createConversation,
  getConversation,
  sendMessage,
  deleteConversation,
} = require('../controllers/crmChatController');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR));

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);
router.post('/conversations/:id/messages', sendMessage);

module.exports = router;
