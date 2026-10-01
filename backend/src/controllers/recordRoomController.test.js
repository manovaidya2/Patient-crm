const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const RecordRoom = require('../models/RecordRoom');
const controller = require('./recordRoomController');

const originalFind = RecordRoom.findById;
const originalCreate = RecordRoom.create;
afterEach(() => { RecordRoom.findById = originalFind; });
afterEach(() => { RecordRoom.create = originalCreate; });

async function request(handler, body, record) {
  let saved = false;
  record.save = async () => { saved = true; };
  RecordRoom.findById = async () => record;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } };
  await handler({ body, params: { id: String(record._id), issueId: String(record.issueHistory[0]?._id) }, user: { name: 'Receptionist' } }, response, (error) => { throw error; });
  return { response, saved };
}

function record() {
  return new RecordRoom({ patientName: 'Test Patient', issueHistory: [{ paperName: 'Blood report', givenTo: 'Doctor', reason: 'Review' }] });
}

test('patient paper cannot be issued again while any issue is pending', async () => {
  const result = await request(controller.issue, { paperName: ' BLOOD REPORT ', givenTo: 'Another doctor', reason: 'Review' }, record());
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.saved, false);
});

test('patient paper can be issued again after collection without a paper name', async () => {
  const patient = record();
  patient.issueHistory[0].returnedAt = new Date();
  const result = await request(controller.issue, { givenTo: 'Doctor', reason: 'Review' }, patient);
  assert.equal(result.response.statusCode, 200);
  assert.equal(patient.issueHistory.length, 2);
  assert.equal(patient.issueHistory[1].issuedByName, 'Receptionist');
  assert.ok(patient.issueHistory[1].issuedAt instanceof Date);
});

test('issue requires a reason', async () => {
  const result = await request(controller.issue, { givenTo: 'Doctor' }, record());
  assert.equal(result.response.statusCode, 400);
  assert.equal(result.saved, false);
});

test('problem return requires a description and does not mark collection', async () => {
  const patient = record();
  const result = await request(controller.collect, { returnCondition: 'problem', problemDetails: ' ' }, patient);
  assert.equal(result.response.statusCode, 400);
  assert.equal(patient.issueHistory[0].returnedAt, null);
  assert.equal(result.saved, false);
});

test('collection preserves condition, problem, notes, collector and timestamp', async () => {
  const patient = record();
  const result = await request(controller.collect, { returnCondition: 'problem', problemDetails: 'Torn page', notes: 'Doctor informed' }, patient);
  assert.equal(result.saved, true);
  const entry = result.response.data.record.issueHistory[0];
  assert.equal(entry.returnCondition, 'problem');
  assert.equal(entry.problemDetails, 'Torn page');
  assert.equal(entry.returnNotes, 'Doctor informed');
  assert.equal(entry.returnedByName, 'Receptionist');
  assert.ok(entry.returnedAt instanceof Date);
});

test('a repeated collection cannot overwrite the original history', async () => {
  const patient = record();
  const originalDate = new Date('2026-09-25T10:00:00Z');
  patient.issueHistory[0].returnedAt = originalDate;
  const result = await request(controller.collect, { returnCondition: 'intact' }, patient);
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.saved, false);
  assert.deepEqual(patient.issueHistory[0].returnedAt, originalDate);
});

test('create stores shelf and file numbers', async () => {
  RecordRoom.create = async (values) => new RecordRoom(values);
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } };
  await controller.create({ body: { patientName: 'Test Patient', shelfNumber: ' S-2 ', fileNumber: ' F-14 ' }, user: { name: 'Admin' } }, response, (error) => { throw error; });
  assert.equal(response.statusCode, 201);
  assert.equal(response.data.record.shelfNumber, 'S-2');
  assert.equal(response.data.record.fileNumber, 'F-14');
});

test('first receipt is stored separately and survives paper return and unrelated edits', async () => {
  const patient = record();
  const firstReceivedAt = '2026-01-01T10:00:00.000Z';
  const result = await request(controller.update, { patientName: 'Test Patient', firstReceivedAt }, patient);
  assert.equal(result.response.data.record.firstReceivedAt.toISOString(), firstReceivedAt);
  await request(controller.collect, { returnCondition: 'intact' }, patient);
  await request(controller.update, { patientName: 'Test Patient' }, patient);
  assert.equal(patient.firstReceivedAt.toISOString(), firstReceivedAt);
});

test('invalid or future receipt dates are rejected; legacy records have no invented date', async () => {
  assert.equal(record().firstReceivedAt, null);
  for (const firstReceivedAt of ['invalid', '2999-01-01T00:00:00Z']) {
    const result = await request(controller.update, { patientName: 'Test Patient', firstReceivedAt }, record());
    assert.equal(result.response.statusCode, 400);
    assert.equal(result.saved, false);
  }
});

test('editing record location preserves documents and movement history', async () => {
  const patient = record();
  patient.issueHistory[0].returnedAt = new Date();
  patient.documents.push({ url: '/uploads/records/test.jpg', fileName: 'test.jpg' });
  patient.pdfUrl = '/uploads/records/test.pdf';
  const result = await request(controller.update, { patientName: 'Updated Patient', shelfNumber: 'S-3', fileNumber: 'F-5' }, patient);
  assert.equal(result.saved, true);
  assert.equal(result.response.data.record.patientName, 'Updated Patient');
  assert.equal(result.response.data.record.shelfNumber, 'S-3');
  assert.equal(result.response.data.record.fileNumber, 'F-5');
  assert.equal(result.response.data.record.documents.length, 1);
  assert.equal(result.response.data.record.issueHistory.length, 1);
  assert.match(result.response.data.record.pdfName, /Updated Patient/);
});

test('delete refuses records with unreturned paper', async () => {
  const patient = record();
  let deleted = false;
  patient.deleteOne = async () => { deleted = true; };
  const result = await request(controller.remove, {}, patient);
  assert.equal(result.response.statusCode, 409);
  assert.equal(deleted, false);
});

test('delete removes records whose paper has been returned', async () => {
  const patient = record();
  patient.issueHistory[0].returnedAt = new Date();
  let deleted = false;
  patient.deleteOne = async () => { deleted = true; };
  const result = await request(controller.remove, {}, patient);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.data.success, true);
  assert.equal(deleted, true);
});
