const mongoose = require('mongoose');
const callEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['connected', 'no_answer', 'follow_up'], required: true },
  notes: { type: String, trim: true, required: true, maxlength: 2000 },
  calledAt: { type: Date, required: true },
  calledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  calledByName: { type: String, required: true },
});

const schema = new mongoose.Schema({
  appointmentDate: { type: String, required: true, index: true },
  sourceAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: undefined, unique: true, sparse: true },
  appointmentCode: { type: String, trim: true, default: '' },
  consultationFee: { type: Number, default: null, min: 0 },
  entryAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
  acceptedByName: { type: String, trim: true, default: '' },
  salesValues: { type: Map, of: String, default: {} },
  values: { type: Map, of: String, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true, trim: true },
  updatedByName: { type: String, trim: true, default: '' },
  lastEditedAt: { type: Date, default: null },
  lastCallAt: { type: Date, default: null },
  numberOfCalls: { type: Number, default: 0, min: 0 },
  lastCallNotes: { type: String, trim: true, default: '', maxlength: 2000 },
  callHistory: { type: [callEntrySchema], default: [] },
  callStatus: { type: String, enum: ['pending', 'connected', 'no_answer', 'follow_up'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('AppointmentManagementEntry', schema);
