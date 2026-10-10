const mongoose = require('mongoose');

const columnSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'textarea', 'phone', 'number', 'date', 'time', 'select', 'checkbox'], required: true },
  required: { type: Boolean, default: false },
  options: { type: [String], default: [] },
});
const registerSchema = new mongoose.Schema({
  kind: { type: String, enum: ['visitors', 'incoming-couriers', 'outgoing-couriers'], unique: true, required: true },
  columns: [columnSchema],
}, { timestamps: true });
const entrySchema = new mongoose.Schema({
  kind: { type: String, enum: ['visitors', 'incoming-couriers', 'outgoing-couriers'], required: true },
  date: { type: String, required: true },
  values: { type: Map, of: String, default: {} },
  imageUrl: String,
  createdByName: String,
  updatedByName: String,
}, { timestamps: true, optimisticConcurrency: true });
entrySchema.index({ kind: 1, date: -1, createdAt: -1 });
module.exports = {
  ReceptionRegister: mongoose.model('ReceptionRegister', registerSchema),
  ReceptionEntry: mongoose.model('ReceptionEntry', entrySchema),
};
