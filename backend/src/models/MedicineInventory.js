const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['add', 'consume', 'adjust'],
      required: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    previousStock: { type: Number, required: true, min: 0 },
    newStock: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    reason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    recordedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

const medicineInventorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: {
      type: String,
      enum: ['tablet', 'capsule', 'bottle', 'packet', 'kg', 'gram', 'mg', 'ml', 'piece', 'other'],
      default: 'gram',
    },
    currentStock: { type: Number, default: 0, min: 0 },
    lowStockAt: { type: Number, default: 0, min: 0 },
    lastUnitCost: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, default: '' },
    createdByName: { type: String, trim: true, default: '' },
    editedByName: { type: String, trim: true, default: '' },
    editedAt: { type: Date, default: null },
    transactions: { type: [transactionSchema], default: [] },
  },
  { timestamps: true }
);

medicineInventorySchema.index({ name: 1 });

module.exports = mongoose.model('MedicineInventory', medicineInventorySchema);
