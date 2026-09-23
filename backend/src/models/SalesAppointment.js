const mongoose = require('mongoose');

const salesAppointmentSchema = new mongoose.Schema(
  {
    appointmentDate: { type: String, required: true, index: true },
    values: { type: Map, of: String, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByName: { type: String, required: true, trim: true },
    updatedByName: { type: String, trim: true, default: '' },
    acceptedAt: { type: Date, default: null, index: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SalesAppointment', salesAppointmentSchema);
