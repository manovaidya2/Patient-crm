const mongoose = require('mongoose');

// A patient's query that the PCC raises with the doctor (usually while taking the patient's follow-up), and its
// whole life: raised -> doctor answers (written / voice) -> PCC sends it to the patient -> PCC follows up ->
// the patient is satisfied and the PCC marks it solved. Every step is timestamped in `timeline`.
// If the patient is not satisfied the PCC asks the doctor again: the earlier question and answer move to `rounds`.
// While the doctor has not answered, the PCC can ring the doctor's alarm (`alarms`).
const FOLLOW_UP_OUTCOMES = ['satisfied', 'not_satisfied', 'not_reachable', 'call_back'];
const SENT_VIA = ['whatsapp', 'call', 'in_person', 'other'];

const voiceFields = {
  url: { type: String, default: '' },
  fileName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  durationSec: { type: Number, default: null },
  at: { type: Date, default: null },
};

const followUpSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    outcome: { type: String, enum: FOLLOW_UP_OUTCOMES, required: true },
    note: { type: String, trim: true, default: '' },
    // When to call again (not reachable / call back / not satisfied yet).
    nextAt: { type: Date, default: null },
    byName: { type: String, trim: true, default: '' },
    byRole: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const timelineSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, trim: true, default: '' },
    details: { type: String, trim: true, default: '' },
    byName: { type: String, trim: true, default: '' },
    byRole: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

// One finished question-and-answer before the PCC asked the doctor again.
const roundSchema = new mongoose.Schema(
  {
    query: { type: String, trim: true, default: '' },
    askedAt: { type: Date, default: null },
    askedByName: { type: String, trim: true, default: '' },
    isUrgent: { type: Boolean, default: false },
    advice: { type: String, trim: true, default: '' },
    adviceVoice: voiceFields,
    adviceGivenAt: { type: Date, default: null },
    adviceGivenByName: { type: String, trim: true, default: '' },
    sentToPatientAt: { type: Date, default: null },
    sentToPatientByName: { type: String, trim: true, default: '' },
    sentVia: { type: String, trim: true, default: '' },
    sentNote: { type: String, trim: true, default: '' },
    followUps: { type: [followUpSchema], default: [] },
  },
  { _id: false }
);

const adviceRequestSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    stage: { type: Number, default: null },
    query: {
      type: String,
      required: [true, 'Query is required'],
      trim: true,
    },
    // When the current question was asked (createdAt for the first one; later ones are asked again).
    askedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['requested', 'advice_given'],
      default: 'requested',
      index: true,
    },
    isUrgent: { type: Boolean, default: false, index: true },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedByName: { type: String, trim: true, default: '' },
    requestedByRole: { type: String, trim: true, default: '' },
    doctorReadAt: { type: Date, default: null },
    advice: { type: String, trim: true, default: '' },
    adviceGivenAt: { type: Date, default: null },
    adviceGivenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adviceGivenByName: { type: String, trim: true, default: '' },
    // The advice recorded by voice (with or instead of the written advice).
    adviceVoice: voiceFields,
    // The PCC sent the doctor's answer to the patient.
    sentToPatientAt: { type: Date, default: null },
    sentToPatientBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentToPatientByName: { type: String, trim: true, default: '' },
    sentVia: { type: String, enum: [...SENT_VIA, ''], default: '' },
    sentNote: { type: String, trim: true, default: '' },
    // Follow-ups after sending; the next one due (reminders).
    followUps: { type: [followUpSchema], default: [] },
    nextFollowUpAt: { type: Date, default: null, index: true },
    // Solved after the patient was satisfied.
    resolvedAt: { type: Date, default: null, index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedByName: { type: String, trim: true, default: '' },
    resolvedNote: { type: String, trim: true, default: '' },
    // The PCC rang the doctor's alarm (no answer yet).
    alarms: {
      type: [new mongoose.Schema({ at: { type: Date, default: Date.now }, note: { type: String, trim: true, default: '' }, byName: { type: String, trim: true, default: '' }, byRole: { type: String, trim: true, default: '' } }, { _id: false })],
      default: [],
    },
    lastAlarmAt: { type: Date, default: null },
    rounds: { type: [roundSchema], default: [] },
    timeline: { type: [timelineSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdviceRequest', adviceRequestSchema);
module.exports.FOLLOW_UP_OUTCOMES = FOLLOW_UP_OUTCOMES;
module.exports.SENT_VIA = SENT_VIA;
