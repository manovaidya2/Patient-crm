const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const DoseTemplate = require('../models/DoseTemplate');
const { listDoseTemplates, addDoseTemplate } = require('./doseTemplateController');

afterEach(() => mock.restoreAll());
const call = async (handler, body = {}) => {
  let result; let failure;
  await handler({ body, user: { name: 'Doctor' } }, { json(value) { result = value; } }, (error) => { failure = error; });
  if (failure) throw failure;
  return result;
};

test('saved dose instructions are available as reusable options', async () => {
  mock.method(DoseTemplate, 'find', () => ({ sort: () => ({ lean: async () => [{ _id: 'template1', text: 'सुबह ___ चम्मच दवा लें।' }] }) }));
  assert.deepEqual((await call(listDoseTemplates)).templates, [{ id: 'template1', text: 'सुबह ___ चम्मच दवा लें।' }]);
});

test('adding an instruction preserves quantity blanks and reuses the existing text', async () => {
  const text = 'सुबह ___ चम्मच दवा को ---- कप पानी के साथ लें।';
  mock.method(DoseTemplate, 'findOneAndUpdate', async (filter, update, options) => {
    assert.deepEqual(filter, { text });
    assert.equal(update.$setOnInsert.createdByName, 'Doctor');
    assert.equal(options.upsert, true);
    assert.equal(options.runValidators, true);
    return { _id: 'template1', text };
  });
  assert.deepEqual((await call(addDoseTemplate, { text: ` ${text} ` })).template, { id: 'template1', text });
});

test('blank, non-text and oversized instructions are rejected', async () => {
  for (const text of ['', '   ', null, {}, 'a'.repeat(501)]) {
    await assert.rejects(call(addDoseTemplate, { text }), (error) => error.statusCode === 400);
  }
});

test('concurrent duplicate additions return the existing instruction', async () => {
  mock.method(DoseTemplate, 'findOneAndUpdate', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  mock.method(DoseTemplate, 'findOne', async () => ({ _id: 'template1', text: 'Saved instruction' }));
  assert.equal((await call(addDoseTemplate, { text: 'Saved instruction' })).template.id, 'template1');
});
