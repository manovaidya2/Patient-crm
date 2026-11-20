const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PAGES } = require('./taskCountController');

test('the Doctor gets the work cards of every page the Doctor can open, not the Admin-only pages', () => {
  const doctorPages = Object.keys(PAGES).filter((page) => PAGES[page].includes('doctor'));
  ['/admin/treatment-delivery', '/admin/followups', '/admin/family-sessions', '/admin/purchase-orders', '/admin/medicine-jobs', '/admin/stocks']
    .forEach((page) => assert.ok(doctorPages.includes(page), page));
  ['/admin/courier', '/admin/self-pickup-schedule', '/admin/transit-follow-ups', '/admin/treatment-papers', '/admin/final-check', '/admin/medicine-explanations', '/admin/package-not-bought', '/admin/record-room-overdue']
    .forEach((page) => assert.ok(!doctorPages.includes(page), page));
});
