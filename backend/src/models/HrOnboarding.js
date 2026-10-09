const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  key: { type: String, required: true }, label: { type: String, required: true },
  completed: { type: Boolean, default: false }, completedAt: { type: Date, default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, completedByName: { type: String, default: '' },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
}, { _id: false });

const schema = new mongoose.Schema({
  onboardingCode: { type: String, required: true, unique: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'HrCandidate', required: true, index: true },
  candidateCode: { type: String, required: true }, candidateName: { type: String, required: true },
  offer: { type: mongoose.Schema.Types.ObjectId, ref: 'HrOffer', required: true, unique: true }, offerCode: { type: String, required: true },
  designation: { type: String, required: true }, department: { type: String, required: true },
  joiningDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  reportingManager: { type: String, trim: true, maxlength: 180, default: '' },
  workLocation: { type: String, trim: true, maxlength: 180, default: '' },
  status: { type: String, enum: ['not_started', 'in_progress', 'completed', 'cancelled'], default: 'not_started', index: true },
  checklist: { type: [itemSchema], default: [] }, notes: { type: String, trim: true, maxlength: 3000, default: '' },
  completedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ status: 1, joiningDate: 1 });
module.exports = mongoose.model('HrOnboarding', schema);
