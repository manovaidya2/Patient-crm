const { test } = require('node:test');
const assert = require('node:assert/strict');
const controllers = require('./salesSheetController');
const SalesColumn = require('../models/SalesSheetColumn');
const ManagementColumn = require('../models/AppointmentManagementColumn');

for (const [Model, handler] of [[SalesColumn, controllers.updateColumn], [ManagementColumn, controllers.updateManagementColumn]]) {
  test(`${Model.modelName}: edit all column settings without changing identity`, async () => {
    const column = new Model({ label: 'Old name', type: 'text', required: false, options: [] });
    const id = String(column._id);
    let saves = 0;
    column.save = async () => { saves++; };
    const original = Model.findOne;
    Model.findOne = async () => column;
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    const invoke = (body) => handler({ params: { id }, body, app: { get: () => null } }, response, (error) => { throw error; });
    try {
      await invoke({ label: 'Status', type: 'select', required: true, options: [' Waiting ', 'Done'], highlightValue: 'Done' });
      assert.equal(column.label, 'Status');
      assert.equal(column.type, 'select');
      assert.equal(column.required, true);
      assert.deepEqual([...column.options], ['Waiting', 'Done']);
      if (Model === ManagementColumn) assert.equal(column.highlightValue, 'Done');
      assert.equal(String(column._id), id);
      await invoke({ type: 'checkbox', required: false });
      assert.equal(column.type, 'checkbox');
      assert.equal(column.required, false);
      assert.deepEqual([...column.options], []);
      if (Model === ManagementColumn) assert.equal(column.highlightValue, '');
      await invoke({ type: 'invalid' });
      assert.equal(response.statusCode, 400);
      assert.equal(saves, 2);
      await invoke({ options: 'not an array' });
      assert.equal(response.statusCode, 400);
      assert.equal(saves, 2);
    } finally { Model.findOne = original; }
  });
}
