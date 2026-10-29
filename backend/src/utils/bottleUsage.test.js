const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bottleUsageFrom, withBottles, monthStart } = require('./bottleUsage');

const now = new Date('2026-10-29T08:00:00.000Z');
const job = (doneAt, lines) => ({ stages: [{ key: 'accept', doneAt }, { key: 'prepare', doneAt }], formulation: { lines } });
const ghrit = { name: 'मेध्य घृत', stockCode: 'MEDHYA-GHRIT', packed: true, bottles: 1 };
const sirup = { name: 'मेध्य सिरप', stockCode: 'MEDHYA-SIRUP', packed: true, bottles: 2 };
const oil = { name: 'मेध्य Oil', stockCode: 'MEDHYA-OIL', packed: true, bottles: 1 };

test('bottles used are counted per medicine from prepared jobs, with this month apart', () => {
  const usage = bottleUsageFrom([
    job(new Date('2026-10-20T06:00:00Z'), [ghrit, sirup, oil]),
    job(new Date('2026-09-25T06:00:00Z'), [ghrit, { ...oil, packed: false }]),
    // Not prepared yet (or preparation reverted): nothing drawn.
    { stages: [{ key: 'accept', doneAt: new Date() }], formulation: { lines: [ghrit] } },
  ], now);
  assert.deepEqual(usage.get('MEDHYA-GHRIT'), { code: 'MEDHYA-GHRIT', name: 'मेध्य घृत', total: 2, month: 1 });
  assert.equal(usage.get('MEDHYA-SIRUP').total, 2);
  assert.equal(usage.get('MEDHYA-OIL').total, 1, 'an unpacked (removed) oil uses no bottle');
  assert.equal(monthStart(now).toISOString(), '2026-09-30T18:30:00.000Z', 'month starts at midnight India time');

  const items = withBottles([
    { code: 'MEDHYA-GHRIT', name: 'Medhya Ghrit', unit: 'ml', currentStock: 3837.5 },
    { code: 'MEDHYA-SIRUP', name: 'Medhya Syrup', unit: 'ml', currentStock: 3837.5 },
    { code: 'MEDHYA-OIL', name: 'Medhya Oil', unit: 'ml', currentStock: 2650 },
    { code: 'BT-100', name: 'Bottle 100 ml', unit: 'piece', currentStock: 158 },
    { code: 'RY-33', name: 'RY-33', unit: 'tablet', currentStock: 100 },
  ], usage);
  const by = (code) => items.find((i) => i.code === code);
  assert.deepEqual(by('MEDHYA-GHRIT').bottles, { size: 100, bottleCode: 'BT-100', inStock: 38, usedTotal: 2, usedMonth: 1 });
  assert.equal(by('BT-100').bottles.usedTotal, 5);
  assert.equal(by('BT-100').bottles.usedMonth, 4);
  assert.equal(by('BT-100').bottles.neededForStock, 38 + 38 + 26, 'the medicine in stock would fill this many bottles');
  assert.equal(by('BT-100').bottles.byMedicine.find((m) => m.code === 'MEDHYA-OIL').name, 'Medhya Oil');
  assert.equal(by('RY-33').bottles, undefined);
});
