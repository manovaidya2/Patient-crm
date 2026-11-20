const mongoose = require('mongoose');

const clinicInventoryTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['add', 'consume', 'adjust'], required: true },
  quantity: { type: Number, required: true, min: 0 },
  previousStock: { type: Number, required: true, min: 0 },
  newStock: { type: Number, required: true, min: 0 },
  reason: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  recordedByName: { type: String, trim: true, default: '' },
  editedByName: { type: String, trim: true, default: '' },
  editedAt: { type: Date, default: null },
}, { timestamps: true });

// Who a mobile / laptop was given to, each time it changed hands.
const assignmentSchema = new mongoose.Schema({
  assignee: { type: String, trim: true, default: '' },
  assignedByName: { type: String, trim: true, default: '' },
  assignedAt: { type: Date, default: Date.now },
}, { _id: false });

const clinicInventorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // The register tab: 'mobile' and 'laptop' are single devices (no stock count); 'other' is the stock register.
  // Items saved before the tabs have no kind and count as 'other'.
  kind: { type: String, enum: ['mobile', 'laptop', 'other'], default: 'other' },
  device: {
    brand: { type: String, trim: true, default: '' },
    simCompany: { type: String, trim: true, default: '' }, // mobile
    phoneNumber: { type: String, trim: true, default: '' }, // mobile
    imei1: { type: String, trim: true, default: '' }, // mobile
    imei2: { type: String, trim: true, default: '' }, // mobile
    deviceId: { type: String, trim: true, default: '' }, // laptop
    assignee: { type: String, trim: true, default: '' },
  },
  assignments: { type: [assignmentSchema], default: [] },
  category: { type: String, trim: true, default: 'General' },
  unit: { type: String, trim: true, default: 'piece' },
  currentStock: { type: Number, default: 0, min: 0 },
  lowStockAt: { type: Number, default: 0, min: 0 },
  notes: { type: String, trim: true, default: '' },
  createdByName: { type: String, trim: true, default: '' },
  editedByName: { type: String, trim: true, default: '' },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  deletedByName: { type: String, default: '' },
  softCopy: {
    filename: String, originalName: String, mimeType: String,
    uploadedAt: Date, uploadedByName: String,
  },
  transactions: { type: [clinicInventoryTransactionSchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });

clinicInventorySchema.index({ name: 1 });

module.exports = mongoose.model('ClinicInventory', clinicInventorySchema);
