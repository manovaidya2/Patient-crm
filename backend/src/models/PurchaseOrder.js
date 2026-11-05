const mongoose = require('mongoose');
const { isValidPlan } = require('../constants/supplyPlans');
const { STAGES } = require('../constants/treatmentStages');

const PO_STATUSES = ['pending', 'verified', 'rejected', 'cancelled'];

const fileSchema = new mongoose.Schema({ url: String, fileName: String }, { _id: false });

const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, trim: true, required: true },
    details: { type: String, trim: true, default: '' },
    byName: { type: String, trim: true, default: '' },
    byRole: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

// One purchase order = one medicine buy for one phase of one patient. A patient can have many (e.g. the 1-month and
// the 5-month part of a 1+5 plan, or the next phase). Payments stay inside Patient.stages[].payments (so ledgers,
// approvals and refunds work as before); a purchase order only points at them by id. Its medicine request lives in
// Patient.stages[].medicineRequests and is found by `medicineRequestId`.
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

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true, trim: true },
    // true for numbers this system generated (PO-1234). Old, typed-in numbers are kept as they were (generated: false).
    generated: { type: Boolean, default: false },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
    patientCode: { type: String, trim: true, default: '' },
    patientName: { type: String, trim: true, default: '' },
    phase: { type: Number, enum: STAGES, required: true },
    supplyPlan: { type: String, validate: { validator: isValidPlan, message: 'Unknown medicine supply plan' }, default: '' },
    supplyPart: { type: String, enum: ['', 'full', 'first', 'rest'], default: '' },
    ageBand: { type: String, enum: ['', '0-3', '3-4', '4-12', '12-70', '70+'], default: '' },
    packageName: { type: String, trim: true, default: '', maxlength: 200 },
    amount: { type: Number, default: 0, min: 0 },
    medicineReadyDate: { type: Date, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    paperImages: { type: [fileSchema], default: [] },
    // The full PO paper as filled at conversion (post-counselling form), kept for reference.
    paperValues: { type: mongoose.Schema.Types.Mixed, default: null },
    paymentIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // A PO made with "New PO" counts only its own payments (linked to it, or added on the phase after it was made),
    // never the phase payments added earlier without a PO. Older POs keep counting them (see utils/poPayment).
    ownPaymentsOnly: { type: Boolean, default: false },
    // A PO made "from a previous PO": its value is that PO's unpaid balance, carried here (e.g. the rest of the months).
    previousPo: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    previousPoNumber: { type: String, trim: true, default: '' },
    // On the earlier PO: its balance moved to a newer PO (so it is no longer owed on this one).
    carriedForwardTo: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    carriedForwardToNumber: { type: String, trim: true, default: '' },
    carriedForwardAmount: { type: Number, default: 0 },
    carriedForwardAt: { type: Date, default: null },
    status: { type: String, enum: PO_STATUSES, default: 'pending', index: true },
    // In Transit verifies in two steps: first the PO paper / patient details, then the payment. Both done = 'verified'.
    detailsVerifiedAt: { type: Date, default: null },
    detailsVerifiedByName: { type: String, trim: true, default: '' },
    paymentVerifiedAt: { type: Date, default: null },
    paymentVerifiedByName: { type: String, trim: true, default: '' },
    // The checklist lines In Transit ticked when verifying (shown in green on the done step).
    detailsChecks: { type: [String], default: [] },
    paymentChecks: { type: [String], default: [] },
    verifiedAt: { type: Date, default: null },
    verifiedByName: { type: String, trim: true, default: '' },
    rejectedAt: { type: Date, default: null },
    rejectedByName: { type: String, trim: true, default: '' },
    rejectReason: { type: String, trim: true, default: '' },
    medicineRequestId: { type: String, trim: true, default: '' },
    medicineRequestedAt: { type: Date, default: null },
    medicineRequestedByName: { type: String, trim: true, default: '' },
    source: { type: String, enum: ['conversion', 'manual', 'legacy'], default: 'manual' },
    createdByName: { type: String, trim: true, default: '' },
    createdByRole: { type: String, trim: true, default: '' },
    events: { type: [eventSchema], default: [] },
    reverts: { type: [revertSchema], default: [] },
  },
  { timestamps: true }
);

// Generated numbers can never repeat. Old typed-in numbers are not forced unique (they were never checked before).
purchaseOrderSchema.index({ poNumber: 1 }, { unique: true, partialFilterExpression: { generated: true } });
purchaseOrderSchema.index({ patient: 1, phase: 1 });
purchaseOrderSchema.index({ createdAt: -1 });
purchaseOrderSchema.set('optimisticConcurrency', true);

// Courier / handover lists: verified POs with a medicine request, newest first.
purchaseOrderSchema.index({ status: 1, medicineRequestId: 1, createdAt: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
module.exports.PO_STATUSES = PO_STATUSES;
