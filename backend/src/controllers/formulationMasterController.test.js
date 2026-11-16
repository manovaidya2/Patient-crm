const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const FormulationMaster = require('../models/FormulationMaster');
const controller = require('./formulationMasterController');
const { formulationFor, defaultMasterFor, normalizeMaster, stockNeeds, chitsFor, applyOverrides } = require('../constants/formulationMaster');
const { masterFromDoc } = require('../utils/formulationMasterStore');

afterEach(() => mock.restoreAll());

test('multiple dose instructions survive save, reopen, append and removal without truncating the chit', () => {
  const initial = formulationFor({ ageBand: '4-12', plan: '6M', part: 'full' });
  const entries = [0, 1, 2].map((i) => ({ id: `dose-${i}`, doseTemplate: 'custom', dose: `Instruction ${i}: ${'text '.repeat(40)}`, customDose: `Instruction ${i}` }));
  let sheet = applyOverrides(initial, [{ add: true, name: 'Test medicine', qty: 50, unit: 'g', doseEntries: entries }], { byName: 'Doctor' });
  let medicine = sheet.lines.at(-1);
  assert.equal(medicine.doseEntries.length, 3);
  assert.ok(medicine.dose.length > 500);
  assert.equal(medicine.dose, entries.map((e) => e.dose.trim()).join('\n'));
  assert.equal(chitsFor(sheet).at(-1).dose, medicine.dose);
  sheet = JSON.parse(JSON.stringify(sheet));
  const appended = [...medicine.doseEntries, { id: 'dose-3', doseTemplate: 'medicine-honey', dosePattern: '___ medicine + ___ honey', doseQuantities: ['1/2', '1/3'], dose: '1/2 medicine + 1/3 honey' }];
  sheet = applyOverrides(sheet, [{ key: medicine.key, doseEntries: appended }]);
  medicine = sheet.lines.at(-1);
  assert.equal(medicine.doseEntries.length, 4);
  assert.equal(medicine.doseEntries[0].dose, entries[0].dose.trim());
  assert.deepEqual(medicine.doseEntries[3].doseQuantities, ['1/2', '1/3']);
  sheet = applyOverrides(sheet, [{ key: medicine.key, doseEntries: appended.filter((e) => e.id !== 'dose-1') }]);
  assert.equal(sheet.lines.at(-1).doseEntries.length, 3);
  assert.equal(sheet.lines.at(-1).dose.includes('Instruction 1:'), false);
  assert.throws(() => applyOverrides(sheet, [{ key: medicine.key, doseEntries: [{ dose: 'Filled' }, { dose: '' }] }]), /Complete every dose/);
});

test('multiple ghrit variants replace the generic ghrit and retain independent quantities, stock and chits', () => {
  const master = normalizeMaster({ quantities: { ghritNm0: { qty: 300, unit: 'ml' }, ghritNm3: { qty: 600, unit: 'ml' } } }, '4-12');
  const sheet = formulationFor({ ageBand: '4-12', plan: '1+5', part: 'first' }, { ...master, ageBand: '4-12' });
  assert.equal(sheet.lines.some((l) => l.key === 'ghrit'), false);
  assert.equal(sheet.lines.find((l) => l.key === 'ghritNm0').qty, 50);
  assert.equal(sheet.lines.find((l) => l.key === 'ghritNm3').qty, 100);
  assert.equal(stockNeeds(sheet).find((l) => l.code === 'GH-NM-0').qty, 50);
  assert.equal(stockNeeds(sheet).find((l) => l.code === 'GH-NM-3').qty, 100);
  assert.equal(stockNeeds(sheet).some((l) => l.code === 'MEDHYA-GHRIT'), false);
  const chits = chitsFor(sheet);
  assert.equal(chits.filter((c) => /^ghritNm/.test(c.itemKey)).length, 2);
  assert.equal(new Set(chits.map((c) => c.chitNo)).size, chits.length);
  const cleared = normalizeMaster({}, '4-12');
  assert.equal(formulationFor({ ageBand: '4-12', plan: '6M', part: 'full' }, { ...cleared, ageBand: '4-12' }).lines[0].key, 'ghrit');
  assert.throws(() => normalizeMaster({ quantities: { ghritNm1: { qty: 0, unit: 'ml' } } }, '4-12'), /positive quantity/);
});

test('clearing saved ghrit selections keeps every ghrit out of rebuilt sheets, stock and chits', () => {
  const selected = normalizeMaster({ quantities: { ghritNm0: { qty: 300, unit: 'ml' }, ghritNm5: { qty: 600, unit: 'ml' } } }, '4-12');
  const cleared = normalizeMaster({ ...selected, quantities: { ...selected.quantities, ghrit: null, ghritNm0: null, ghritNm5: null } }, '4-12');
  // A saved/reloaded master retains the explicit null for the old generic entry.
  const reloaded = JSON.parse(JSON.stringify({ ...cleared, ageBand: '4-12' }));
  for (const [plan, part] of [['6M', 'full'], ['1+5', 'first'], ['1+5', 'rest']]) {
    const sheet = formulationFor({ ageBand: '4-12', plan, part }, reloaded);
    assert.equal(sheet.lines.some((l) => l.key.startsWith('ghrit')), false);
    assert.equal(stockNeeds(sheet).some((l) => l.code === 'MEDHYA-GHRIT' || l.code.startsWith('GH-NM-')), false);
    assert.equal(chitsFor(sheet).some((c) => c.itemKey.startsWith('ghrit')), false);
    assert.ok(sheet.lines.some((l) => l.key === 'shivaLeh'));
  }
});
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
  assert.equal(normalizeMaster({ quantities: { ghrit: '' } }, '3-4').quantities.ghrit, null);
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
