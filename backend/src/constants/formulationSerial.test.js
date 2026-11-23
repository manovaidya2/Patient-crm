const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formulationFor, applyOverrides, sheetNumbers, chitsFor } = require('./formulationMaster');

const base = () => formulationFor({ ageBand: '4-12', plan: '6M', part: 'full' });
const add = (extra = {}) => ({ add: true, name: 'New medicine', qty: 100, unit: 'g', when: 'सुबह', dose: 'रोज़', ...extra });
// key -> number, in the order the sheet shows them.
const numbersOf = (sheet) => [...sheetNumbers(sheet)].sort((a, b) => a[1] - b[1]);

test('a medicine added at serial number 6 becomes 6; the one that was 6 becomes 7, 7 becomes 8, and so on', () => {
  const sheet = base();
  const before = numbersOf(sheet);
  const next = applyOverrides(sheet, [add({ serialNumber: '6' })], { byName: 'Doctor' });
  const added = next.lines.find((l) => l.added);
  const after = sheetNumbers(next);
  assert.equal(after.get(added.key), 6);
  before.forEach(([key, n]) => assert.equal(after.get(key), n >= 6 ? n + 1 : n, key));
  // The list itself has it in that place, and the medicines were not marked as corrected just for moving.
  const shown = next.lines.filter((l) => !l.removed);
  assert.equal(shown.indexOf(added), before.findIndex(([, n]) => n === 6));
  assert.equal(next.lines.filter((l) => l.edited && !l.added).length, 0);
  // Chits follow the new numbers.
  assert.equal(chitsFor(next).find((c) => c.itemKey === added.key).chitNo, 6);
});

test('numbers set by hand move down too; no serial number or one past the end adds it last', () => {
  let sheet = applyOverrides(base(), [{ key: 'shivaLeh', displayNumber: 8 }], { byName: 'Doctor' });
  const total = sheetNumbers(sheet).size;
  sheet = applyOverrides(sheet, [add({ serialNumber: 3 })], { byName: 'Doctor' });
  assert.equal(sheetNumbers(sheet).get('shivaLeh'), 9);
  const last = applyOverrides(base(), [add()], { byName: 'Doctor' });
  assert.equal(sheetNumbers(last).get(last.lines.at(-1).key), total + 1);
  const past = applyOverrides(base(), [add({ serialNumber: 999 })], { byName: 'Doctor' });
  assert.equal(sheetNumbers(past).get(past.lines.find((l) => l.added).key), total + 1);
});

test('two medicines added in one save each take their number; removed medicines are not counted', () => {
  let sheet = applyOverrides(base(), [{ key: 'shivaLeh', removed: true }], { byName: 'Doctor' });
  sheet = applyOverrides(sheet, [add({ name: 'A', serialNumber: 1 }), add({ name: 'B', serialNumber: 3 })], { byName: 'Doctor' });
  const numbers = sheetNumbers(sheet);
  const key = (name) => sheet.lines.find((l) => l.name === name).key;
  assert.equal(numbers.get(key('A')), 1);
  assert.equal(numbers.get(key('B')), 3);
  assert.equal(numbers.has('shivaLeh'), false);
  assert.equal(new Set(numbers.values()).size, numbers.size);
});

test('a serial number must be a whole number from 1 to 9999', () => {
  for (const serialNumber of [0, -2, 1.5, 'abc', 10000]) assert.throws(() => applyOverrides(base(), [add({ serialNumber })]), /serial number/);
});

test('a chosen dose instruction edited by hand for one medicine is kept as written, with the edit remembered', () => {
  const entry = { id: 'd1', doseTemplate: 'morning-oil', dosePattern: 'प्रतिदिन सुबह\nप्रतिदिन सुबह मेध्य Oil से सिर की जड़ों की मालिश करें।', doseEdited: true, dose: 'प्रतिदिन सुबह मेध्य Oil से सिर की जड़ों की हल्की मालिश करें।' };
  const sheet = applyOverrides(base(), [add({ doseEntries: [entry] })], { byName: 'Doctor' });
  const line = sheet.lines.find((l) => l.added);
  assert.equal(line.dose, entry.dose);
  assert.equal(line.doseEntries[0].doseEdited, true);
  assert.equal(line.doseEntries[0].doseTemplate, 'morning-oil');
  // Not edited: no flag is stored.
  const plain = applyOverrides(base(), [add({ doseEntries: [{ ...entry, doseEdited: false }] })], { byName: 'Doctor' });
  assert.equal('doseEdited' in plain.lines.find((l) => l.added).doseEntries[0], false);
});

test('a new sheet starts empty for any age group and supply; a development sheet starts from the ready master sheet', () => {
  const { blankSheetFor, templateSheetFor, formulationFor: build } = require('./formulationMaster');
  const blank = blankSheetFor({ ageBand: '4-12', plan: '6M', part: 'full' });
  assert.equal(blank.lines.length, 0);
  assert.equal(blank.custom, true);
  assert.equal(blank.blank, true);
  assert.equal(blank.days, 180);
  const customBlank = blankSheetFor({ ageBand: '4-12', plan: 'C1m10d', part: 'full' });
  assert.equal(customBlank.days, 40);
  assert.equal(customBlank.lines.length, 0);
  // With a master: the same sheet as before.
  const ready = templateSheetFor({ ageBand: '4-12', plan: '6M', part: 'full' });
  assert.deepEqual(ready.lines.map((l) => l.key), build({ ageBand: '4-12', plan: '6M', part: 'full' }).lines.map((l) => l.key));
  assert.equal(ready.sampleFrom, undefined);
  // 0-3 years has no master: the 3-4 years sheet, marked as its sample, for the 0-3 age group.
  const young = templateSheetFor({ ageBand: '0-3', plan: '6M', part: 'full' });
  assert.ok(young.lines.length > 0);
  assert.equal(young.ageBand, '0-3');
  assert.equal(young.sampleFrom.ageBand, '3-4');
});

test('pack days are typed as text, any way; empty or without a number is one pack for the whole supply (not required)', () => {
  const { packDaysOf } = require('./formulationMaster');
  assert.deepEqual(['1, 1, 1', '1 1 1', '15+15', '4', '4 din', '', 'abc', '0, 30'].map((typed) => packDaysOf(typed, 30)), [[1, 1, 1], [1, 1, 1], [15, 15], [4], [4], [30], [30], [30]]);
  assert.deepEqual(packDaysOf([10, 20], 30), [10, 20]);
});

test('the pack text is kept as typed (shown on the sheet); changing only the text is a change; the days come from its numbers', () => {
  const sheet = base();
  const line = sheet.lines.find((l) => l.packed && l.chitNo && l.containers.length === 1);
  const days = line.containers[0];
  const edited = applyOverrides(sheet, [{ key: line.key, containers: `${days} chamaach` }], { byName: 'Dr' });
  const after = edited.lines.find((l) => l.key === line.key);
  assert.deepEqual([after.packsText, after.containers, after.edited.changes], [`${days} chamaach`, [days], ['packs']]);
  const added = applyOverrides(sheet, [add({ containers: '4 chamaach' })], { byName: 'Dr' }).lines.find((l) => l.added);
  assert.deepEqual([added.packsText, added.containers], ['4 chamaach', [4]]);
});
