const mongoose = require('mongoose');

// Atomic running numbers (e.g. the reception token of a day: "arrivalToken:2026-11-04"). $inc on findOneAndUpdate
// gives every caller its own number even when two people save at the same moment.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
}, { timestamps: true });

const Counter = mongoose.model('Counter', schema);

// The next number for `key` (1, 2, 3 ...).
Counter.next = async (key) => (await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, new: true })).seq;

module.exports = Counter;
