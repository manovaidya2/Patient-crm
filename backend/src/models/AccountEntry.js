const mongoose = require('mongoose');

const accountEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    category: {
      type: String,
      enum: [
        'appointment_fee',
        'medicine_fee',
        'patient_payment',
        'courier',
        'medicine_purchase',
        'salary',
        'rent',
        'utility',
        'office',
        'other',
      ],
      default: 'other',
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    partyName: { type: String, trim: true, default: '' },
    paymentMode: { type: String, trim: true, default: '' },
    referenceNumber: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    recordedByName: { type: String, trim: true, default: '' },
    editedByName: { type: String, trim: true, default: '' },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

accountEntrySchema.index({ date: -1, createdAt: -1 });
accountEntrySchema.index({ type: 1, category: 1 });

module.exports = mongoose.model('AccountEntry', accountEntrySchema);
