const mongoose = require('mongoose');

const salesAppointmentSchema = new mongoose.Schema(
  {
    appointmentCode: { type: String, unique: true, sparse: true, index: true },
    appointmentDate: { type: String, required: true, index: true },
    values: { type: Map, of: String, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByName: { type: String, required: true, trim: true },
    updatedByName: { type: String, trim: true, default: '' },
    lastEditedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'rescheduled'], default: 'active', index: true },
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
