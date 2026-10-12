const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  caseRef: { type: String, trim: true, maxlength: 80, default: '' },
  type: { type: String, required: true, enum: ['staff_grievance', 'staff_conflict', 'patient_complaint', 'service_issue', 'safety_incident', 'other'] },
  department: { type: String, trim: true, maxlength: 120, default: '' },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  assignedTo: { type: String, trim: true, maxlength: 150, default: '' },
  status: { type: String, enum: ['open', 'investigating', 'resolved', 'escalated'], default: 'open', index: true },
  action: { type: String, trim: true, maxlength: 2000, default: '' },
  resolutionDue: { type: String, default: '', match: /^(\d{4}-\d{2}-\d{2})?$/ },
  ownerReview: { type: String, trim: true, maxlength: 1000, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
module.exports = mongoose.model('HrIncident', schema);
