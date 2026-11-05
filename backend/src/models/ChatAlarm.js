const mongoose = require('mongoose');

// A member rings another member's alarm from Team Chat for something important: the siren rings on their screen (on
// every login / refresh, snooze 20 min) until they answer "I'm on it" or the sender cancels it.
const schema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fromName: { type: String, trim: true, default: '' },
  fromRole: { type: String, trim: true, default: '' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  toName: { type: String, trim: true, default: '' },
  toRole: { type: String, trim: true, default: '' },
  reason: { type: String, trim: true, required: true, maxlength: 500 },
  // The direct chat of the two, where the ring and the answer are also written.
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamChat', default: null },
  status: { type: String, enum: ['ringing', 'acknowledged', 'cancelled'], default: 'ringing', index: true },
  ackAt: { type: Date, default: null },
  ackNote: { type: String, trim: true, default: '', maxlength: 500 },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ to: 1, status: 1 });

module.exports = mongoose.model('ChatAlarm', schema);
