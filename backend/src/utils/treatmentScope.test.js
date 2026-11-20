const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanScopeEdit, scopeChanges, scopeView } = require('./treatmentScope');
const { normalizeRecord } = require('./postCounselingRecord');

const record = { components: { selected: ['dosDontsDiet', 'regularFollowUps'], ayurvedicPrice: '' }, otherComponent: 'Yoga' };

test('the doctor\'s ticks: in the paper\'s order, never none; nothing sent keeps what is saved', () => {
  assert.deepEqual(cleanScopeEdit({ selected: ['familyCounselling', 'dosDontsDiet', 'unknown'], other: '' }, record), { selected: ['dosDontsDiet', 'familyCounselling'], other: '' });
  assert.deepEqual(cleanScopeEdit({}, record), { selected: ['dosDontsDiet', 'regularFollowUps'], other: 'Yoga' });
  assert.throws(() => cleanScopeEdit({ selected: [] }, record), /at least one/);
  assert.deepEqual(scopeChanges(record, cleanScopeEdit({}, record)), []);
  assert.deepEqual(scopeChanges(record, { selected: ['dosDontsDiet', 'familyCounselling'], other: '' }), [
    'Added: Family Counselling Sessions',
    'Removed: Regular Follow-ups',
    'Other doctor-recommended component: "Yoga" -> "-"',
  ]);
});

test('after the doctor\'s change: what is ticked now and what was on the PO; the value stays from the Post Counselor\'s ticks', () => {
  const changed = { ...record, components: { selected: ['dosDontsDiet', 'familyCounselling'], postCounselorSelected: ['dosDontsDiet', 'regularFollowUps'] } };
  const view = scopeView({ _id: 'e1', postCounseling: { record: changed, purchase: { values: { poNo: 'PO-9' } } } });
  const pick = (key) => view.components.find((c) => c.key === key);
  assert.equal(view.components.length, 13);
  assert.deepEqual([pick('dosDontsDiet').selected, pick('dosDontsDiet').onPo, pick('dosDontsDiet').value], [true, true, 18000]);
  assert.deepEqual([pick('familyCounselling').selected, pick('familyCounselling').onPo, pick('familyCounselling').value], [true, false, 0]);
  assert.deepEqual([pick('regularFollowUps').selected, pick('regularFollowUps').onPo, pick('regularFollowUps').value], [false, true, 30000]);
  assert.equal(view.poNumber, 'PO-9');
  // An older record (concession only) works its value out from the Post Counselor's ticks, not the doctor's.
  const old = normalizeRecord({ ...changed, e: { concession: 8000 }, totals: { referenceValue: 48000 } });
  assert.deepEqual([old.totals.referenceValue, old.totals.approvedProgramFee], [48000, 40000]);
});
