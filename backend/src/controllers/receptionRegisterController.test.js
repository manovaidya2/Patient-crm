const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanColumn, cleanValues, validDate } = require('./receptionRegisterController');
test('validates custom columns and normalizes dropdown options', () => {
  assert.deepEqual(cleanColumn({ label: ' Status ', type: 'select', options: ['Received', ' Received ', 'Handed over'] }).options, ['Received', 'Handed over']);
  for (const body of [{ label: '', type: 'text' }, { label: 'Test', type: 'unknown' }, { label: 'Status', type: 'select', options: [] }]) assert.throws(() => cleanColumn(body), { statusCode: 400 });
});
test('required and typed values are checked on the server', () => {
  for (const [type, value, options = []] of [['number', 'abc'], ['date', '2026-02-30'], ['time', '25:10'], ['select', 'unknown', ['Received']], ['checkbox', 'yes']]) {
    assert.throws(() => cleanValues([{ key: 'x', label: 'Field', type, options }], { x: value }), { statusCode: 400 });
  }
  assert.throws(() => cleanValues([{ key: 'x', label: 'Name', type: 'text', required: true }], {}), { statusCode: 400 });
  assert.throws(() => cleanValues([], null), { statusCode: 400 });
  assert.equal(validDate('2026-02-28'), true);
  assert.equal(validDate('2026-02-30'), false);
});
test('stores only known column keys and preserves explicit unchecked values', () => {
  assert.deepEqual(cleanValues([{ key: 'x', label: 'Received', type: 'checkbox' }], { x: 'false', injected: 'test' }), { x: 'false' });
});
