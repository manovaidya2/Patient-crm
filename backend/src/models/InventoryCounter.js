const mongoose = require('mongoose');

// Gap-free running numbers for the stock ledger (TX-5001, TX-5002 ...), safe with two people saving at once.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 5000 },
});

// Reserves `count` numbers and returns the first one.
schema.statics.reserve = async function reserve(key, count = 1) {
  const counter = await this.findOneAndUpdate(
    { key },
    { $inc: { value: count }, $setOnInsert: { key } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.value - count + 1;
};

module.exports = mongoose.model('InventoryCounter', schema);
