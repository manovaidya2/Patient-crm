const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const StockItem = require('../models/StockItem');
const controller = require('./stockController');
const { stockCodes, stockCodeMap } = require('../utils/stockCodes');

afterEach(() => mock.restoreAll());
const run = async (handler, item, body) => {
  let result; let failure;
  await handler({ params: { id: String(item._id) }, body, user: { name: 'Doctor', role: 'doctor' } }, { status() { return this; }, json(value) { result = value; } }, (error) => { failure = error; });
  if (failure) throw failure;
  return result;
};
const setup = () => {
  const item = new StockItem({ code: 'OLD-CODE', name: 'Old name', kind: 'component', unit: 'spoon', currentStock: 120 });
  let saves = 0;
  item.save = async () => { saves++; return item; };
  mock.method(StockItem, 'findById', async () => item);
  mock.method(StockItem, 'exists', async () => false);
  return { item, saves: () => saves };
};

test('stock edit saves Code, Unit and all other details while retaining historical code links', async () => {
  const { item, saves } = setup();
  const result = await run(controller.updateStock, item, { code: ' new-code ', unit: 'g', name: 'New name', nameHindi: 'Hindi name', kind: 'medicine', minLevel: 15, batchNo: 'B2', expiryDate: '2027-01-01', gramsPerSpoon: 4, dropsPerMl: 20, notes: 'Corrected', isActive: false });
  assert.equal(result.item.code, 'NEW-CODE');
  assert.equal(result.item.unit, 'g');
  assert.equal(result.item.currentStock, 120);
  assert.equal(result.item.name, 'New name');
  assert.equal(result.item.nameHindi, 'Hindi name');
  assert.equal(result.item.kind, 'medicine');
  assert.equal(result.item.minLevel, 15);
  assert.equal(result.item.batchNo, 'B2');
  assert.ok(result.item.expiryDate);
  assert.equal(result.item.gramsPerSpoon, 4);
  assert.equal(result.item.dropsPerMl, 20);
  assert.equal(result.item.notes, 'Corrected');
  assert.equal(result.item.isActive, false);
  assert.deepEqual([...result.item.codeAliases], ['OLD-CODE']);
  assert.equal(stockCodeMap([item]).get('OLD-CODE'), item);
  assert.equal(saves(), 1);
  await run(controller.updateStock, item, { code: 'OLD-CODE' });
  assert.deepEqual(stockCodes(item), ['OLD-CODE', 'NEW-CODE']);
});

test('stock edits reject duplicate/reserved codes and invalid units without saving', async () => {
  const { item, saves } = setup();
  StockItem.exists.mock.mockImplementation(async () => true);
  await assert.rejects(run(controller.updateStock, item, { code: 'RESERVED' }), (error) => error.statusCode === 409);
  assert.equal(item.code, 'OLD-CODE');
  for (const body of [{ code: ' ' }, { unit: 'invalid' }, { name: ' ' }]) await assert.rejects(run(controller.updateStock, item, body));
  await assert.rejects(run(controller.createStock, item, { code: 'RESERVED', name: 'New item', unit: 'g' }), /already exists/);
  assert.equal(saves(), 0);
});
