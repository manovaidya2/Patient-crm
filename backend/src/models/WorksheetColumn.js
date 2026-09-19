const mongoose = require('mongoose');

// Columns belong to one worksheet owner, so every team member keeps their own set.
const worksheetColumnSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    label: {
      type: String,
      required: [true, 'Column name is required'],
      trim: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'date'],
      default: 'text',
    },
    order: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

worksheetColumnSchema.index({ user: 1, key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('WorksheetColumn', worksheetColumnSchema);
