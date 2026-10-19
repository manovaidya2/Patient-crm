const mongoose = require('mongoose');

// One counter per calendar day (key = YYYY-MM-DD). `seq` is bumped atomically, so two receptionists marking
// arrival at the same moment can never get the same Patient ID.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('PatientIdCounter', schema);
