const mongoose = require('mongoose');
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
const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true, trim: true },
    // true for numbers this system generated (PO-1234). Old, typed-in numbers are kept as they were (generated: false).
    generated: { type: Boolean, default: false },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
    patientCode: { type: String, trim: true, default: '' },
    patientName: { type: String, trim: true, default: '' },
    phase: { type: Number, enum: STAGES, required: true },
    supplyPlan: { type: String, enum: ['', '6M', '1+5', '2+4'], default: '' },
    supplyPart: { type: String, enum: ['', 'full', 'first', 'rest'], default: '' },
    ageBand: { type: String, enum: ['', '3-4', '4-12', '12-70', '70+'], default: '' },
    packageName: { type: String, trim: true, default: '', maxlength: 200 },
    amount: { type: Number, default: 0, min: 0 },
    medicineReadyDate: { type: Date, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    paperImages: { type: [fileSchema], default: [] },
    // The full PO paper as filled at conversion (post-counselling form), kept for reference.
    paperValues: { type: mongoose.Schema.Types.Mixed, default: null },
    paymentIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: PO_STATUSES, default: 'pending', index: true },
    // In Transit verifies in two steps: first the PO paper / patient details, then the payment. Both done = 'verified'.
    detailsVerifiedAt: { type: Date, default: null },
    detailsVerifiedByName: { type: String, trim: true, default: '' },
    paymentVerifiedAt: { type: Date, default: null },
    paymentVerifiedByName: { type: String, trim: true, default: '' },
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
  },
  { timestamps: true }
);

// Generated numbers can never repeat. Old typed-in numbers are not forced unique (they were never checked before).
purchaseOrderSchema.index({ poNumber: 1 }, { unique: true, partialFilterExpression: { generated: true } });
purchaseOrderSchema.index({ patient: 1, phase: 1 });
purchaseOrderSchema.index({ createdAt: -1 });
purchaseOrderSchema.set('optimisticConcurrency', true);

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
module.exports.PO_STATUSES = PO_STATUSES;
