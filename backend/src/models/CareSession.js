const mongoose = require('mongoose');

// One medical follow-up, family session or development tracker of a patient's phase (Care Schedule). The schedule is
// made from the medicine start date the PCC fills after the explanation (utils/careSchedule.js): FU-01 ... FU-07 on
// day 10, 20, 50, 80, 110, 140, 170; FS-01 ... FS-03 on day 15, 105, 165; DT-01 ... DT-03 on day 60, 120, 180 -
// only the days the supplied medicine covers.
// The call: the PCC sets the call time, may reschedule it (at most twice), records calls that did not connect, marks
// it missed by the parents or cancelled (with a reason), or fills the session's form and marks it done.
const STATUSES = ['pending', 'scheduled', 'completed', 'missed', 'cancelled'];
const KINDS = ['followup', 'family', 'tracker'];
const ATTEMPTS = ['not_connected', 'busy', 'switched_off', 'wrong_number', 'callback'];

const by = {
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byName: { type: String, trim: true, default: '' },
};

const careSessionSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientName: { type: String, trim: true, default: '' },
    patientCode: { type: String, trim: true, default: '' },
    phase: { type: Number, required: true },
    kind: { type: String, enum: KINDS, required: true },
    seq: { type: Number, required: true },
    code: { type: String, required: true }, // FU-01, FS-01, DT-01
    title: { type: String, trim: true, default: '' },
    day: { type: Number, required: true }, // day of the phase (from the medicine start date)
    supplyKey: { type: String, trim: true, default: '' }, // the supply whose start date scheduled it
    targetDate: { type: String, required: true }, // YYYY-MM-DD (never a Wednesday)
    callAt: { type: Date, default: null },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    // The patient's PCC (case owner) and who does this one session (a cover while the PCC is on leave).
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    ownerName: { type: String, trim: true, default: '' },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assigneeName: { type: String, trim: true, default: '' },
    cover: {
      type: new mongoose.Schema({ ...by, reason: { type: String, trim: true, default: '' }, fromName: { type: String, trim: true, default: '' } }, { _id: false }),
      default: undefined,
    },
    reschedules: {
      type: [new mongoose.Schema({ ...by, from: Date, to: Date, reason: { type: String, trim: true, default: '' } }, { _id: false })],
      default: [],
    },
    attempts: {
      type: [new mongoose.Schema({ ...by, outcome: { type: String, enum: ATTEMPTS, required: true }, note: { type: String, trim: true, default: '' } }, { _id: false })],
      default: [],
    },
    // The filled template (careTemplates/): answers by block id, which version, when it was opened and saved.
    form: {
      type: new mongoose.Schema({
        templateKey: { type: String, trim: true, default: '' },
        version: { type: Number, default: 0 },
        answers: { type: mongoose.Schema.Types.Mixed, default: {} },
        startedAt: { type: Date, default: null },
        savedAt: { type: Date, default: null },
        savedByName: { type: String, trim: true, default: '' },
        durationSec: { type: Number, default: 0 },
      }, { _id: false }),
      default: undefined,
    },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedByName: { type: String, trim: true, default: '' },
    missedAt: { type: Date, default: null },
    missedReason: { type: String, trim: true, default: '' },
    missedByName: { type: String, trim: true, default: '' },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: '' },
    cancelledByName: { type: String, trim: true, default: '' },
    // Advice requests the form sent to the doctor (Emergency / Urgent Doctor Review triage).
    doctorRequests: {
      type: [new mongoose.Schema({ advice: { type: mongoose.Schema.Types.ObjectId, ref: 'AdviceRequest' }, level: String, blockId: String, at: Date }, { _id: false })],
      default: [],
    },
    log: {
      type: [new mongoose.Schema({ at: { type: Date, default: Date.now }, byName: { type: String, trim: true, default: '' }, text: { type: String, trim: true, default: '' } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);

careSessionSchema.index({ patient: 1, phase: 1, code: 1 }, { unique: true });
careSessionSchema.index({ status: 1, targetDate: 1 });
careSessionSchema.index({ assignee: 1, status: 1 });

module.exports = mongoose.model('CareSession', careSessionSchema);
module.exports.STATUSES = STATUSES;
module.exports.KINDS = KINDS;
module.exports.ATTEMPTS = ATTEMPTS;
