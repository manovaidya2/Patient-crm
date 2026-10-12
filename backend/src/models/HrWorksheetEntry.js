const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  scope: { type: String, enum: ['self', 'employee'], default: 'employee', index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', default: null, index: true },
  employeeCode: { type: String, default: '' },
  hrEmployee: { type: String, required: true, trim: true, maxlength: 150 },
  department: { type: String, enum: ['hr', 'recruitment', 'payroll', 'admin', 'operations', 'other'], default: 'hr' },
  task: { type: String, required: true, trim: true, maxlength: 500 },
  dailyTarget: { type: String, trim: true, maxlength: 300, default: '' },
  actualOutput: { type: String, trim: true, maxlength: 300, default: '' },
  workStatus: { type: String, enum: ['completed', 'in_progress', 'pending', 'delayed', 'blocked'], default: 'completed', index: true },
  delayIssue: { type: String, trim: true, maxlength: 1000, default: '' },
  evidence: { type: String, trim: true, maxlength: 500, default: '' },
  nextAction: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
module.exports = mongoose.model('HrWorksheetEntry', schema);
