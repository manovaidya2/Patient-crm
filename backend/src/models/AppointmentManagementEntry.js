const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  appointmentDate: { type: String, required: true, index: true },
  sourceAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: undefined, unique: true, sparse: true },
  appointmentCode: { type: String, trim: true, default: '' },
  entryAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
  acceptedByName: { type: String, trim: true, default: '' },
  salesValues: { type: Map, of: String, default: {} },
  values: { type: Map, of: String, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true, trim: true },
  updatedByName: { type: String, trim: true, default: '' },
  lastEditedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AppointmentManagementEntry', schema);
