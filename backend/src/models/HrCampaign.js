const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  campaignCode: { type: String, required: true, unique: true, index: true },
  jobDescription: { type: mongoose.Schema.Types.ObjectId, ref: 'HrJobDescription', required: true, index: true },
  jdCode: { type: String, required: true }, positionTitle: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  channels: { type: [String], default: [] },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endDate: { type: String, default: '', match: /^$|^\d{4}-\d{2}-\d{2}$/ },
  budget: { type: Number, min: 0, default: 0 }, targetApplications: { type: Number, min: 0, default: 0 },
  notes: { type: String, trim: true, maxlength: 3000, default: '' },
  status: { type: String, enum: ['planned', 'active', 'paused', 'completed', 'cancelled'], default: 'planned', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, startDate: -1 });
module.exports = mongoose.model('HrCampaign', schema);
