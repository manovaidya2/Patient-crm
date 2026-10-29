const mongoose = require('mongoose');
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
    supplyPlan: { type: String, enum: ['', '6M', '1+5', '2+4'], default: '' },
    supplyPart: { type: String, enum: ['', 'full', 'first', 'rest'], default: '' },
    ageBand: { type: String, enum: ['', '3-4', '4-12', '12-70', '70+'], default: '' },
    medicines: { type: String, trim: true, default: '' },
    caseCategory: { type: String, trim: true, default: '' },
    // 2: the stage list with the doctor's formulation step (older jobs are moved on startup, see utils/jobStageMigration).
    stagesVersion: { type: Number, default: 4 },
    requestNotes: { type: String, trim: true, default: '' },
    requestedAt: { type: Date, default: null },
    requestedByName: { type: String, trim: true, default: '' },
    readyByDate: { type: Date, default: null },
    status: { type: String, enum: ['open', 'ready', 'released', 'cancelled'], default: 'open', index: true },
    currentStage: { type: Number, default: 0 },
    stages: { type: [stageRecordSchema], default: [] },
    hold: {
      active: { type: Boolean, default: false },
      reason: { type: String, trim: true, default: '' },
      at: { type: Date, default: null },
      byName: { type: String, trim: true, default: '' },
      stageKey: { type: String, trim: true, default: '' },
    },
    formulation: { type: mongoose.Schema.Types.Mixed, default: null },
    consumption: {
      type: [{ code: String, name: String, unit: String, planned: Number, actual: Number, txId: { type: mongoose.Schema.Types.ObjectId, default: null }, _id: false }],
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

module.exports = mongoose.model('MedicineJob', medicineJobSchema);
