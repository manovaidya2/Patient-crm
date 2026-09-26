const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true },
  note: { type: String, trim: true, default: '' },
  actorName: { type: String, trim: true, default: '' },
  actorRole: { type: String, trim: true, default: '' },
}, { timestamps: true });

const schema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientCode: { type: String, trim: true, uppercase: true, default: '' },
  patientName: { type: String, trim: true, default: '' },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: null },
  appointmentManagement: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentManagementEntry', default: null },
  appointmentCode: { type: String, trim: true, default: '' },
  issue: { type: String, required: true, trim: true },
  askedBy: { type: String, trim: true, default: '' },
  reference: { type: String, trim: true, default: '' },
  sentTo: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  solution: { type: String, trim: true, default: '' },
  solutionReference: { type: String, trim: true, default: '' },
  solutionGivenByName: { type: String, trim: true, default: '' },
  solutionGivenAt: { type: Date, default: null },
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
  history: { type: [historySchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PatientHelpDeskQuery', schema);
