const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PACKAGE_IDS, packageValuesFor } = require('./receptionPackage');

const v = (id) => `values.${id}`;

test('a converted visit fills Package Offered, Advance, Due and Status = Purchased in reception details', () => {
  const set = packageValuesFor({ postCounseling: { outcome: { kind: 'converted' }, purchase: { values: { amountReceivedNow: 20000 }, totals: { approvedProgramFee: 47000, outstandingBalance: 27000 } } } });
  assert.equal(set[v(PACKAGE_IDS.offered)], '47000');
  assert.equal(set[v(PACKAGE_IDS.advance)], '20000');
  assert.equal(set[v(PACKAGE_IDS.due)], '27000');
  assert.equal(set[v(PACKAGE_IDS.status)], 'Purchased');
});

test('package not purchased: the package offered and Status = Not Purchased; nothing for a visit without an outcome', () => {
  const set = packageValuesFor({ postCounseling: { outcome: { kind: 'not_purchased' }, record: { totals: { approvedProgramFee: 42000 } } } });
  assert.deepEqual(set, { [v(PACKAGE_IDS.offered)]: '42000', [v(PACKAGE_IDS.status)]: 'Not Purchased' });
  assert.deepEqual(packageValuesFor({ postCounseling: {} }), {});
});
