const { test } = require('node:test');
const assert = require('node:assert/strict');
const { supplyOption, supplyOptionByLabel, supplyLabel, isValidPlan, customMonths, customDays, lengthText, CUSTOM_PICK_LABEL } = require('./supplyPlans');
const { formulationFor } = require('./formulationMaster');
const { cleanPurchase } = require('../utils/purchaseOrderRecord');

test('a custom supply is "C<months>": parsed from the key and from the paper label, valid for 1 to 12 months', () => {
  assert.deepEqual(supplyOption('C4', 'full'), { key: 'C4:full', plan: 'C4', part: 'full', months: 4, days: 120, label: 'Custom: 4 months', custom: true, customMonths: 4, customDays: 0 });
  assert.equal(supplyOptionByLabel('Custom: 1 month').plan, 'C1');
  assert.equal(supplyOptionByLabel(CUSTOM_PICK_LABEL), null, 'months not chosen yet');
  assert.equal(supplyLabel('C7', 'full'), 'Custom: 7 months');
  assert.equal(supplyOption('C13', 'full'), null);
  assert.equal(supplyOption('CUSTOM'), null);
  assert.ok(isValidPlan('C12') && isValidPlan('6M') && isValidPlan(''));
  assert.ok(!isValidPlan('C0') && !isValidPlan('X'));
  assert.equal(customMonths('2+4'), 0);
});

test('a custom supply can have days: "C<months>m<days>d", at most 12 months in all', () => {
  const days45 = supplyOption('C0m45d', 'full');
  assert.deepEqual([days45.label, days45.days, days45.months, days45.customMonths, days45.customDays], ['Custom: 45 days', 45, 1.5, 0, 45]);
  assert.deepEqual([supplyLabel('C1m15d', 'full'), supplyOption('C1m15d').days], ['Custom: 1 month 15 days', 45]);
  assert.equal(supplyOptionByLabel('Custom: 45 days').plan, 'C0m45d');
  assert.equal(supplyOptionByLabel('Custom: 1 month 15 days').plan, 'C1m15d');
  assert.equal(supplyOptionByLabel('Custom: 2 months 1 day').plan, 'C2m1d');
  assert.equal(supplyOptionByLabel('Custom: 12 months 1 day'), null, 'more than 12 months');
  assert.ok(isValidPlan('C0m1d') && isValidPlan('C11m30d') && isValidPlan('C0m360d'));
  assert.ok(!isValidPlan('C3m0d') && !isValidPlan('C12m1d') && !isValidPlan('C0m0d') && !isValidPlan('C04'), 'one written form, within 12 months');
  assert.deepEqual([customDays('C0m45d'), customDays('C6'), customDays('6M')], [45, 180, 0]);
  assert.deepEqual([45, 20, 180, 135, 1, 0].map(lengthText), ['1 month 15 days', '20 days', '6 months', '4 months 15 days', '1 day', '']);
});

test('a custom supply has no master: an empty custom sheet for the months, whatever the age band', () => {
  const sheet = formulationFor({ ageBand: '4-12', plan: 'C4', part: 'full' }, null);
  assert.equal(sheet.custom, true);
  assert.deepEqual([sheet.months, sheet.days, sheet.lines.length, sheet.first], [4, 120, 0, true]);
  assert.match(sheet.title, /4 MONTH FORMULATION \| CUSTOM SUPPLY/);
  assert.equal(formulationFor({ ageBand: '4-12', plan: '2+4', part: 'first' }, null).custom, undefined, 'fixed plans keep the master sheet');
  const days45 = formulationFor({ ageBand: '12-70', plan: 'C0m45d', part: 'full' }, null);
  assert.deepEqual([days45.custom, days45.days, days45.months, days45.title], [true, 45, 1.5, '45 DAY FORMULATION | CUSTOM SUPPLY']);
});

test('the PO paper: picking custom and typing the months saves "Custom: N months"; no months keeps it a draft', () => {
  const base = { mode: 'Cash', amountReceivedNow: '0' };
  assert.equal(cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '4' }, 10000).values.supplyOrder, 'Custom: 4 months');
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Custom: 4 months', supplyMonths: '' }, 10000).values.supplyOrder, 'Custom: 4 months', 'a saved paper opens again as it was');
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Custom: 4 months', supplyMonths: '6' }, 10000).values.supplyOrder, 'Custom: 6 months', 'the months can be changed');
  assert.equal(cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL }, 10000).values.supplyOrder, CUSTOM_PICK_LABEL);
  assert.throws(() => cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '14' }, 10000), /months \(0 to 12\)/);
  assert.deepEqual(['supplyOrder', 'supplyMonths', 'supplyDays'].map((key) => cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '', supplyDays: '45' }, 10000).values[key]), ['Custom: 45 days', '0', '45']);
  assert.equal(cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '1', supplyDays: '15' }, 10000).values.supplyOrder, 'Custom: 1 month 15 days');
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Custom: 45 days' }, 10000).values.supplyOrder, 'Custom: 45 days', 'a saved paper of days opens again as it was');
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Custom (choose months)', supplyMonths: '3' }, 10000).values.supplyOrder, 'Custom: 3 months', 'a paper picked before days came still works');
  assert.throws(() => cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '12', supplyDays: '5' }, 10000), /12 months in all/);
  assert.throws(() => cleanPurchase({ ...base, supplyOrder: CUSTOM_PICK_LABEL, supplyMonths: '0', supplyDays: '0' }, 10000), /from 1 day/);
  assert.equal(cleanPurchase({ ...base, supplyOrder: 'Full 6 months', supplyMonths: '3' }, 10000).values.supplyMonths, '', 'months only matter for custom');
});
