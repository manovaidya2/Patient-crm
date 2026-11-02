const { test } = require('node:test');
const assert = require('node:assert/strict');
const { supplyOption, supplyOptionByLabel, supplyLabel, isValidPlan, customMonths, CUSTOM_PICK_LABEL } = require('./supplyPlans');
const { formulationFor } = require('./formulationMaster');
const { cleanPurchase } = require('../utils/purchaseOrderRecord');

test('a custom supply is "C<months>": parsed from the key and from the paper label, valid for 1 to 12 months', () => {
  assert.deepEqual(supplyOption('C4', 'full'), { key: 'C4:full', plan: 'C4', part: 'full', months: 4, days: 120, label: 'Custom: 4 months', custom: true });
  assert.equal(supplyOptionByLabel('Custom: 1 month').plan, 'C1');
  assert.equal(supplyOptionByLabel(CUSTOM_PICK_LABEL), null, 'months not chosen yet');
  assert.equal(supplyLabel('C7', 'full'), 'Custom: 7 months');
  assert.equal(supplyOption('C13', 'full'), null);
  assert.equal(supplyOption('CUSTOM'), null);
  assert.ok(isValidPlan('C12') && isValidPlan('6M') && isValidPlan(''));
  assert.ok(!isValidPlan('C0') && !isValidPlan('X'));
  assert.equal(customMonths('2+4'), 0);
});

test('a custom supply has no master: an empty custom sheet for the months, whatever the age band', () => {
  const sheet = formulationFor({ ageBand: '4-12', plan: 'C4', part: 'full' }, null);
  assert.equal(sheet.custom, true);
  assert.deepEqual([sheet.months, sheet.days, sheet.lines.length, sheet.first], [4, 120, 0, true]);
  assert.match(sheet.title, /4 MONTH FORMULATION \| CUSTOM SUPPLY/);
  assert.equal(formulationFor({ ageBand: '4-12', plan: '2+4', part: 'first' }, null).custom, undefined, 'fixed plans keep the master sheet');
});

test('the PO paper: picking custom and typing the months saves "Custom: N months"; no months keeps it a draft', () => {
  const base = { mode: 'Cash', amountReceivedNow: '0' };
  assert.equal(cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '4' }, 10000).values.supplyOrder, 'Custom: 4 months');
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Custom: 4 months', supplyMonths: '' }, 10000).values.supplyOrder, 'Custom: 4 months', 'a saved paper opens again as it was');
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Custom: 4 months', supplyMonths: '6' }, 10000).values.supplyOrder, 'Custom: 6 months', 'the months can be changed');
  assert.equal(cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL }, 10000).values.supplyOrder, CUSTOM_PICK_LABEL);
  assert.throws(() => cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '14' }, 10000), /1 to 12/);
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Full 6 months', supplyMonths: '3' }, 10000).values.supplyMonths, '', 'months only matter for custom');
});
