const mongoose = require('mongoose');

const crmChatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const crmChatConversationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: 'New Chat',
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ownerName: { type: String, trim: true, default: '' },
    messages: [crmChatMessageSchema],
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CrmChatConversation', crmChatConversationSchema);
