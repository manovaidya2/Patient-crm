const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 180 },
  date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  type: { type: String, enum: ['national', 'company', 'restricted'], default: 'company' },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
module.exports = mongoose.model('HrHoliday', schema);
