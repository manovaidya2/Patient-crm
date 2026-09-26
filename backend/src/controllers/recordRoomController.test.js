const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const RecordRoom = require('../models/RecordRoom');
const controller = require('./recordRoomController');

const originalFind = RecordRoom.findById;
afterEach(() => { RecordRoom.findById = originalFind; });

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
