const mongoose = require('mongoose');

// A call a patient (or their family) made to the clinic, logged by In Transit: when it came, who called, what they
// asked and what was answered. Entered by hand for now; `source` / `externalId` are there for when the phone system is
// connected and calls are fetched from it.
const schema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientName: { type: String, trim: true, default: '', maxlength: 200 },
  patientCode: { type: String, trim: true, default: '', maxlength: 60 },
  callerName: { type: String, trim: true, default: '', maxlength: 200 },
  callerPhone: { type: String, trim: true, default: '', maxlength: 20 },
  receivedAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, default: null, min: 0, max: 600 },
  query: { type: String, trim: true, required: true, maxlength: 2000 },
  answer: { type: String, trim: true, required: true, maxlength: 2000 },
  followUpNeeded: { type: Boolean, default: false },
  // The follow-up closed: called back / solution given (by hand, or by a later call of the same patient).
  followUpDoneAt: { type: Date, default: null },
  followUpDoneByName: { type: String, trim: true, default: '' },
  followUpNote: { type: String, trim: true, default: '', maxlength: 1000 },
  followUpDoneOnCall: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingCall', default: null },
  source: { type: String, enum: ['manual', 'phone'], default: 'manual' },
  externalId: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByName: { type: String, trim: true, default: '' },
  editedAt: { type: Date, default: null },
  editedByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

schema.index({ receivedAt: -1 });

module.exports = mongoose.model('IncomingCall', schema);
