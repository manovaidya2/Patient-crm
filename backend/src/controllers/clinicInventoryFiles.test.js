const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Model = require('../models/ClinicInventory');
const { detectType, upload, view } = require('./clinicInventoryFiles');
test('recognizes supported file signatures, not just a renamed extension', () => {
  assert.equal(detectType(Buffer.from('%PDF-1.7')).mime, 'application/pdf');
  assert.equal(detectType(Buffer.from([255, 216, 255, 0])).mime, 'image/jpeg');
  assert.equal(detectType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])).mime, 'image/png');
  assert.equal(detectType(Buffer.from('<html>not a PDF</html>')), null);
  assert.equal(detectType(Buffer.alloc(0)), null);
});
test('upload keeps stock intact, uses safe filenames and cleans up on save conflict', async () => {
  const original = { find: Model.findOne, mkdir: fs.mkdir, write: fs.writeFile, unlink: fs.unlink };
  const paths = []; const removed = [];
  const item = { currentStock: 25, save: async () => {} };
  Model.findOne = async (filter) => { assert.equal(filter.deletedAt, null); return item; };
  fs.mkdir = async () => {}; fs.writeFile = async (file) => paths.push(file); fs.unlink = async (file) => removed.push(file);
  const request = { params: { id: 'item' }, user: { name: 'Reception' }, file: { originalname: '../../template.html', buffer: Buffer.from('%PDF-1.7') } };
  const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  try {
    await upload(request, response, (error) => { throw error; });
    assert.equal(response.code, 201);
    assert.equal(item.currentStock, 25);
    assert.match(item.softCopy.filename, /^[a-f0-9-]+\.pdf$/);
    assert.equal(item.softCopy.uploadedByName, 'Reception');
    assert.ok(item.softCopy.uploadedAt instanceof Date);
    item.save = async () => { const error = new Error('Conflict'); error.name = 'VersionError'; throw error; };
    await assert.rejects(upload(request, response, (error) => { throw error; }), { statusCode: 409 });
    assert.equal(removed[0], paths[1]);
  } finally { Model.findOne = original.find; fs.mkdir = original.mkdir; fs.writeFile = original.write; fs.unlink = original.unlink; }
});
test('missing soft copies are not served', async () => {
  const original = Model.findOne;
  Model.findOne = () => ({ select: async () => null });
  const response = { status(code) { this.code = code; return this; }, json() {} };
  try { await view({ params: { id: 'missing' } }, response, (error) => { throw error; }); assert.equal(response.code, 404); }
  finally { Model.findOne = original; }
});
