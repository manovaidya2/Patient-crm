const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  type: { type: String, enum: ['part-payment', 'final-bill'], required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  submissionKey: { type: String, required: true, unique: true },
  date: { type: String, required: true, index: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
  patientName: { type: String, required: true },
  patientCode: { type: String, default: '' },
  // A receipt is an immutable snapshot, independent of later patient edits.
  details: { type: mongoose.Schema.Types.Mixed, required: true },
  fileName: { type: String, required: true },
  revision: { type: Number, default: 1, min: 1 },
  revisionHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  editedByName: { type: String, default: '' },
  editedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
invoiceSchema.index({ createdAt: -1 });

const counterSchema = new mongoose.Schema({
  _id: String,
  sequence: { type: Number, default: 0 },
}, { versionKey: false });

module.exports = {
  Invoice: mongoose.model('Invoice', invoiceSchema),
  InvoiceCounter: mongoose.model('InvoiceCounter', counterSchema),
};
