const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  sheet: { type: String, enum: ['sales', 'management'], unique: true, required: true },
  columns: [{ key: { type: String, required: true }, order: { type: Number, required: true } }],
}, { timestamps: true });

module.exports = mongoose.model('SalesSheetLayout', schema);
