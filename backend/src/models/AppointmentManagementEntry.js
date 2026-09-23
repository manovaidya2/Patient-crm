const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  appointmentDate: { type: String, required: true, index: true },
  sourceAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: undefined, unique: true, sparse: true },
  values: { type: Map, of: String, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true, trim: true },
  updatedByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AppointmentManagementEntry', schema);
