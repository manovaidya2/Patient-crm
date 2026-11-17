const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const RecordRoom = require('../models/RecordRoom');
const controller = require('./recordRoomController');

afterEach(() => mock.restoreAll());
const directory = path.resolve(__dirname, '../../uploads/records');
const diskPath = (url) => path.join(directory, path.basename(url));
const makePdf = async (target, count) => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < count; i++) pdf.addPage([200 + i, 300]);
  await fs.promises.writeFile(target, await pdf.save());
};
async function setup(t) {
  await fs.promises.mkdir(directory, { recursive: true });
  const prefix = `replace-test-${randomUUID()}`;
  const record = new RecordRoom({ patientName: 'Test patient', documents: [
    { url: `/uploads/records/${prefix}-old.pdf`, fileName: 'Wrong paper.pdf', uploadedByName: 'Reception' },
    { url: `/uploads/records/${prefix}-other.pdf`, fileName: 'Other paper.pdf' },
  ], pdfUrl: `/uploads/records/${prefix}-combined.pdf`, pdfName: 'Previous record.pdf', pdfPageCount: 3, pdfUpdatedAt: new Date('2026-11-01T00:00:00Z') });
  const replacementPath = path.join(directory, `${prefix}-new.pdf`);
  t.after(async () => {
    const files = (await fs.promises.readdir(directory)).filter((name) => name.startsWith(prefix) || name.startsWith(`record-room-${record._id}`));
    await Promise.all(files.map((name) => fs.promises.unlink(path.join(directory, name)).catch(() => {})));
  });
  await makePdf(diskPath(record.documents[0].url), 2);
  await makePdf(diskPath(record.documents[1].url), 1);
  await makePdf(diskPath(record.pdfUrl), 3);
  await makePdf(replacementPath, 3);
  record.save = async () => record;
  mock.method(RecordRoom, 'findById', async () => record);
  const file = { path: replacementPath, filename: path.basename(replacementPath), originalname: 'Correct paper.pdf', mimetype: 'application/pdf' };
  return { record, file };
}
async function replace(record, files, documentId = String(record.documents[0]._id), all = false) {
  let result; let error;
  let status = 200;
  await (all ? controller.replaceAllDocuments : controller.replaceDocument)({ params: { id: String(record._id), documentId }, files, user: { name: 'Prachi', role: 'receptionist' } }, { status(code) { status = code; return this; }, json(value) { result = value; } }, (err) => { error = err; });
  return { result, status, error };
}

test('Reception replaces a paper in place, updates PDF pages and preserves the other document', async (t) => {
  const { record, file } = await setup(t);
  const previousUrl = record.documents[0].url;
  const previousPdf = record.pdfUrl;
  const previousId = String(record.documents[0]._id);
  const other = record.documents[1].toObject();
  const { result, error } = await replace(record, [file]);
  assert.equal(error, undefined);
  assert.equal(result.success, true);
  assert.equal(record.documents.length, 2);
  assert.equal(String(record.documents[0]._id), previousId);
  assert.equal(record.documents[0].fileName, 'Correct paper.pdf');
  assert.equal(record.documents[0].uploadedByName, 'Prachi');
  assert.deepEqual(record.documents[1].toObject(), other);
  assert.equal(record.pdfPageCount, 4);
  assert.equal((await PDFDocument.load(await fs.promises.readFile(diskPath(record.pdfUrl)))).getPageCount(), 4);
  await assert.rejects(fs.promises.access(diskPath(previousUrl)));
  await assert.rejects(fs.promises.access(diskPath(previousPdf)));
});

for (const failure of ['invalid PDF', 'save failure']) {
  test(`failed paper replacement (${failure}) preserves the previous document and combined PDF`, async (t) => {
    const { record, file } = await setup(t);
    const before = record.documents[0].toObject();
    const oldPdfUrl = record.pdfUrl;
    const oldPdfBytes = await fs.promises.readFile(diskPath(oldPdfUrl));
    if (failure === 'invalid PDF') await fs.promises.writeFile(file.path, 'not a PDF');
    else record.save = async () => { throw new Error('Save failed'); };
    const { error } = await replace(record, [file]);
    assert.ok(error);
    assert.deepEqual(record.documents[0].toObject(), before);
    assert.equal(record.pdfUrl, oldPdfUrl);
    assert.equal(record.pdfPageCount, 3);
    assert.deepEqual(await fs.promises.readFile(diskPath(oldPdfUrl)), oldPdfBytes);
    await fs.promises.access(diskPath(before.url));
    await assert.rejects(fs.promises.access(file.path));
  });
}

test('missing document and empty replacement return clear errors without changing the record', async (t) => {
  const { record, file } = await setup(t);
  const original = record.documents[0].url;
  assert.equal((await replace(record, [file], 'missing')).status, 404);
  await assert.rejects(fs.promises.access(file.path));
  assert.equal((await replace(record, [])).status, 400);
  assert.equal(record.documents[0].url, original);
});

test('bulk replacement uses only the new image/PDF set and removes all previous papers after saving', async (t) => {
  const { record, file } = await setup(t);
  const oldUrls = [...record.documents.map((document) => document.url), record.pdfUrl];
  const imagePath = file.path.replace('-new.pdf', '-new-image.jpg');
  await sharp({ create: { width: 20, height: 30, channels: 3, background: 'white' } }).jpeg().toFile(imagePath);
  const image = { path: imagePath, filename: path.basename(imagePath), originalname: 'New image.jpg', mimetype: 'image/jpeg' };
  const { result, error } = await replace(record, [file, image], undefined, true);
  assert.equal(error, undefined);
  assert.equal(result.success, true);
  assert.deepEqual(record.documents.map((document) => document.fileName), ['Correct paper.pdf', 'New image.jpg']);
  assert.equal(record.pdfPageCount, 4);
  const pdf = await PDFDocument.load(await fs.promises.readFile(diskPath(record.pdfUrl)));
  assert.equal(pdf.getPageCount(), 4);
  assert.equal(pdf.getPage(0).getWidth(), 200);
  assert.equal(pdf.getPage(2).getWidth(), 202);
  for (const url of oldUrls) await assert.rejects(fs.promises.access(diskPath(url)));
  await fs.promises.access(file.path);
  await fs.promises.access(imagePath);
});

for (const failure of ['one invalid PDF', 'save failure']) {
  test(`bulk replacement (${failure}) preserves the entire old set and cleans all new uploads`, async (t) => {
    const { record, file } = await setup(t);
    const oldDocuments = record.documents.map((document) => document.toObject());
    const oldPdfUrl = record.pdfUrl;
    const before = await fs.promises.readFile(diskPath(oldPdfUrl));
    const secondPath = file.path.replace('-new.pdf', '-new-second.pdf');
    if (failure === 'one invalid PDF') await fs.promises.writeFile(secondPath, 'invalid');
    else { await makePdf(secondPath, 2); record.save = async () => { throw new Error('Save failed'); }; }
    const second = { ...file, path: secondPath, filename: path.basename(secondPath) };
    const { error } = await replace(record, [file, second], undefined, true);
    assert.ok(error);
    assert.deepEqual(record.documents.map((document) => document.toObject()), oldDocuments);
    assert.equal(record.pdfUrl, oldPdfUrl);
    assert.deepEqual(await fs.promises.readFile(diskPath(oldPdfUrl)), before);
    for (const document of oldDocuments) await fs.promises.access(diskPath(document.url));
    for (const upload of [file, second]) await assert.rejects(fs.promises.access(upload.path));
  });
}

test('bulk replacement refuses an empty set without removing any papers', async (t) => {
  const { record } = await setup(t);
  const old = record.documents.map((document) => document.url);
  assert.equal((await replace(record, [], undefined, true)).status, 400);
  assert.deepEqual(record.documents.map((document) => document.url), old);
});
