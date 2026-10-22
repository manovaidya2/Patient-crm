const mongoose = require('mongoose');
const { BANDS } = require('../constants/formulationMaster');

// The doctor-edited Formulation Master of one age band. The document values live in constants/formulationMaster.js
// and are used whenever a band has no record here; every save keeps the previous values in `history`.
const historySchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  version: { type: Number, default: 0 },
  byName: { type: String, default: '' },
  byRole: { type: String, default: '' },
  note: { type: String, default: '' },
  changes: { type: [String], default: [] },
  previous: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const formulationMasterSchema = new mongoose.Schema({
  ageBand: { type: String, enum: BANDS, required: true, unique: true },
  quantities: { type: mongoose.Schema.Types.Mixed, default: {} },
  doses: { type: mongoose.Schema.Types.Mixed, default: {} },
  shivaLehSplit: { type: mongoose.Schema.Types.Mixed, default: {} },
  tabletGrams: { type: mongoose.Schema.Types.Mixed, default: {} },
  pendingNotes: { type: mongoose.Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  updatedByName: { type: String, default: '' },
  updatedByRole: { type: String, default: '' },
  note: { type: String, default: '' },
  history: { type: [historySchema], default: [] },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('FormulationMaster', formulationMasterSchema);
