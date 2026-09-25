const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'number', 'phone', 'date', 'time', 'select', 'textarea', 'checkbox', 'file'], default: 'text' },
  options: [{ type: String, trim: true }],
  highlightValue: { type: String, trim: true, default: '' },
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('AppointmentManagementColumn', schema);
