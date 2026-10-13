const mongoose = require('mongoose');

// One overall remark per receptionist per day, written by admin or doctor.
const schema = new mongoose.Schema({
  date: { type: String, required: true },
  receptionist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  remark: { type: String, trim: true, default: '', maxlength: 2000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedByName: { type: String, trim: true, default: '' },
  reviewedByRole: { type: String, trim: true, default: '' },
}, { timestamps: true });

schema.index({ date: 1, receptionist: 1 }, { unique: true });

module.exports = mongoose.model('ReceptionistChecklistDayReview', schema);
