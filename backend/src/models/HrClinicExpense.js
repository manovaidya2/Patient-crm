const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  category: { type: String, required: true, enum: ['tea_coffee', 'pantry', 'cleaning', 'rent', 'electricity', 'internet', 'stationery', 'maintenance', 'vendor', 'raw_material', 'other'] },
  vendor: { type: String, trim: true, maxlength: 180, default: '' },
  amount: { type: Number, required: true, min: 0 },
  billNumber: { type: String, trim: true, maxlength: 100, default: '' },
  paymentStatus: { type: String, enum: ['paid', 'unpaid', 'partial'], default: 'paid' },
  approval: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  remarks: { type: String, trim: true, maxlength: 1000, default: '' },
  ownerReview: { type: String, trim: true, maxlength: 1000, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
module.exports = mongoose.model('HrClinicExpense', schema);
