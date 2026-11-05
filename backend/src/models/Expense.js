const mongoose = require('mongoose');

// One money-out entry with its payment voucher and repayment:
//  kind 'clinic'   - a clinic expense written by Reception (what it was for, the amount, who paid)
//  kind 'medicine' - a medicine purchase written by the Medicine Department (supplier, items x quantity x rate)
// No categories: "purpose" says what the money was for. Every name (who paid, who is paid, shop / supplier, item) is
// typed by hand. Voucher: made by the department, approved by Admin / Doctor. Repay: the person who paid from their
// own money is repaid; clinic cash / bank needs nothing; on credit the supplier is paid later.
const fileSchema = new mongoose.Schema({ url: String, fileName: String }, { _id: false });
const itemSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true, maxlength: 150 },
  qty: { type: Number, required: true, min: 0 },
  unit: { type: String, trim: true, default: '', maxlength: 20 },
  rate: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });
const historySchema = new mongoose.Schema({
  at: { type: Date, default: Date.now }, byName: { type: String, default: '' }, byRole: { type: String, default: '' },
  action: { type: String, required: true }, details: { type: String, default: '' },
}, { _id: false });

const schema = new mongoose.Schema({
  kind: { type: String, enum: ['clinic', 'medicine'], required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  purpose: { type: String, trim: true, required: true, maxlength: 300 },
  vendor: { type: String, trim: true, default: '', maxlength: 150 },
  invoiceNo: { type: String, trim: true, default: '', maxlength: 60 },
  items: { type: [itemSchema], default: [] },
  extraCharges: { type: Number, default: 0, min: 0 },
  amount: { type: Number, required: true, min: 0 },
  paidByName: { type: String, trim: true, required: true, maxlength: 120 },
  paidFrom: { type: String, enum: ['own', 'clinic_cash', 'clinic_bank', 'credit'], required: true },
  paymentMode: { type: String, enum: ['', 'cash', 'upi', 'card', 'bank'], default: '' },
  bills: { type: [fileSchema], default: [] },
  notes: { type: String, trim: true, default: '', maxlength: 1000 },
  voucher: {
    number: { type: String, default: '' },
    payTo: { type: String, trim: true, default: '', maxlength: 120 },
    status: { type: String, enum: ['', 'pending', 'approved', 'rejected'], default: '' },
    madeAt: { type: Date, default: null }, madeByName: { type: String, default: '' },
    approvedAt: { type: Date, default: null }, approvedByName: { type: String, default: '' },
    rejectedAt: { type: Date, default: null }, rejectedByName: { type: String, default: '' }, rejectReason: { type: String, default: '' },
  },
  // to_repay (paid from own money) -> repaid; not_needed (clinic money); supplier_due (credit) -> supplier_paid.
  repayStatus: { type: String, enum: ['to_repay', 'repaid', 'not_needed', 'supplier_due', 'supplier_paid'], required: true, index: true },
  settlement: {
    date: { type: String, default: '' }, mode: { type: String, default: '' }, reference: { type: String, default: '' },
    toName: { type: String, default: '' }, byName: { type: String, default: '' }, at: { type: Date, default: null }, reason: { type: String, default: '' },
  },
  history: { type: [historySchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByName: { type: String, default: '' },
  createdByRole: { type: String, default: '' },
  editedAt: { type: Date, default: null },
  editedByName: { type: String, default: '' },
  deletedAt: { type: Date, default: null, index: true },
  deletedByName: { type: String, default: '' },
}, { timestamps: true });

schema.index({ kind: 1, date: -1 });
schema.index({ 'voucher.number': 1 });

module.exports = mongoose.model('Expense', schema);
