const mongoose = require('mongoose');

const STOCK_UNITS = ['ml', 'g', 'tablet', 'spoon', 'drop', 'piece'];

// One medicine or packing material the Medicine Department draws from ("Stocks"). Separate from the older
// MedicineInventory module. The medicine job consumes from here automatically at preparation.
const stockItemSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    name: { type: String, required: true, trim: true },
    nameHindi: { type: String, trim: true, default: '' },
    kind: { type: String, enum: ['medicine', 'component', 'packing'], default: 'medicine' },
    unit: { type: String, enum: STOCK_UNITS, required: true },
    currentStock: { type: Number, default: 0, min: 0 },
    minLevel: { type: Number, default: 0, min: 0 },
    batchNo: { type: String, trim: true, default: '' },
    expiryDate: { type: Date, default: null },
    // Conversions still pending validation in the SOP; when set, the job converts the formulation unit into this unit.
    gramsPerSpoon: { type: Number, default: null },
    dropsPerMl: { type: Number, default: null },
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockItem', stockItemSchema);
module.exports.STOCK_UNITS = STOCK_UNITS;
