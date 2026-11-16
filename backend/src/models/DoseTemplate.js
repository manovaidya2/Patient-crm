const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 500, unique: true },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('DoseTemplate', schema);
