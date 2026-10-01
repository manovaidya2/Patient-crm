const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  department: { type: String, enum: require('../constants/knowledgeDepartments').DEPARTMENTS, default: 'receptionist', index: true },
  answer: { type: String, required: true, trim: true },
  category: { type: String, trim: true, default: '' },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeCategory', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, trim: true, default: '' },
  updatedByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('KnowledgeArticle', schema);
