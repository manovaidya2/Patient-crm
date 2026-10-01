const mongoose = require('mongoose');

const callEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['connected', 'no_answer', 'follow_up'], required: true },
  notes: { type: String, trim: true, required: true, maxlength: 2000 },
  calledAt: { type: Date, required: true },
  calledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  calledByName: { type: String, required: true },
});

const salesAppointmentSchema = new mongoose.Schema(
  {
    appointmentCode: { type: String, unique: true, sparse: true, index: true },
    appointmentDate: { type: String, required: true, index: true },
    values: { type: Map, of: String, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByName: { type: String, required: true, trim: true },
    updatedByName: { type: String, trim: true, default: '' },
    lastEditedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'rescheduled', 'not_coming'], default: 'active', index: true },
    notComingReason: { type: String, trim: true, default: '' },
    notComingAt: { type: Date, default: null },
    notComingByName: { type: String, trim: true, default: '' },
    lastCallAt: { type: Date, default: null },
    numberOfCalls: { type: Number, default: 0, min: 0 },
    lastCallNotes: { type: String, trim: true, default: '', maxlength: 2000 },
    callHistory: { type: [callEntrySchema], default: [] },
    callStatus: { type: String, enum: ['pending', 'connected', 'no_answer', 'follow_up'], default: 'pending' },
    rescheduledTo: { type: String, default: '' },
    rescheduledAt: { type: Date, default: null },
    rescheduledByName: { type: String, trim: true, default: '' },
    rescheduledAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: null },
    acceptedAt: { type: Date, default: null, index: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SalesAppointment', salesAppointmentSchema);
