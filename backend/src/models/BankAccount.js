const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true, default: '' },
    accountNumber: { type: String, trim: true, default: '' },
    ifsc: { type: String, trim: true, uppercase: true, default: '' },
    branch: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    createdByName: { type: String, trim: true, default: '' },
    updatedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

bankAccountSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('BankAccount', bankAccountSchema);
