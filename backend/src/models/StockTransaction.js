const mongoose = require('mongoose');

// Append-only ledger of every stock movement. A mistake is corrected by a new row, never by editing an old one.
const stockTransactionSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'StockItem', required: true, index: true },
    code: { type: String, trim: true, default: '' },
    type: { type: String, enum: ['add', 'consume', 'adjust', 'return'], required: true },
    quantity: { type: Number, required: true, min: 0 },
    // Signed change of currentStock.
    delta: { type: Number, required: true },
    before: { type: Number, required: true },
    after: { type: Number, required: true },
    refType: { type: String, enum: ['', 'job', 'purchase', 'count'], default: '' },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineJob', default: null, index: true },
    ref: { type: String, trim: true, default: '' },
    batchNo: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    byName: { type: String, trim: true, default: '' },
    byRole: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);
stockTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
