const mongoose = require('mongoose');

// Append-only ledger row. A mistake is fixed by a new row, never by editing or deleting an old one.
const transactionSchema = new mongoose.Schema(
  {
    txId: { type: String, trim: true, default: '' },
    type: { type: String, enum: ['add', 'consume', 'adjust', 'pack'], required: true },
    subType: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 0 },
    // Signed change of the TOTAL stock in the item's unit (pack rows are 0: stock only moves loose <-> bottles).
    delta: { type: Number, default: 0 },
    previousStock: { type: Number, required: true, min: 0 },
    newStock: { type: Number, required: true, min: 0 },
    detail: { type: String, trim: true, default: '' },
    ref: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    batchNo: { type: String, trim: true, default: '' },
    recordedByName: { type: String, trim: true, default: '' },
    recordedByRole: { type: String, trim: true, default: '' },
    // Large / risky adjustments wait here until admin or doctor approves them.
    status: { type: String, enum: ['done', 'pending', 'approved', 'rejected'], default: 'done' },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    decidedByName: { type: String, trim: true, default: '' },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Filled bottles / jars of one size. They are part of currentStock (size x count of it is "packed").
const packSchema = new mongoose.Schema(
  {
    size: { type: Number, required: true, min: 0.001 },
    kind: { type: String, enum: ['Bottle', 'शीशी', 'Jar', 'Packet', 'Pouch', 'Tin'], default: 'Bottle' },
    count: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const recipeSchema = new mongoose.Schema(
  {
    // "per" units of this medicine are made from the listed ingredients (each qty in the ingredient's own unit).
    per: { type: Number, default: 1000, min: 0.001 },
    ingredients: {
      type: [{ item: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineInventory', required: true }, qty: { type: Number, required: true, min: 0.001 } }],
      default: [],
    },
  },
  { _id: false }
);

const medicineInventorySchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, default: '' },
    name: { type: String, required: true, trim: true },
    nameHindi: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    itemType: { type: String, trim: true, default: '' },
    rack: { type: String, trim: true, default: '' },
    unit: {
      type: String,
      enum: ['tablet', 'capsule', 'bottle', 'packet', 'kg', 'gram', 'mg', 'ml', 'piece', 'other'],
      default: 'gram',
    },
    // Total stock in `unit`: loose + everything already filled into bottles / jars.
    currentStock: { type: Number, default: 0, min: 0 },
    // Levels in the same unit. Below lowStockAt = critical, below reorderLevel = reorder, above maxLevel = overstock.
    lowStockAt: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    maxLevel: { type: Number, default: 0, min: 0 },
    // Rough daily use for a new item; replaced by the real last-30-days average once stock is being used.
    avgDailyUse: { type: Number, default: 0, min: 0 },
    batchNo: { type: String, trim: true, default: '' },
    expiryDate: { type: Date, default: null },
    supplier: { type: String, trim: true, default: '' },
    usedIn: { type: String, trim: true, default: '' },
    emergency: { type: Boolean, default: false },
    fastMoving: { type: Boolean, default: false },
    // Sizes this medicine is filled into (shown even at 0 so a missing size is visible).
    packSizes: { type: [Number], default: [] },
    packs: { type: [packSchema], default: [] },
    // Empty containers (category "Packing सामग्री"): which size / kind of bottle or jar this item is.
    containerKind: { type: String, trim: true, default: '' },
    containerSize: { type: Number, default: 0, min: 0 },
    containerUnit: { type: String, enum: ['', 'ml', 'g'], default: '' },
    recipe: { type: recipeSchema, default: null },
    purchaseRequest: {
      type: new mongoose.Schema({ raisedAt: Date, raisedByName: String, quantity: Number }, { _id: false }),
      default: null,
    },
    // Deleting hides a medicine everywhere but keeps its ledger, so past stock history is never lost.
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    deletedByName: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdByName: { type: String, trim: true, default: '' },
    editedByName: { type: String, trim: true, default: '' },
    editedAt: { type: Date, default: null },
    transactions: { type: [transactionSchema], default: [] },
  },
  { timestamps: true }
);

medicineInventorySchema.index({ name: 1 });
medicineInventorySchema.index({ category: 1 });

module.exports = mongoose.model('MedicineInventory', medicineInventorySchema);
