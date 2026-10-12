const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true },
  details: { type: String, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const hrLifecycleRecordSchema = new mongoose.Schema({
  module: { type: String, enum: ['kpis', 'performance', 'appraisals', 'pip', 'grievances', 'payroll', 'exits'], required: true, index: true },
  recordCode: { type: String, required: true, unique: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true, index: true },
  employeeCode: { type: String, required: true, index: true },
  employeeName: { type: String, required: true, index: true },
  department: { type: String, default: '', index: true },
  title: { type: String, required: true },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  status: { type: String, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  confidential: { type: Boolean, default: false },
  submittedAt: { type: Date, default: null },
  decidedAt: { type: Date, default: null },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedByName: { type: String, default: '' },
  decisionNote: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedByName: { type: String, required: true },
  activity: { type: [activitySchema], default: [] },
}, { timestamps: true });

hrLifecycleRecordSchema.index({ module: 1, employee: 1, startDate: -1 });

module.exports = mongoose.model('HrLifecycleRecord', hrLifecycleRecordSchema);
