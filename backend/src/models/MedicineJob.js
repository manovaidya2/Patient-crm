const mongoose = require('mongoose');
const { isValidPlan } = require('../constants/supplyPlans');
const { STAGES: PHASES } = require('../constants/treatmentStages');

const fileSchema = new mongoose.Schema({ url: String, fileName: String }, { _id: false });

// An admin undo of a timeline step: who, why, which steps went back and the records that were cleared (kept, not lost).
const revertSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    byName: { type: String, trim: true, default: '' },
    byRole: { type: String, trim: true, default: '' },
    step: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    reverted: { type: [String], default: [] },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const stageRecordSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    doneAt: { type: Date, default: null },
    doneByName: { type: String, trim: true, default: '' },
    doneByRole: { type: String, trim: true, default: '' },
    checks: { type: [Boolean], default: [] },
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
    // What the stage saw when it was completed (e.g. the stock table at Stock match), shown later on the done stage.
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  { at: { type: Date, default: Date.now }, action: { type: String, trim: true, required: true }, details: { type: String, trim: true, default: '' }, byName: { type: String, trim: true, default: '' }, byRole: { type: String, trim: true, default: '' } },
  { _id: false }
);

// One Medicine Department job per medicine request: the twelve fulfilment stages from "order accepted" to "released to
// In Transit", the formulation sheet it was made from, what was drawn from stock, the chits confirmed and the photos.
// The request itself stays in Patient.stages[].medicineRequests (status in_process / made / sent_to_courier is kept in
// step), so the older screens and In Transit keep working.
const medicineJobSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientCode: { type: String, trim: true, default: '' },
    patientName: { type: String, trim: true, default: '' },
    phase: { type: Number, enum: PHASES, required: true },
    requestId: { type: String, trim: true, required: true },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null, index: true },
    poNumber: { type: String, trim: true, default: '' },
    supplyPlan: { type: String, validate: { validator: isValidPlan, message: 'Unknown medicine supply plan' }, default: '' },
    supplyPart: { type: String, enum: ['', 'full', 'first', 'rest'], default: '' },
    ageBand: { type: String, enum: ['', '0-3', '3-4', '4-12', '12-70', '70+'], default: '' },
    medicines: { type: String, trim: true, default: '' },
    caseCategory: { type: String, trim: true, default: '' },
    // 2: the stage list with the doctor's formulation step (older jobs are moved on startup, see utils/jobStageMigration).
    stagesVersion: { type: Number, default: 8 },
    // The Medicine Department rang the alarm of whoever has the step: the Manager (quality check) or the PCC.
    transitAlarm: {
      at: { type: Date, default: null },
      byName: { type: String, trim: true, default: '' },
      note: { type: String, trim: true, default: '' },
      stageKey: { type: String, trim: true, default: '' },
    },
    requestNotes: { type: String, trim: true, default: '' },
    requestedAt: { type: Date, default: null },
    requestedByName: { type: String, trim: true, default: '' },
    readyByDate: { type: Date, default: null },
    status: { type: String, enum: ['open', 'ready', 'released', 'cancelled'], default: 'open', index: true },
    currentStage: { type: Number, default: 0 },
    stages: { type: [stageRecordSchema], default: [] },
    releaseRequest: {
      transitPaymentVerifiedAt: { type: Date, default: null },
      transitPaymentVerifiedByName: { type: String, default: '' },
      transitPaymentFingerprint: { type: String, default: '' },
      startedAt: { type: Date, default: null },
      deadlineAt: { type: Date, default: null },
      requestedAt: { type: Date, default: null },
      requestedByName: { type: String, default: '' },
      requestNote: { type: String, default: '' },
      acceptedAt: { type: Date, default: null },
      acceptedByName: { type: String, default: '' },
      paymentSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
      followupStatus: { type: String, default: '' },
      statusUpdatedAt: { type: Date, default: null },
      statusUpdatedByName: { type: String, default: '' },
      cancelledAt: { type: Date, default: null },
      cancelledByName: { type: String, default: '' },
      cancelReason: { type: String, default: '' },
      cancellations: { type: [{ at: Date, byName: String, reason: String, _id: false }], default: [] },
      reopenedAt: { type: Date, default: null },
      reopenedByName: { type: String, default: '' },
      extensions: { type: [{ at: Date, byName: String, days: Number, previousDeadline: Date, deadlineAt: Date, reason: String, _id: false }], default: [] },
    },
    boxReceipt: {
      requestedAt: { type: Date, default: null },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      requestedByName: { type: String, trim: true, default: '' },
      requestNote: { type: String, trim: true, default: '' },
      receivedAt: { type: Date, default: null },
      receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      receivedByName: { type: String, trim: true, default: '' },
      receivedNote: { type: String, trim: true, default: '' },
    },
    // The assigned PCC explicitly confirms that they verified the kit with the doctor.
    doctorVerification: {
      doctorName: { type: String, trim: true, default: '' },
      confirmedAt: { type: Date, default: null },
      confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      confirmedByName: { type: String, trim: true, default: '' },
      notes: { type: String, trim: true, default: '' },
    },
    // Sent back to In Transit before acceptance (request unclear); cleared when In Transit corrects the request.
    returned: {
      reason: { type: String, trim: true, default: '' },
      at: { type: Date, default: null },
      byName: { type: String, trim: true, default: '' },
    },
    returns: {
      type: [{ reason: String, at: Date, byName: String, resentAt: Date, resentByName: String, _id: false }],
      default: undefined,
    },
    hold: {
      active: { type: Boolean, default: false },
      reason: { type: String, trim: true, default: '' },
      at: { type: Date, default: null },
      byName: { type: String, trim: true, default: '' },
      stageKey: { type: String, trim: true, default: '' },
    },
    formulation: { type: mongoose.Schema.Types.Mixed, default: null },
    consumption: {
      type: [{ code: String, name: String, unit: String, planned: Number, actual: Number, txId: { type: mongoose.Schema.Types.ObjectId, default: null }, key: String, outside: Boolean, sheetUnit: String, _id: false }],
      default: [],
    },
    chits: {
      type: [{ key: String, itemKey: String, chitNo: Number, n: Number, of: Number, name: String, when: String, dose: String, days: Number, note: String, confirmed: { type: Boolean, default: false }, confirmedByName: String, confirmedAt: Date, _id: false }],
      default: [],
    },
    // overview: all medicines together; paperSets: every page of each dose / treatment paper (papers = older Photo B).
    photos: {
      overview: { type: [fileSchema], default: [] },
      papers: { type: [fileSchema], default: [] },
      paperSets: { type: [new mongoose.Schema({ name: { type: String, trim: true, default: '' }, files: { type: [fileSchema], default: [] } }, { _id: false })], default: [] },
    },
    events: { type: [eventSchema], default: [] },
    reverts: { type: [revertSchema], default: [] },
  },
  { timestamps: true }
);
medicineJobSchema.index({ patient: 1, phase: 1, requestId: 1 }, { unique: true });
medicineJobSchema.index({ readyByDate: 1 });
medicineJobSchema.set('optimisticConcurrency', true);

// The fulfilment queue: one status, soonest ready date first.
medicineJobSchema.index({ status: 1, readyByDate: 1, createdAt: -1 });

module.exports = mongoose.model('MedicineJob', medicineJobSchema);
