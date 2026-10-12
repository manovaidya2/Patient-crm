const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  jdCode: { type: String, required: true, unique: true, index: true },
  requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'HrHiringRequirement', required: true, index: true },
  requirementCode: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  department: { type: String, required: true, trim: true, maxlength: 120 },
  summary: { type: String, required: true, trim: true, maxlength: 5000 },
  responsibilities: { type: String, required: true, trim: true, maxlength: 8000 },
  qualifications: { type: String, required: true, trim: true, maxlength: 5000 },
  experience: { type: String, trim: true, maxlength: 500, default: '' },
  salaryRange: { type: String, trim: true, maxlength: 300, default: '' },
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, department: 1, updatedAt: -1 });
module.exports = mongoose.model('HrJobDescription', schema);
