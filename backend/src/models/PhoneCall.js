const mongoose = require('mongoose');

// A call made or received on a staff phone with a patient's number (utils/phoneCalls.js). The call app on every phone
// sends each call to one webhook (POST /api/phone-calls/webhook); only calls with a number the CRM has of a patient
// are kept. The recording file stays on the server (uploads/call-recordings, not public), never in the database.
// Separate from the older calling-system log (CallLog, /api/webhook/calls), which works as before.
const matchSchema = new mongoose.Schema({
  kind: { type: String, enum: ['patient', 'visit', 'not_bought'], required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
  visit: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentManagementEntry', default: null },
  notBought: { type: mongoose.Schema.Types.ObjectId, ref: 'PackageNotBoughtPatient', default: null },
  name: { type: String, trim: true, default: '' },
  code: { type: String, trim: true, default: '' },
  // Whose number it is, e.g. "Father's mobile" or "Mobile, WhatsApp".
  label: { type: String, trim: true, default: '' },
}, { _id: false });

const phoneCallSchema = new mongoose.Schema(
  {
    // The app's own call ID: the same call sent again is not saved twice.
    callId: { type: String, trim: true, required: true, unique: true },
    deviceId: { type: String, trim: true, default: '' },
    // Who uses the phone, as the app sends it.
    userName: { type: String, trim: true, default: '' },
    userPhone: { type: String, trim: true, default: '' },
    direction: { type: String, enum: ['incoming', 'outgoing', 'missed', 'rejected', 'unknown'], default: 'unknown' },
    directionRaw: { type: String, trim: true, default: '' },
    durationSec: { type: Number, default: 0, min: 0 },
    phoneNumber: { type: String, trim: true, default: '' },
    phoneTail: { type: String, trim: true, default: '', index: true },
    startedAt: { type: Date, required: true },
    matches: { type: [matchSchema], default: [] },
    patients: { type: [mongoose.Schema.Types.ObjectId], ref: 'Patient', default: [] },
    // The one file kept: compressed (Opus in WebM, like every recording in the CRM) right after the call arrives -
    // the phone's original (.amr, .m4a ...) is then deleted. compressed: done (or the original was kept because it
    // was already smaller and plays as it is); originalType / originalSize: what the phone sent.
    recording: {
      file: { type: String, default: '' },
      type: { type: String, default: '' },
      mime: { type: String, default: '' },
      size: { type: Number, default: 0 },
      originalName: { type: String, trim: true, default: '' },
      originalType: { type: String, default: '' },
      originalSize: { type: Number, default: 0 },
      compressed: { type: Boolean, default: false },
      error: { type: String, trim: true, default: '' },
    },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

phoneCallSchema.index({ startedAt: -1 });
phoneCallSchema.index({ userName: 1, startedAt: -1 });
phoneCallSchema.index({ patients: 1, startedAt: -1 });

module.exports = mongoose.model('PhoneCall', phoneCallSchema);
