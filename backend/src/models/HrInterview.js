const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  rating: { type: Number, min: 1, max: 5, required: true },
  recommendation: { type: String, enum: ['next_round', 'selected', 'rejected', 'on_hold'], required: true },
  strengths: { type: String, trim: true, maxlength: 3000, default: '' },
  concerns: { type: String, trim: true, maxlength: 3000, default: '' },
  notes: { type: String, trim: true, maxlength: 3000, default: '' },
  evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  evaluatedByName: { type: String, required: true }, evaluatedAt: { type: Date, default: Date.now },
}, { _id: false });

const schema = new mongoose.Schema({
  interviewCode: { type: String, required: true, unique: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'HrCandidate', required: true, index: true },
  candidateCode: { type: String, required: true }, candidateName: { type: String, required: true },
  appliedPosition: { type: String, required: true },
  round: { type: String, required: true, trim: true, maxlength: 120 },
  interviewType: { type: String, enum: ['phone', 'video', 'in_person', 'technical', 'hr'], required: true },
  scheduledAt: { type: Date, required: true, index: true }, durationMinutes: { type: Number, min: 5, max: 480, default: 30 },
  interviewerName: { type: String, required: true, trim: true, maxlength: 180 },
  locationOrLink: { type: String, trim: true, maxlength: 1000, default: '' },
  instructions: { type: String, trim: true, maxlength: 3000, default: '' },
  status: { type: String, enum: ['scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show'], default: 'scheduled', index: true },
  evaluation: { type: evaluationSchema, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, scheduledAt: 1 });
module.exports = mongoose.model('HrInterview', schema);
