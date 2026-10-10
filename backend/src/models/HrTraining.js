const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
  employeeCode: { type: String, required: true }, employeeName: { type: String, required: true },
  status: { type: String, enum: ['assigned', 'attended', 'completed', 'absent'], default: 'assigned' },
}, { _id: false });

const schema = new mongoose.Schema({
  trainingCode: { type: String, required: true, unique: true, index: true }, title: { type: String, required: true, trim: true, maxlength: 200 },
  category: { type: String, required: true, trim: true, maxlength: 120 }, trainer: { type: String, required: true, trim: true, maxlength: 180 },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  mode: { type: String, enum: ['in_person', 'online', 'hybrid'], default: 'in_person' }, locationOrLink: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['planned', 'in_progress', 'completed', 'cancelled'], default: 'planned', index: true },
  participants: { type: [participantSchema], default: [] }, objectives: { type: String, trim: true, maxlength: 3000, default: '' }, notes: { type: String, trim: true, maxlength: 3000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, createdByName: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedByName: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ status: 1, startDate: -1 });
module.exports = mongoose.model('HrTraining', schema);
