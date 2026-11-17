const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { writeRecordDocumentsPdf } = require('./recordDocumentsPdf');
const { optimizeRecordRoomImages } = require('../middleware/fileUploads');

test('Record Room combines images and all uploaded PDF pages in order, then rebuilds after removal', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'record-pdf-test-'));
  const paths = ['scan.jpg', 'report.pdf', 'combined.pdf'].map((name) => path.join(directory, name));
  t.after(async () => { await Promise.all(paths.map((p) => fs.promises.unlink(p).catch(() => {}))); await fs.promises.rmdir(directory); });
  await sharp({ create: { width: 20, height: 30, channels: 3, background: 'white' } }).jpeg().toFile(paths[0]);
  const report = await PDFDocument.create();
  report.addPage([200, 300]); report.addPage([400, 500]);
  await fs.promises.writeFile(paths[1], await report.save());
  const image = { filePath: paths[0], uploadedByName: 'Reception' };
  const pdf = { filePath: paths[1] };
  assert.equal(await writeRecordDocumentsPdf({ filePath: paths[2], documents: [image, pdf, image] }), 4);
  let combined = await PDFDocument.load(await fs.promises.readFile(paths[2]));
  assert.equal(combined.getPageCount(), 4);
  assert.equal(combined.getPage(1).getWidth(), 200);
  assert.equal(combined.getPage(2).getWidth(), 400);
  assert.equal(await writeRecordDocumentsPdf({ filePath: paths[2], documents: [pdf] }), 2);
  combined = await PDFDocument.load(await fs.promises.readFile(paths[2]));
  assert.equal(combined.getPageCount(), 2);
  const before = await fs.promises.readFile(paths[2]);
  await fs.promises.writeFile(paths[1], 'invalid PDF');
  await assert.rejects(writeRecordDocumentsPdf({ filePath: paths[2], documents: [pdf] }), /valid PDF/);
  assert.deepEqual(await fs.promises.readFile(paths[2]), before, 'failed PDF upload preserves the previous combined PDF');
});

test('Record Room optimizer leaves uploaded PDF bytes and metadata intact', async () => {
  const file = { filename: 'report.pdf', originalname: 'Patient report.pdf', mimetype: 'application/pdf', path: 'not-an-image.pdf' };
  const req = { files: [file] };
  let error;
  await optimizeRecordRoomImages(req, {}, (err) => { error = err; });
  assert.equal(error, undefined);
  assert.deepEqual(req.files, [file]);
});
