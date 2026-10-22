const mongoose = require('mongoose');
const { BANDS, defaultMasterFor } = require('../constants/formulationMaster');

const iso = (v) => (v ? new Date(v).toISOString() : null);

// The master of one band as formulationFor() expects it: the stored record when the doctor has saved one,
// otherwise the document values (version 0). Without a database connection (tests, scripts) the document values apply.
const masterFromDoc = (doc) => {
  const d = doc && doc.toObject ? doc.toObject() : doc;
  return {
    ageBand: d.ageBand, version: d.version || 1, source: d.history?.length ? 'edited' : 'document',
    updatedAt: iso(d.updatedAt), updatedByName: d.updatedByName || '', updatedByRole: d.updatedByRole || '', note: d.note || '',
    quantities: d.quantities || {}, doses: d.doses || {}, shivaLehSplit: d.shivaLehSplit || {}, tabletGrams: d.tabletGrams || {}, pendingNotes: d.pendingNotes || {},
    history: [...(d.history || [])].reverse().map((h) => ({ at: iso(h.at), version: h.version, byName: h.byName, byRole: h.byRole, note: h.note, changes: h.changes || [] })),
  };
};

async function getMaster(ageBand, { FormulationMaster = require('../models/FormulationMaster') } = {}) {
  if (!BANDS.includes(ageBand)) return null;
  if (mongoose.connection.readyState !== 1) return defaultMasterFor(ageBand);
  const doc = await FormulationMaster.findOne({ ageBand }).lean();
  return doc ? masterFromDoc(doc) : defaultMasterFor(ageBand);
}

// Loads the document values into the collection once, so the master is visible in the database and editable.
async function seedFormulationMaster({ FormulationMaster, log = () => {} }) {
  let created = 0;
  for (const ageBand of BANDS) {
    // eslint-disable-next-line no-await-in-loop
    if (await FormulationMaster.exists({ ageBand })) continue;
    const { quantities, doses, shivaLehSplit, tabletGrams, pendingNotes } = defaultMasterFor(ageBand);
    // eslint-disable-next-line no-await-in-loop
    await FormulationMaster.create({ ageBand, quantities, doses, shivaLehSplit, tabletGrams, pendingNotes, version: 1, note: 'Formulation Master document values' });
    created += 1;
  }
  if (created) log(`Formulation Master: loaded document values for ${created} age group(s)`);
  return { created };
}

module.exports = { getMaster, masterFromDoc, seedFormulationMaster };
