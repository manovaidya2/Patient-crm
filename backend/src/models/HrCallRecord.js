const mongoose = require('mongoose');

const changeSchema = new mongoose.Schema({
  field: { type: String, required: true },
  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const editSchema = new mongoose.Schema({
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editedByName: { type: String, required: true },
  editedAt: { type: Date, default: Date.now },
  changes: { type: [changeSchema], default: [] },
}, { _id: true });

const schema = new mongoose.Schema({
  callCode: { type: String, required: true, unique: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'HrCandidate', required: true, index: true },
  candidateCode: { type: String, required: true, index: true },
  candidateName: { type: String, required: true },
  appliedPosition: { type: String, required: true, index: true },
  callDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  callTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  callAt: { type: Date, required: true, index: true },
  callType: { type: String, enum: ['first_call', 'follow_up', 'other'], required: true },
  outcome: {
    type: String,
    enum: ['connected', 'no_answer', 'busy', 'switched_off', 'callback_requested', 'interested', 'not_interested', 'wrong_number', 'other'],
    required: true,
    index: true,
  },
  remarks: { type: String, required: true, trim: true, maxlength: 3000 },
  nextFollowUpAt: { type: Date, default: null, index: true },
  followUpStatus: { type: String, enum: ['pending', 'completed', 'cancelled', 'not_required'], default: 'not_required', index: true },
  followUpCompletedAt: { type: Date, default: null },
  followUpCompletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  followUpCompletedByName: { type: String, default: '' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recordedByName: { type: String, required: true },
  source: { type: String, enum: ['hr_entered'], default: 'hr_entered' },
  editHistory: { type: [editSchema], default: [] },
  voidedAt: { type: Date, default: null, index: true },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidedByName: { type: String, default: '' },
  voidReason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ candidate: 1, callAt: -1 });
schema.index({ followUpStatus: 1, nextFollowUpAt: 1, voidedAt: 1 });
schema.index({ callDate: 1, outcome: 1 });

module.exports = mongoose.model('HrCallRecord', schema);
