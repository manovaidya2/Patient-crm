const mongoose = require('mongoose');

const digitalMarketingReviewSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      unique: true,
    },
    patientCode: { type: String, trim: true, default: '' },
    parentName: { type: String, trim: true, default: '' },
    mobileNumber: { type: String, trim: true, default: '' },
    patientName: { type: String, trim: true, default: '' },
    program: { type: String, trim: true, default: '' },
    programStartDate: { type: Date, default: null },
    latestFollowUpDate: { type: Date, default: null },
    improvementSummary: { type: String, trim: true, default: '' },
    parentSatisfied: { type: String, trim: true, default: '' },
    permissionToRequestReview: { type: String, trim: true, default: '' },
    firstRequestDate: { type: Date, default: null },
    contactMethod: { type: String, trim: true, default: '' },
    reviewStatus: { type: String, trim: true, default: '' },
    lastContactDate: { type: Date, default: null },
    nextActionDate: { type: Date, default: null },
    reviewPlatform: { type: String, trim: true, default: '' },
    reviewLinkRef: { type: String, trim: true, default: '' },
    testimonialConsent: { type: String, trim: true, default: '' },
    approvedBy: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, trim: true, default: '' },
    createdByRole: { type: String, trim: true, default: '' },
    updatedByName: { type: String, trim: true, default: '' },
    updatedByRole: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DigitalMarketingReview', digitalMarketingReviewSchema);
