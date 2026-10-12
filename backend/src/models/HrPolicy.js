const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  policyCode: { type: String, required: true, unique: true, index: true }, title: { type: String, required: true, trim: true, maxlength: 220 },
  category: { type: String, required: true, trim: true, maxlength: 120 }, version: { type: String, required: true, trim: true, maxlength: 30 },
  effectiveDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, content: { type: String, required: true, trim: true, maxlength: 30000 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, publishedByName: { type: String, default: '' }, publishedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ status: 1, effectiveDate: -1 });
module.exports = mongoose.model('HrPolicy', schema);
