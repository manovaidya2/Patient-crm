const mongoose = require('mongoose');

// Small key/value settings for the inventory (for now: the master list of bottle / jar sizes).
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

module.exports = mongoose.model('InventorySetting', schema);
