const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  date: { type: String, required: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceptionistChecklistItem', required: true },
  receptionist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completed: { type: Boolean, default: false },
  note: { type: String, trim: true, default: '' },
  completedAt: { type: Date, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Admin / doctor review of this task for the day.
  reviewVerdict: { type: String, enum: ['', 'ok', 'not_ok'], default: '' },
  reviewRemark: { type: String, trim: true, default: '', maxlength: 1000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String, trim: true, default: '' },
  reviewedByRole: { type: String, trim: true, default: '' },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ date: 1, item: 1, receptionist: 1 }, { unique: true });
schema.index({ receptionist: 1, date: 1 });

module.exports = mongoose.model('ReceptionistChecklistRecord', schema);
