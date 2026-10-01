const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  department: { type: String, enum: require('../constants/knowledgeDepartments').DEPARTMENTS, default: 'receptionist' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

schema.index({ department: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('KnowledgeCategory', schema);
