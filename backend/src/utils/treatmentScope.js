const mongoose = require('mongoose');
const { COMPONENTS, CUSTOM_PRICE_KEY } = require('./postCounselingRecord');

// The treatment & support components of a purchase (section C of the post-counselling record) as the doctor approves
// them at the formulation step (step 2 of medicine fulfilment). The Post Counselor ticked the components; the doctor
// keeps them, or unticks a component / ticks one more (and can write the other doctor-recommended component), then
// approves. The doctor's ticks become the record's `components.selected`, so the PO, Treatment Papers, Medicine
// Explanations and Treatment Delivery all follow them. The Post Counselor's own ticks stay in
// `components.postCounselorSelected` (saved at the first change): the package value and payments are worked out from
// those and are never changed here.

const text = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const KEYS = COMPONENTS.map((c) => c.key);
const LABEL = Object.fromEntries(COMPONENTS.map((c) => [c.key, c.label]));

// The ticks the package value was worked out from (the Post Counselor's).
const billedOf = (record = {}) => record.components?.postCounselorSelected || record.components?.selected || [];
const selectedOf = (record = {}) => record.components?.selected || [];

// Section C of a saved record, for the doctor's card: every component, whether it is ticked now and whether the Post
// Counselor had ticked it, with its scope and its value on the PO.
const scopeView = (entry) => {
  const pc = entry?.postCounseling || {};
  const record = pc.record || {};
  const selected = selectedOf(record);
  const billed = billedOf(record);
  return {
    entryId: String(entry._id),
    poNumber: pc.purchase?.values?.poNo || '',
    components: COMPONENTS.map((c) => ({
      key: c.key, label: c.label, scope: c.scope || '',
      selected: selected.includes(c.key),
      onPo: billed.includes(c.key),
      // The value it carries on the PO (only a component the Post Counselor ticked has one).
      value: billed.includes(c.key) ? (c.key === CUSTOM_PRICE_KEY ? Number(record.components?.ayurvedicPrice || 0) : Number(c.price || 0)) : 0,
      price: c.key === CUSTOM_PRICE_KEY ? null : Number(c.price || 0),
    })),
    other: text(record.otherComponent),
    review: pc.scopeReview?.editedAt ? { editedAt: pc.scopeReview.editedAt, editedByName: pc.scopeReview.editedByName || '' } : null,
  };
};

// What the doctor sent: the ticked components (in the paper's order) and the other component. Nothing sent keeps
// what is saved. Returns { selected, other } or throws when no component is left ticked.
const cleanScopeEdit = (raw = {}, record = {}) => {
  const selected = Array.isArray(raw.selected) ? KEYS.filter((key) => raw.selected.includes(key)) : selectedOf(record).filter((key) => KEYS.includes(key));
  if (!selected.length) throw Object.assign(new Error('Keep at least one treatment component ticked'), { statusCode: 400 });
  const other = raw.other === undefined ? text(record.otherComponent) : text(raw.other);
  return { selected, other };
};

// The differences between the saved section C and the doctor's edit, as lines for the history.
const scopeChanges = (record = {}, edit) => {
  const before = selectedOf(record);
  const added = edit.selected.filter((key) => !before.includes(key)).map((key) => LABEL[key]);
  const removed = before.filter((key) => !edit.selected.includes(key)).map((key) => LABEL[key] || key);
  const lines = [];
  if (added.length) lines.push(`Added: ${added.join(', ')}`);
  if (removed.length) lines.push(`Removed: ${removed.join(', ')}`);
  const otherBefore = text(record.otherComponent);
  if (otherBefore !== edit.other) lines.push(`Other doctor-recommended component: "${otherBefore || '-'}" -> "${edit.other || '-'}"`);
  return lines;
};

// No database (unit tests): nothing to look up.
const db = { ready: () => mongoose.connection.readyState === 1 };

// The post-counselling record of a purchase: found by its PO number (the job's own PO first, then the phase's PO,
// as a later supply of the phase has no record of its own). null when there is none.
const findScopeEntry = async (poNumbers = []) => {
  if (!db.ready()) return null;
  const Management = require('../models/AppointmentManagementEntry');
  for (const poNo of [...new Set(poNumbers.map((p) => String(p || '').trim()).filter(Boolean))]) {
    const entry = await Management.findOne({ 'postCounseling.purchase.values.poNo': poNo, 'postCounseling.savedAt': { $ne: null } })
      .select('postCounseling.record postCounseling.purchase.values.poNo postCounseling.scopeReview');
    if (entry) return entry;
  }
  return null;
};

// Saves the doctor's edit into the record (only when something changed). Returns the change lines.
const saveScopeEdit = async (entry, edit, user, now = new Date()) => {
  const record = entry.postCounseling?.record || {};
  const changes = scopeChanges(record, edit);
  if (!changes.length) return changes;
  const Management = require('../models/AppointmentManagementEntry');
  const set = {
    'postCounseling.record.components.selected': edit.selected,
    'postCounseling.record.otherComponent': edit.other,
    'postCounseling.scopeReview': { editedAt: now, editedByName: user.name, editedByRole: user.role },
  };
  // The Post Counselor's ticks are kept once, at the first change: the package value stays worked out from them.
  if (!record.components?.postCounselorSelected) set['postCounseling.record.components.postCounselorSelected'] = selectedOf(record);
  await Management.updateOne({ _id: entry._id }, { $set: set, $push: { 'postCounseling.scopeHistory': { at: now, byName: user.name, byRole: user.role, changes } } });
  return changes;
};

module.exports = { LABEL, billedOf, selectedOf, scopeView, cleanScopeEdit, scopeChanges, findScopeEntry, saveScopeEdit, db };
