import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankPaymentRange } from './bankPaymentRange.js';

test('bank detail inherits the dashboard day and month filters', () => {
  assert.deepEqual(bankPaymentRange({ filter: 'date', date: '2026-09-29' }), { from: '2026-09-29', to: '2026-09-29' });
  assert.deepEqual(bankPaymentRange({ filter: 'month', month: '2026-09' }), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(bankPaymentRange({ filter: 'month', month: '2028-02' }), { from: '2028-02-01', to: '2028-02-29' });
});

test('accounts today and all-date filters keep their scope', () => {
  assert.deepEqual(bankPaymentRange({ filter: 'today' }, new Date(2026, 8, 29, 12)), { from: '2026-09-29', to: '2026-09-29' });
  assert.deepEqual(bankPaymentRange({ filter: 'all' }), { from: '', to: '' });
});
