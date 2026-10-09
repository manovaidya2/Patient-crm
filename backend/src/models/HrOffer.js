const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  offerCode: { type: String, required: true, unique: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'HrCandidate', required: true, index: true },
  candidateCode: { type: String, required: true }, candidateName: { type: String, required: true },
  designation: { type: String, required: true, trim: true, maxlength: 180 },
  department: { type: String, required: true, trim: true, maxlength: 120 },
  annualCtc: { type: Number, required: true, min: 0 }, monthlyGross: { type: Number, min: 0, default: 0 },
  employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'internship', 'consultant'], default: 'full_time' },
  proposedJoiningDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  validUntil: { type: String, default: '', match: /^$|^\d{4}-\d{2}-\d{2}$/ },
  terms: { type: String, trim: true, maxlength: 5000, default: '' },
  status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted', 'declined', 'expired', 'withdrawn'], default: 'draft', index: true },
  approvalNote: { type: String, trim: true, maxlength: 1000, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, approvedByName: { type: String, default: '' }, approvedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null }, respondedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, updatedAt: -1 });
module.exports = mongoose.model('HrOffer', schema);
