const mongoose = require('mongoose');

const clinicInventoryTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['add', 'consume', 'adjust'], required: true },
  quantity: { type: Number, required: true, min: 0 },
  previousStock: { type: Number, required: true, min: 0 },
  newStock: { type: Number, required: true, min: 0 },
  reason: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  recordedByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

const clinicInventorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true, default: 'General' },
  unit: { type: String, trim: true, default: 'piece' },
  currentStock: { type: Number, default: 0, min: 0 },
  lowStockAt: { type: Number, default: 0, min: 0 },
  notes: { type: String, trim: true, default: '' },
  createdByName: { type: String, trim: true, default: '' },
  editedByName: { type: String, trim: true, default: '' },
  editedAt: { type: Date, default: null },
  transactions: { type: [clinicInventoryTransactionSchema], default: [] },
}, { timestamps: true });

clinicInventorySchema.index({ name: 1 });

module.exports = mongoose.model('ClinicInventory', clinicInventorySchema);
