const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentManagementEntry', required() { return !this.salesAppointment; }, default: null, index: true },
  salesAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: null, index: true },
  collectionStage: { type: String, enum: ['advance', 'reception'], default: 'reception' },
  importedFrom: { type: String, default: '' },
  appointmentCode: { type: String, required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientName: { type: String, required: true, trim: true, maxlength: 200 },
  patientCode: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0.01 },
  date: { type: Date, required: true, index: true },
  paymentMode: { type: String, enum: ['cash', 'online'], required: true },
  cashReceivedByName: { type: String, trim: true, maxlength: 200, default: '' },
  bank: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
  bankName: { type: String, default: '' },
  reference: { type: String, trim: true, maxlength: 200, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  files: { type: [{ url: String, fileName: String }], default: [] },
  status: { type: String, enum: ['pending', 'approved', 'cancelled'], default: 'pending', index: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recordedByName: { type: String, required: true },
  editedByName: { type: String, default: '' },
  editedAt: { type: Date, default: null },
  approvedByName: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  cancelledByName: { type: String, default: '' },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: '' },
  submissionKey: { type: String, required: true, unique: true },
}, { timestamps: true });

module.exports = mongoose.model('ConsultationReceipt', schema);
