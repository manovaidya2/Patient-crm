// The automatic PCC choice: fewest patients first, an equal count in turn, on leave today last.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rankPccs } = require('./pccWorkload');

test('the PCC with the fewest patients comes first (only patients count)', () => {
  const ranked = rankPccs([
    { id: 'a', name: 'Sakshi', patients: 70 },
    { id: 'b', name: 'Neha', patients: 8 },
    { id: 'c', name: 'Aditi', patients: 71 },
  ]);
  assert.deepEqual(ranked.map((p) => `${p.name} ${p.workload}`), ['Neha 8', 'Sakshi 70', 'Aditi 71']);
});

test('an equal count goes in turn: the one given a patient longest ago (or never) first', () => {
  const ranked = rankPccs([
    { id: 'a', name: 'Sakshi', patients: 5, lastAssignedAt: '2026-11-26T10:00:00Z' },
    { id: 'b', name: 'Neha', patients: 5, lastAssignedAt: '2026-11-20T10:00:00Z' },
    { id: 'c', name: 'Aditi', patients: 5, lastAssignedAt: null },
  ]);
  assert.deepEqual(ranked.map((p) => p.name), ['Aditi', 'Neha', 'Sakshi']);
});

test('a PCC on leave today comes last whatever the count', () => {
  const ranked = rankPccs([
    { id: 'a', name: 'Sakshi', patients: 1, onLeave: true },
    { id: 'b', name: 'Neha', patients: 9 },
  ]);
  assert.deepEqual(ranked.map((p) => p.name), ['Neha', 'Sakshi']);
});
