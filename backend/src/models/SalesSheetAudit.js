const mongoose = require('mongoose');

const salesSheetAuditSchema = new mongoose.Schema(
  {
    sheet: { type: String, enum: ['sales', 'management'], required: true, index: true },
    rowId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    appointmentCode: { type: String, default: '' },
    action: { type: String, required: true },
    details: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedByName: { type: String, required: true },
  },
  { timestamps: true }
);

salesSheetAuditSchema.index({ sheet: 1, rowId: 1, createdAt: -1 });

module.exports = mongoose.model('SalesSheetAudit', salesSheetAuditSchema);
