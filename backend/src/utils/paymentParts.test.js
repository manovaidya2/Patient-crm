const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workOutDues, dueNote, applyParts } = require('./paymentParts');
const { cleanRecord } = require('./postCounselingRecord');
const { cleanPurchase } = require('./purchaseOrderRecord');

test('each due is the balance left after that part and every earlier part', () => {
  assert.deepEqual(workOutDues({ part1Amount: 10000, part2Amount: 15000, part3Amount: 17000 }, 42000), { part1Due: 32000, part2Due: 17000, part3Due: 0 });
  assert.deepEqual(workOutDues({ part1Amount: 10000, part2Amount: '', part3Amount: '' }, 42000), { part1Due: 32000, part2Due: '', part3Due: '' });
  assert.deepEqual(workOutDues({ part1Amount: '', part2Amount: '', part3Amount: '' }, 42000), { part1Due: '', part2Due: '', part3Due: '' });
});

test('parts go in order and cannot add up to more than the fee', () => {
  assert.throws(() => workOutDues({ part1Amount: '', part2Amount: 5000, part3Amount: '' }, 42000), /Fill Part 1 before Part 2/);
  assert.throws(() => workOutDues({ part1Amount: 30000, part2Amount: 20000, part3Amount: '' }, 42000), /more than the approved fee/);
  // Without a known fee no balance is shown.
  assert.deepEqual(workOutDues({ part1Amount: 5000, part2Amount: '', part3Amount: '' }, 0), { part1Due: '', part2Due: '', part3Due: '' });
});

test('text from an old due box is kept as a note unless it is the worked-out amount', () => {
  assert.equal(dueNote('After medicine is ready', '', 32000), 'After medicine is ready');
  assert.equal(dueNote('32,000', '', 32000), '');
  assert.equal(dueNote('', 'kept earlier', 32000), 'kept earlier');
  const values = { part1Amount: 10000, part2Amount: '', part3Amount: '' };
  applyParts(values, { part1Due: 'At start' }, 42000);
  assert.equal(values.part1Due, 32000);
  assert.equal(values.part1DueNote, 'At start');
});

test('the post-counselling record and the PO paper both save worked-out dues', () => {
  const record = cleanRecord({ components: { selected: ['dosDontsDiet'] }, e: { approvedProgramFee: '', paymentPlan: '2 Parts', part1Amount: '1000', part1Due: 'typed by hand', part2Amount: '' } });
  const fee = record.totals.approvedProgramFee;
  assert.ok(fee > 1000);
  assert.equal(record.e.part1Due, fee - 1000);
  assert.equal(record.e.part1DueNote, 'typed by hand');
  assert.equal(record.e.part2Due, '');
  const paper = cleanPurchase({ plan: '3 Parts', part1Amount: '10000', part2Amount: '12000', part1Due: '999' }, 42000);
  assert.equal(paper.values.part1Due, 32000);
  assert.equal(paper.values.part2Due, 20000);
  assert.equal(paper.values.part3Due, '');
  assert.equal(paper.values.part1DueNote, '999');
});
