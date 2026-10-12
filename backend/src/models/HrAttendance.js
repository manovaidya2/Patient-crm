const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true, index: true },
  employeeCode: { type: String, required: true }, employeeName: { type: String, required: true },
  department: { type: String, required: true }, date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  status: { type: String, enum: ['present', 'absent', 'half_day', 'short_day', 'leave', 'holiday', 'work_from_home'], required: true, index: true },
  checkIn: { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
  checkOut: { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
  workedMinutes: { type: Number, min: 0, max: 1440, default: 0 },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ employee: 1, date: 1 }, { unique: true });
schema.index({ date: -1, status: 1 });
module.exports = mongoose.model('HrAttendance', schema);
