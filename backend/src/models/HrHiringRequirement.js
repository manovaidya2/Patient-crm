const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  action: { type: String, required: true }, details: { type: String, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true }, createdAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  requirementCode: { type: String, required: true, unique: true, index: true },
  positionTitle: { type: String, required: true, trim: true, maxlength: 180 },
  department: { type: String, required: true, trim: true, maxlength: 120, index: true },
  location: { type: String, trim: true, maxlength: 180, default: '' },
  employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'internship', 'consultant'], default: 'full_time' },
  openings: { type: Number, required: true, min: 1, max: 999 },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
  targetDate: { type: String, default: '', match: /^$|^\d{4}-\d{2}-\d{2}$/ },
  reason: { type: String, required: true, trim: true, maxlength: 3000 },
  skills: { type: [String], default: [] },
  requestedByName: { type: String, required: true, trim: true, maxlength: 150 },
  status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'rejected', 'closed'], default: 'draft', index: true },
  approvalNote: { type: String, trim: true, maxlength: 1000, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedByName: { type: String, default: '' }, approvedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
  timeline: { type: [eventSchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model('HrHiringRequirement', schema);
