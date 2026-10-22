const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const FormulationMaster = require('../models/FormulationMaster');
const controller = require('./formulationMasterController');
const { formulationFor, defaultMasterFor, normalizeMaster, stockNeeds, chitsFor } = require('../constants/formulationMaster');
const { masterFromDoc } = require('../utils/formulationMasterStore');

afterEach(() => mock.restoreAll());
const doctor = { _id: new mongoose.Types.ObjectId(), name: 'Dr Garg', role: 'doctor' };
const call = async (handler, { params = {}, body = {}, user = doctor } = {}) => {
  let payload; let status = 200; let failure;
  await handler({ params, body, user, query: {} }, { status(c) { status = c; return this; }, json(v) { payload = v; } }, (e) => { failure = e; });
  if (failure) throw failure;
  return { status, ...payload };
};

test('an edited master changes every sheet built from it; the document values stay the default', () => {
  const master = defaultMasterFor('4-12');
  master.quantities.ghrit = { qty: 600, unit: 'ml' };
  master.doses.ghrit = '1 चम्मच (5 ml)';
  master.tabletGrams.ra = 0.25;
  master.shivaLehSplit['30'] = [15, 15];
  master.pendingNotes.mix = '';
  Object.assign(master, { version: 2, source: 'edited', updatedByName: 'Dr Garg' });
  const sheet = formulationFor({ ageBand: '4-12', plan: '1+5', part: 'first' }, master);
  const by = (key) => sheet.lines.find((l) => l.key === key);
  assert.equal(by('ghrit').qty, 100, '600 ml six-month -> 100 ml for the first month');
  assert.match(by('ghrit').dose, /1 चम्मच \(5 ml\)/);
  assert.equal(by('mix').components[0].grams, 1.25, '5 tablets x 0.25 g');
  assert.deepEqual(by('shivaLeh').containers, [15, 15]);
  assert.equal(chitsFor(sheet, 'A').filter((c) => c.itemKey === 'shivaLeh').length, 2);
  assert.equal(stockNeeds(sheet).find((n) => n.code === 'MEDHYA-GHRIT').qty, 100);
  assert.equal(by('mix').pending, undefined, 'a cleared pending note confirms the point');
  assert.deepEqual(sheet.master, { version: 2, source: 'edited', updatedAt: null, updatedByName: 'Dr Garg' });
  const plain = formulationFor({ ageBand: '4-12', plan: '1+5', part: 'first' });
  assert.equal(plain.lines.find((l) => l.key === 'ghrit').qty, 75);
  assert.equal(plain.master.version, 0);
  assert.equal(formulationFor({ ageBand: '3-4', plan: '6M', part: 'full' }, master).lines[0].qty, 225, 'a master of another band is ignored');
});

test('normalizeMaster validates what the page sends', () => {
  const clean = normalizeMaster({ quantities: { ghrit: { qty: '500', unit: 'ml' }, nasya: null }, shivaLehSplit: { 180: '90, 90' }, doses: { ghrit: ' ¾ चम्मच ' } }, '3-4');
  assert.deepEqual(clean.quantities.ghrit, { qty: 500, unit: 'ml' });
  assert.equal(clean.quantities.nasya, null);
  assert.deepEqual(clean.quantities.oil, { qty: 300, unit: 'ml' }, 'a key left out keeps the document value');
  assert.deepEqual(clean.shivaLehSplit['180'], [90, 90]);
  assert.equal(clean.doses.ghrit, '¾ चम्मच');
  assert.throws(() => normalizeMaster({ quantities: { ghrit: '' } }, '3-4'), /six-month quantity of मेध्य घृत/);
  assert.throws(() => normalizeMaster({ quantities: { ghrit: { qty: 5, unit: 'g' } } }, '3-4'), /unit must be ml/);
  assert.throws(() => normalizeMaster({ shivaLehSplit: { 180: '90,80' } }, '3-4'), /add up to 170, not 180/);
  assert.throws(() => normalizeMaster({ tabletGrams: { ra: 0 } }, '3-4'), /above 0/);
  assert.throws(() => normalizeMaster({ doses: { ghrit: '' } }, '3-4'), /dose text/);
  assert.throws(() => normalizeMaster({}, '2-3'), /Unknown age group/);
});

test('the doctor saves a new master version with history; reset brings the document values back', async () => {
  const docs = [];
  mock.method(FormulationMaster, 'findOne', (filter) => {
    const found = docs.find((d) => d.ageBand === filter.ageBand) || null;
    const result = Promise.resolve(found);
    result.lean = async () => (found ? found.toObject() : null);
    return result;
  });
  mock.method(FormulationMaster.prototype, 'save', async function save() { await this.validate(); this.isNew = false; if (!docs.includes(this)) docs.push(this); return this; });

  const list = await call(controller.listMasters);
  assert.equal(list.bands.length, 4);
  assert.equal(list.bands[1].version, 0);
  assert.equal(list.bands[1].sheets['1+5:first'].lines[0].qty, 75);
  assert.equal(list.canEdit, true);

  await assert.rejects(call(controller.updateMaster, { params: { ageBand: '4-12' }, body: { quantities: { ghrit: { qty: 600, unit: 'ml' } } } }), /Write why/);
  await assert.rejects(call(controller.updateMaster, { params: { ageBand: '4-12' }, body: { note: 'x' } }), /Nothing was changed/);
  const saved = await call(controller.updateMaster, { params: { ageBand: '4-12' }, body: { quantities: { ghrit: { qty: 600, unit: 'ml' } }, pendingNotes: { mix: '' }, note: 'Dr Garg: 1 चम्मच ghrit above 4 years' } });
  assert.equal(saved.band.version, 1);
  assert.equal(saved.band.source, 'edited');
  assert.equal(saved.band.updatedByName, 'Dr Garg');
  assert.equal(saved.band.sheets['1+5:first'].lines[0].qty, 100);
  assert.equal(saved.band.sheets['6M:full'].lines[0].qty, 600);
  assert.ok(saved.changes.some((c) => /450 ml -> 600 ml/.test(c)), saved.changes.join(' | '));
  assert.ok(saved.changes.some((c) => /mix: pending point confirmed/.test(c)));
  assert.equal(saved.band.history.length, 1);
  assert.equal(saved.band.history[0].note, 'Dr Garg: 1 चम्मच ghrit above 4 years');
  assert.deepEqual(docs[0].history[0].previous.quantities.ghrit, { qty: 450, unit: 'ml' }, 'the previous values are kept');

  // A job built now gets the edited master.
  const stored = masterFromDoc(docs[0]);
  assert.equal(formulationFor({ ageBand: '4-12', plan: '2+4', part: 'first' }, stored).lines[0].qty, 200);

  const reset = await call(controller.resetMaster, { params: { ageBand: '4-12' }, body: {} });
  assert.equal(reset.band.version, 2);
  assert.equal(reset.band.sheets['1+5:first'].lines[0].qty, 75);
  assert.equal(reset.band.history.length, 2);
  await assert.rejects(call(controller.updateMaster, { params: { ageBand: '99' }, body: { note: 'x' } }), /Unknown age group/);
});
