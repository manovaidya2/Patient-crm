const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  fileName: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
  uploadedByName: { type: String, default: '' },
}, { _id: true });

const issueSchema = new mongoose.Schema({
  paperName: { type: String, trim: true, default: 'Patient file' },
  issuedAt: { type: Date, default: Date.now },
  issuedByName: { type: String, default: '' },
  givenTo: { type: String, required: true, trim: true },
  reason: { type: String, default: '', trim: true },
  returnedAt: { type: Date, default: null },
  returnedByName: { type: String, default: '' },
  returnNotes: { type: String, default: '', trim: true },
  returnCondition: { type: String, enum: ['', 'intact', 'problem'], default: '' },
  problemDetails: { type: String, default: '', trim: true },
}, { _id: true });

const schema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientId: { type: String, trim: true, default: '' },
  patientName: { type: String, required: true, trim: true },
  appointmentId: { type: String, trim: true, default: '' },
  documents: { type: [documentSchema], default: [] },
  pdfUrl: { type: String, default: '' },
  pdfName: { type: String, default: '' },
  pdfPageCount: { type: Number, default: 0 },
  pdfUpdatedAt: { type: Date, default: null },
  issueHistory: { type: [issueSchema], default: [] },
  createdByName: { type: String, default: '' },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ patientId: 1, appointmentId: 1 });

module.exports = mongoose.model('RecordRoom', schema);
