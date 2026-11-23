const mongoose = require('mongoose');

// One row per phone that sends calls to the webhook: who uses it (the app's user name), when it last sent a call and
// how many it sent / were kept (a patient's number) / were left out (any other number). Only counts - nothing of the
// calls that were left out is kept.
const phoneCallDeviceSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, required: true, unique: true },
    deviceId: { type: String, trim: true, default: '' },
    userName: { type: String, trim: true, default: '' },
    userPhone: { type: String, trim: true, default: '' },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    received: { type: Number, default: 0 },
    saved: { type: Number, default: 0 },
    ignored: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PhoneCallDevice', phoneCallDeviceSchema);
