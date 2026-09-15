const mongoose = require('mongoose');

const followUpSchema = new mongoose.Schema(
  {
    dateTime: { type: Date, required: true },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['scheduled', 'completed'], default: 'scheduled' },
    completionDetails: { type: String, trim: true, default: '' },
    completedAt: { type: Date, default: null },
    completedByName: { type: String, trim: true, default: '' },
    createdByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

const packageNotBoughtPatientSchema = new mongoose.Schema(
  {
    patientName: { type: String, required: true, trim: true },
    parentName: { type: String, trim: true, default: '' },
    fatherNumber: { type: String, trim: true, default: '' },
    motherNumber: { type: String, trim: true, default: '' },
    age: { type: String, trim: true, default: '' },
    program: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    followUpDate: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
    followUps: { type: [followUpSchema], default: [] },
    status: { type: String, enum: ['open', 'converted'], default: 'open', index: true },
    convertedAt: { type: Date, default: null },
    convertedByName: { type: String, trim: true, default: '' },
    conversionDetails: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdByName: { type: String, trim: true, default: '' },
    updatedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

packageNotBoughtPatientSchema.index({ patientName: 1, fatherNumber: 1, motherNumber: 1 });

module.exports = mongoose.model('PackageNotBoughtPatient', packageNotBoughtPatientSchema);
