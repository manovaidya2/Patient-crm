const mongoose = require('mongoose');

const worksheetColumnSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, 'Column name is required'],
      trim: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorksheetColumn', worksheetColumnSchema);
