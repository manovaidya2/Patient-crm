const { test } = require('node:test');
const assert = require('node:assert/strict');
const controllers = require('./salesSheetController');
const ManagementColumn = require('../models/AppointmentManagementColumn');
const { SALES_FIELDS, RECEPTION_FIELDS, syncFixedColumns } = require('../utils/fixedColumns');

const makeResponse = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
const run = (handler, req) => { const response = makeResponse(); return Promise.resolve(handler({ app: { get: () => null }, body: {}, params: {}, ...req }, response, (error) => { throw error; })).then(() => response); };

test('ManagementColumn: edit all column settings without changing identity', async () => {
  const column = new ManagementColumn({ label: 'Old name', type: 'text', required: false, options: [] });
  const id = String(column._id);
  let saves = 0;
  column.save = async () => { saves++; };
  const original = ManagementColumn.findOne;
  ManagementColumn.findOne = async () => column;
  const response = makeResponse();
  const invoke = (body) => controllers.updateManagementColumn({ params: { id }, body, app: { get: () => null } }, response, (error) => { throw error; });
  try {
    await invoke({ label: 'Status', type: 'select', required: true, options: [' Waiting ', 'Done'], highlightValue: 'Done' });
    assert.equal(column.label, 'Status');
    assert.equal(column.type, 'select');
    assert.equal(column.required, true);
    assert.deepEqual([...column.options], ['Waiting', 'Done']);
    assert.equal(column.highlightValue, 'Done');
    assert.equal(String(column._id), id);
    await invoke({ type: 'multi_select', options: ['Call', 'Message', 'Call'], highlightValue: 'Message' });
    assert.equal(column.type, 'multi_select');
    assert.deepEqual([...column.options], ['Call', 'Message']);
    assert.equal(column.highlightValue, 'Message');
    await invoke({ type: 'checkbox', required: false });
    assert.equal(column.type, 'checkbox');
    assert.equal(column.required, false);
    assert.deepEqual([...column.options], []);
    assert.equal(column.highlightValue, '');
    await invoke({ type: 'invalid' });
    assert.equal(response.statusCode, 400);
    assert.equal(saves, 3);
    await invoke({ options: 'not an array' });
    assert.equal(response.statusCode, 400);
    assert.equal(saves, 3);
  } finally { ManagementColumn.findOne = original; }
});

test('fixed fields: sales columns cannot be added, edited or removed', async () => {
  for (const [handler, params] of [[controllers.createColumn, {}], [controllers.updateColumn, { id: SALES_FIELDS[0].id }], [controllers.deleteColumn, { id: SALES_FIELDS[0].id }]]) {
    const response = await run(handler, { params, body: { label: 'Anything' } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
  }
});

test('fixed fields: reception call confirmation columns are locked, other reception fields stay editable', async () => {
  const fixedId = RECEPTION_FIELDS[0].id;
  assert.equal((await run(controllers.updateManagementColumn, { params: { id: fixedId }, body: { label: 'X' } })).statusCode, 403);
  assert.equal((await run(controllers.deleteManagementColumn, { params: { id: fixedId } })).statusCode, 403);
  assert.equal((await run(controllers.createManagementColumn, { body: { label: 'New', section: 'confirmation' } })).statusCode, 403);
});

test('fixed fields: the list is unique, valid and keeps the existing ids', () => {
  const all = [...SALES_FIELDS, ...RECEPTION_FIELDS];
  assert.equal(new Set(all.map((item) => item.id)).size, all.length);
  for (const item of all) {
    assert.match(item.id, /^[a-f0-9]{24}$/);
    assert.ok(['details', 'confirmation', 'payments'].includes(item.section));
    if (['select', 'multi_select'].includes(item.type)) assert.ok(item.options.length > 0, `${item.label} needs options`);
  }
  const byLabel = Object.fromEntries(SALES_FIELDS.map((item) => [item.label, item]));
  assert.equal(byLabel['Patient Name'].required, true);
  assert.equal(byLabel['Patient Name'].id, '6ab7b2adbf916b34dfd9f5f7');
  assert.deepEqual(byLabel['Case Category'].options, ['Autism', 'ADHD', 'Autism + ADHD', 'Mental Health', 'Other']);
  assert.equal(byLabel['Previous Reports Available'].type, 'checkbox');
  assert.equal(RECEPTION_FIELDS.filter((item) => item.section === 'confirmation').length, 3);
});

test('fixed fields: sync writes every fixed field to its own id and nothing else', async () => {
  const calls = [];
  const fakeModel = (name) => ({ collection: { updateOne: async (filter, update, options) => { calls.push({ name, id: String(filter._id), set: update.$set, upsert: options.upsert }); } } });
  await syncFixedColumns({ SalesColumn: fakeModel('sales'), ManagementColumn: fakeModel('management') });
  assert.equal(calls.filter((call) => call.name === 'sales').length, SALES_FIELDS.length);
  assert.equal(calls.filter((call) => call.name === 'management').length, RECEPTION_FIELDS.length);
  assert.ok(calls.every((call) => call.upsert === true && call.set.isActive === true));
  const patient = calls.find((call) => call.id === '6ab7b2adbf916b34dfd9f5f7');
  assert.equal(patient.set.label, 'Patient Name');
  assert.equal(patient.set.required, true);
});
