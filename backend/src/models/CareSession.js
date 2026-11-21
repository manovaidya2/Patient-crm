const mongoose = require('mongoose');

// One medical follow-up, family session or development tracker of a patient's phase (Care Schedule). The schedule is
// made from the medicine start date the PCC fills after the explanation (utils/careSchedule.js): FU-01 ... FU-07 on
// day 10, 20, 50, 80, 110, 140, 170; FS-01 ... FS-03 on day 15, 105, 165; DT-01 ... DT-03 on day 60, 120, 180 -
// only the days the supplied medicine covers.
// The call: the PCC sets the call time, may reschedule it (at most twice), records every call made (when, picked up or
// not, how long, what was said), marks it missed by the parents or cancelled (with a reason), or fills the session's form and marks it done.
const STATUSES = ['pending', 'scheduled', 'completed', 'missed', 'cancelled'];
const KINDS = ['followup', 'family', 'tracker'];
const ATTEMPTS = ['not_connected', 'busy', 'switched_off', 'wrong_number', 'callback', 'connected'];

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
    // The PCC asks the Manager / Admin to give this session to someone else (with why, and who they suggest); the
    // Manager assigns it (done) or declines with a note.
    reassignRequest: {
      type: new mongoose.Schema({
        ...by, reason: { type: String, trim: true, default: '' },
        suggested: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, suggestedName: { type: String, trim: true, default: '' },
        status: { type: String, enum: ['open', 'done', 'declined'], default: 'open' },
        decidedAt: { type: Date, default: null }, decidedByName: { type: String, trim: true, default: '' }, note: { type: String, trim: true, default: '' },
      }, { _id: false }),
      default: undefined,
    },
    reschedules: {
      type: [new mongoose.Schema({ ...by, from: Date, to: Date, reason: { type: String, trim: true, default: '' } }, { _id: false })],
      default: [],
    },
    // Call details: every call made to the parents. `at` is when it was written down and `calledAt` when the call was
    // made (older entries have only `at`). A call that connected ("connected") keeps how long it lasted and, in `note`,
    // what was said; the others why it did not connect.
    attempts: {
      type: [new mongoose.Schema({
        ...by, outcome: { type: String, enum: ATTEMPTS, required: true }, note: { type: String, trim: true, default: '' },
        calledAt: { type: Date, default: null }, durationSec: { type: Number, default: null },
      }, { _id: false })],
      default: [],
    },
    // Development trackers (DT-01 ... DT-03) have no form and no call: the PCC records when the tracker was sent to the
    // parents, then pastes the link of the filled tracker, which completes the session.
    tracker: {
      type: new mongoose.Schema({
        sentAt: { type: Date, default: null }, sentByName: { type: String, trim: true, default: '' }, sentRecordedAt: { type: Date, default: null },
        filledLink: { type: String, trim: true, default: '' }, filledAt: { type: Date, default: null }, filledByName: { type: String, trim: true, default: '' },
      }, { _id: false }),
      default: undefined,
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
    // Closed by hand ("Close" on the session page): why, the details, who / when, and how many calls had not connected.
    closed: {
      type: new mongoose.Schema({ reason: String, details: String, missed: Boolean, at: Date, byName: String, attempts: Number }, { _id: false }),
      default: undefined,
    },
    // Reminders for this session (the PCC's own, e.g. "call again after 6 pm"); a due one shows in pending work and
    // pops up for the person the session is given to. kind "call": made by the call time (10 minutes before it).
    reminders: {
      type: [new mongoose.Schema({
        at: { type: Date, required: true },
        kind: { type: String, trim: true, default: '' },
        note: { type: String, trim: true, default: '' },
        byName: { type: String, trim: true, default: '' },
        createdAt: { type: Date, default: Date.now },
        doneAt: { type: Date, default: null },
        doneByName: { type: String, trim: true, default: '' },
      })],
      default: [],
    },
    // Handwritten notes of the session (photo / scan / PDF), each also added at the end of the patient's Records Room PDF.
    notes: {
      type: [new mongoose.Schema({
        url: { type: String, default: '' }, fileName: { type: String, trim: true, default: '' }, mimeType: { type: String, default: '' },
        at: { type: Date, default: Date.now }, byName: { type: String, trim: true, default: '' },
        recordRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'RecordRoom', default: null }, recordRoomPdf: { type: String, default: '' }, pdfPageCount: { type: Number, default: 0 },
      })],
      default: [],
    },
    // Advice requests sent to the doctor from this session (the form's Emergency / Urgent triage, or asked by hand).
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
