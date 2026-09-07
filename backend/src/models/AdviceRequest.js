const mongoose = require('mongoose');

const adviceRequestSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    stage: { type: Number, default: null },
    query: {
      type: String,
      required: [true, 'Query is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['requested', 'advice_given'],
      default: 'requested',
      index: true,
    },
    isUrgent: { type: Boolean, default: false, index: true },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedByName: { type: String, trim: true, default: '' },
    requestedByRole: { type: String, trim: true, default: '' },
    doctorReadAt: { type: Date, default: null },
    advice: { type: String, trim: true, default: '' },
    adviceGivenAt: { type: Date, default: null },
    adviceGivenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adviceGivenByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdviceRequest', adviceRequestSchema);
