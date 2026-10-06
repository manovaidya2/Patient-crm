const mongoose = require('mongoose');

const crmAuditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorName: { type: String, required: true, trim: true },
  actorRole: { type: String, required: true, trim: true, index: true },
  module: { type: String, required: true, trim: true, index: true },
  action: { type: String, required: true, trim: true, index: true },
  summary: { type: String, required: true, trim: true, maxlength: 1000 },
  method: { type: String, required: true, enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
  path: { type: String, required: true, trim: true, maxlength: 500 },
  targetId: { type: String, default: '', trim: true, maxlength: 120 },
  statusCode: { type: Number, required: true },
  occurredAt: { type: Date, default: Date.now, required: true, index: true },
}, { versionKey: false });

crmAuditLogSchema.index({ occurredAt: -1, actor: 1 });
crmAuditLogSchema.index({ occurredAt: -1, module: 1, action: 1 });

module.exports = mongoose.model('CrmAuditLog', crmAuditLogSchema);
