const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true },
  details: { type: String, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  candidateCode: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  alternatePhone: { type: String, trim: true, maxlength: 30, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 180, default: '' },
  appliedPosition: { type: String, required: true, trim: true, maxlength: 180 },
  source: { type: String, trim: true, maxlength: 120, default: '' },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'HrCampaign', default: null, index: true },
  campaignCode: { type: String, default: '' },
  stage: {
    type: String,
    enum: ['new', 'calling', 'interested', 'screening', 'interview_scheduled', 'interviewed', 'selected', 'offer_sent', 'joined', 'rejected', 'on_hold', 'withdrawn'],
    default: 'new',
    index: true,
  },
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  screening: {
    status: { type: String, enum: ['pending', 'shortlisted', 'rejected', 'on_hold'], default: 'pending' },
    rating: { type: Number, min: 1, max: 5, default: null },
    education: { type: String, trim: true, maxlength: 500, default: '' },
    experience: { type: String, trim: true, maxlength: 500, default: '' },
    currentCtc: { type: String, trim: true, maxlength: 300, default: '' },
    expectedCtc: { type: String, trim: true, maxlength: 300, default: '' },
    noticePeriod: { type: String, trim: true, maxlength: 300, default: '' },
    remarks: { type: String, trim: true, maxlength: 3000, default: '' },
    screenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    screenedByName: { type: String, default: '' }, screenedAt: { type: Date, default: null },
  },
  isActive: { type: Boolean, default: true, index: true },
  latestCall: { type: mongoose.Schema.Types.ObjectId, ref: 'HrCallRecord', default: null },
  latestCallAt: { type: Date, default: null },
  latestCallOutcome: { type: String, default: '' },
  nextFollowUpAt: { type: Date, default: null, index: true },
  totalCalls: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedByName: { type: String, required: true },
  activity: { type: [activitySchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ name: 1, appliedPosition: 1 });
schema.index({ phone: 1 });

module.exports = mongoose.model('HrCandidate', schema);
