const mongoose = require('mongoose');

const worksheetManualRowSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userName: { type: String, trim: true, default: '' },
    userRole: { type: String, trim: true, default: '' },
    workDate: { type: Date, default: Date.now, index: true },
    patientName: { type: String, trim: true, default: '' },
    patientCode: { type: String, trim: true, default: '' },
    currentStage: { type: String, trim: true, default: '' },
    workType: { type: String, trim: true, default: '' },
    details: { type: String, trim: true, default: '' },
    customValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    source: { type: String, enum: ['manual', 'import'], default: 'manual' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorksheetManualRow', worksheetManualRowSchema);
