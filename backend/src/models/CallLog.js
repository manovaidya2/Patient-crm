const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true,
    },
    patientName: { type: String, trim: true, default: '' },
    phoneNumber: { type: String, trim: true, default: '', index: true },
    externalPatientId: { type: String, trim: true, default: '' },
    externalCallId: {
      type: String,
      trim: true,
      set: (value) => {
        const cleaned = String(value || '').trim();
        return cleaned || undefined;
      },
    },
    dedupeKey: {
      type: String,
      trim: true,
      set: (value) => {
        const cleaned = String(value || '').trim();
        return cleaned || undefined;
      },
    },
    callType: { type: String, trim: true, required: true },
    durationSeconds: { type: Number, default: 0, min: 0 },
    durationText: { type: String, trim: true, default: '' },
    callAction: { type: String, trim: true, default: '' },
    actionCreationTime: { type: Date, default: Date.now },
    recordingUrl: { type: String, trim: true, default: '' },
    recordingFileUrl: { type: String, trim: true, default: '' },
    recordingFileName: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: 'calling_webhook' },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CallLog', callLogSchema);
