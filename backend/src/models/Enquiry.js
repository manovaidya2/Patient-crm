const mongoose = require('mongoose');
const eventSchema = new mongoose.Schema({
  action: String, note: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorName: String,
  assigneeName: String, status: String, createdAt: { type: Date, default: Date.now },
});
const alertSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: String, createdAt: { type: Date, default: Date.now }, readAt: { type: Date, default: null },
});
const schema = new mongoose.Schema({
  patientName: { type: String, required: true, trim: true, maxlength: 150 },
  patientReference: { type: String, trim: true, maxlength: 100, default: '' },
  subject: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, required: true, trim: true, maxlength: 4000 },
  status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedToName: String, assignedToRole: String,
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  resolution: { type: String, default: '' }, closedReason: { type: String, default: '' },
  deletedAt: { type: Date, default: null }, deletedByName: String,
  history: [eventSchema], alerts: [alertSchema],
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ participants: 1, updatedAt: -1 });
schema.index({ assignedTo: 1, status: 1 });
schema.index({ createdBy: 1, updatedAt: -1 });
schema.index({ 'alerts.recipient': 1, 'alerts.readAt': 1 });
module.exports = mongoose.model('Enquiry', schema);
