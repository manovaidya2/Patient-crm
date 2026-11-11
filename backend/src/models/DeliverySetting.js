const mongoose = require('mongoose');

// Small key/value settings of Treatment Delivery (for now one document, `rules`: the day numbers and limits the
// plan is made with - defaults in utils/treatmentDelivery.js).
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('DeliverySetting', schema);
