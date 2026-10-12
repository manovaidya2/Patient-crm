const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true }, details: { type: String, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true }, createdAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  employeeCode: { type: String, required: true, unique: true, index: true },
  onboarding: { type: mongoose.Schema.Types.ObjectId, ref: 'HrOnboarding', default: null, unique: true, sparse: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'HrCandidate', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  nameKey: { type: String, trim: true, select: false },
  email: { type: String, trim: true, lowercase: true, maxlength: 180, default: '' },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  phoneKey: { type: String, trim: true, select: false },
  emergencyContact: { type: String, trim: true, maxlength: 100, default: '' },
  department: { type: String, required: true, trim: true, maxlength: 120, index: true },
  designation: { type: String, required: true, trim: true, maxlength: 180 },
  employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'internship', 'consultant'], default: 'full_time' },
  joiningDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  workLocation: { type: String, trim: true, maxlength: 180, default: '' },
  reportingManager: { type: String, trim: true, maxlength: 180, default: '' },
  probationEndDate: { type: String, default: '', match: /^$|^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ['active', 'probation', 'notice_period', 'inactive', 'exited'], default: 'active', index: true },
  address: { type: String, trim: true, maxlength: 1000, default: '' },
  notes: { type: String, trim: true, maxlength: 3000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
  activity: { type: [activitySchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, department: 1, name: 1 });
schema.index({ nameKey: 1, phoneKey: 1 }, { unique: true, partialFilterExpression: { nameKey: { $type: 'string' }, phoneKey: { $type: 'string' } } });
module.exports = mongoose.model('HrEmployee', schema);
