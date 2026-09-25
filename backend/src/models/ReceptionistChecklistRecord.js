const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  date: { type: String, required: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceptionistChecklistItem', required: true },
  receptionist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completed: { type: Boolean, default: false },
  note: { type: String, trim: true, default: '' },
  completedAt: { type: Date, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ date: 1, item: 1, receptionist: 1 }, { unique: true });

module.exports = mongoose.model('ReceptionistChecklistRecord', schema);
