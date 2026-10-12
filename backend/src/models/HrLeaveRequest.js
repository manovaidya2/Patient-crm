const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  leaveCode: { type: String, required: true, unique: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true, index: true },
  employeeCode: { type: String, required: true }, employeeName: { type: String, required: true }, department: { type: String, required: true },
  leaveType: { type: String, enum: ['casual', 'sick', 'earned', 'unpaid', 'maternity', 'paternity', 'other'], required: true },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  days: { type: Number, required: true, min: 0.5, max: 366 }, halfDay: { type: Boolean, default: false },
  reason: { type: String, required: true, trim: true, maxlength: 3000 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  decisionNote: { type: String, trim: true, maxlength: 1000, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, decidedByName: { type: String, default: '' }, decidedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ employee: 1, startDate: 1, endDate: 1 });
module.exports = mongoose.model('HrLeaveRequest', schema);
