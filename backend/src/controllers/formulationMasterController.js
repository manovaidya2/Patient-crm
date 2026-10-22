const FormulationMaster = require('../models/FormulationMaster');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { AGE_BANDS, SUPPLY_OPTIONS } = require('../constants/supplyPlans');
const { BANDS, MASTER_ITEMS, MASTER_DOSES, SPLIT_DAYS, PENDING_KEYS, defaultMasterFor, normalizeMaster, formulationFor } = require('../constants/formulationMaster');
const { getMaster, masterFromDoc } = require('../utils/formulationMasterStore');

// Only the admin and the doctor open the master; jobs read it internally to build their sheets.
const MASTER_EDIT_ROLES = [ROLES.ADMIN, ROLES.DOCTOR];
const MASTER_VIEW_ROLES = MASTER_EDIT_ROLES;
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);

// Every supply sheet of a band, built from its current master (what a new job would get).
const sheetsOf = (master) => Object.fromEntries(SUPPLY_OPTIONS.map((o) => [o.key, formulationFor({ ageBand: master.ageBand, plan: o.plan, part: o.part }, master)]));
const bandView = (master) => ({ ...master, label: AGE_BANDS[master.ageBand], defaults: defaultMasterFor(master.ageBand), sheets: sheetsOf(master) });

// Human-readable list of what changed between two masters (kept in history and on the job events).
const diffMasters = (before, after) => {
  const changes = [];
  const qtyText = (v) => (v ? `${v.qty} ${v.unit}` : '-');
  for (const item of MASTER_ITEMS) if (qtyText(before.quantities[item.key]) !== qtyText(after.quantities[item.key])) changes.push(`${item.label}: ${qtyText(before.quantities[item.key])} -> ${qtyText(after.quantities[item.key])}`);
  for (const d of MASTER_DOSES) if ((before.doses[d.key] || '') !== (after.doses[d.key] || '')) changes.push(`${d.label}: "${before.doses[d.key] || ''}" -> "${after.doses[d.key] || ''}"`);
  for (const days of SPLIT_DAYS) if ((before.shivaLehSplit[days] || []).join('+') !== (after.shivaLehSplit[days] || []).join('+')) changes.push(`शिवा-लेह packs ${days} days: ${(before.shivaLehSplit[days] || []).join('+')} -> ${(after.shivaLehSplit[days] || []).join('+')}`);
  for (const k of Object.keys(after.tabletGrams)) if (Number(before.tabletGrams[k]) !== Number(after.tabletGrams[k])) changes.push(`${k.toUpperCase()} g/tablet: ${before.tabletGrams[k]} -> ${after.tabletGrams[k]}`);
  for (const k of PENDING_KEYS) if ((before.pendingNotes[k] || '') !== (after.pendingNotes[k] || '')) changes.push(after.pendingNotes[k] ? `${k} pending note changed` : `${k}: pending point confirmed (note cleared)`);
  return changes;
};

// @route GET /api/formulation-master
const listMasters = asyncHandler(async (req, res) => {
  const bands = await Promise.all(BANDS.map((b) => getMaster(b)));
  res.json({ success: true, bands: bands.map(bandView), items: MASTER_ITEMS, doses: MASTER_DOSES, splitDays: SPLIT_DAYS, pendingKeys: PENDING_KEYS, supplyOptions: SUPPLY_OPTIONS, canEdit: MASTER_EDIT_ROLES.includes(req.user.role) });
});

// Saves the given values as the new version of a band (used by update and reset).
const saveBand = async ({ ageBand, values, note, user }) => {
  const doc = (await FormulationMaster.findOne({ ageBand })) || new FormulationMaster({ ageBand, version: 0 });
  const current = doc.isNew ? defaultMasterFor(ageBand) : masterFromDoc(doc);
  const changes = diffMasters(current, values);
  if (!changes.length) fail('Nothing was changed');
  doc.history.push({ at: new Date(), version: doc.version, byName: user.name, byRole: user.role, note, changes, previous: { quantities: current.quantities, doses: current.doses, shivaLehSplit: current.shivaLehSplit, tabletGrams: current.tabletGrams, pendingNotes: current.pendingNotes } });
  Object.assign(doc, values, { version: (doc.version || 0) + 1, updatedByName: user.name, updatedByRole: user.role, note });
  ['quantities', 'doses', 'shivaLehSplit', 'tabletGrams', 'pendingNotes'].forEach((k) => doc.markModified(k));
  await doc.save();
  return { master: masterFromDoc(doc), changes };
};

// @route PUT /api/formulation-master/:ageBand   body: { quantities, doses, shivaLehSplit, tabletGrams, pendingNotes, note }
const updateMaster = asyncHandler(async (req, res) => {
  const { ageBand } = req.params;
  if (!BANDS.includes(ageBand)) fail('Unknown age group', 404);
  const note = clean(req.body?.note);
  if (!note) fail('Write why the master is being changed (e.g. the doctor\'s instruction or the document it follows)');
  const values = normalizeMaster(req.body || {}, ageBand);
  const { master, changes } = await saveBand({ ageBand, values, note, user: req.user });
  res.json({ success: true, band: bandView(master), changes });
});

// @route POST /api/formulation-master/:ageBand/reset   body: { note }
// Puts the document values back (as a new version, so the history keeps what was there).
const resetMaster = asyncHandler(async (req, res) => {
  const { ageBand } = req.params;
  if (!BANDS.includes(ageBand)) fail('Unknown age group', 404);
  const { quantities, doses, shivaLehSplit, tabletGrams, pendingNotes } = defaultMasterFor(ageBand);
  const { master, changes } = await saveBand({ ageBand, values: { quantities, doses, shivaLehSplit, tabletGrams, pendingNotes }, note: clean(req.body?.note) || 'Reset to the Formulation Master document values', user: req.user });
  res.json({ success: true, band: bandView(master), changes });
});

module.exports = { MASTER_EDIT_ROLES, MASTER_VIEW_ROLES, listMasters, updateMaster, resetMaster, diffMasters, bandView };
