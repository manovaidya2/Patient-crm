const mongoose = require('mongoose');

// A full copy of what an admin deleted (e.g. a purchase order with its medicine request, medicine job and payments),
// kept so nothing is lost for good: it can be looked up or put back by hand. Uploaded files are not removed.
const deletedRecordSchema = new mongoose.Schema({
  kind: { type: String, required: true, trim: true, index: true },
  refId: { type: String, default: '', trim: true, index: true },
  label: { type: String, default: '', trim: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientName: { type: String, default: '', trim: true },
  phase: { type: Number, default: null },
  reason: { type: String, default: '', trim: true, maxlength: 500 },
  deletedByName: { type: String, default: '', trim: true },
  deletedByRole: { type: String, default: '', trim: true },
  deletedAt: { type: Date, default: Date.now, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false });

module.exports = mongoose.model('DeletedRecord', deletedRecordSchema);
