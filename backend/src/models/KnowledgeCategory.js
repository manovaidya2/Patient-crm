const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('KnowledgeCategory', schema);
