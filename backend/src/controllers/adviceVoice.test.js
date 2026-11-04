const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AdviceRequest = require('../models/AdviceRequest');
const Patient = require('../models/Patient');
const controller = require('./adviceController');

const doctor = { _id: new mongoose.Types.ObjectId(), name: 'Dr Sharma', role: 'doctor' };
const makeEntry = () => {
  const entry = new AdviceRequest({ patient: new mongoose.Types.ObjectId(), query: 'Child not sleeping', requestedBy: new mongoose.Types.ObjectId() });
  entry.save = async () => entry;
  entry.populate = async () => entry;
  return entry;
};
const run = async (handler, req) => {
  let body = null; let status = 200;
  await handler({ params: { id: 'x' }, body: {}, ...req }, { status(c) { status = c; return this; }, json(b) { body = b; } }, (e) => { throw e; });
  return { body, status };
};
const stub = (entry) => {
  const saved = [[AdviceRequest, 'findById', AdviceRequest.findById], [Patient, 'findById', Patient.findById]];
  AdviceRequest.findById = async () => entry;
  Patient.findById = async () => null;
  return () => saved.forEach(([t, n, old]) => { t[n] = old; });
};

test('the doctor answers with a voice recording alone, or with text; nothing at all is refused', async () => {
  const entry = makeEntry();
  const undo = stub(entry);
  try {
    const empty = await run(controller.respondToAdviceRequest, { user: doctor, body: { advice: '  ' } });
    assert.equal(empty.status, 400);
    const voice = await run(controller.respondToAdviceRequest, { user: doctor, body: { advice: '', voiceSeconds: '42.4' }, file: { filename: 'v1.webm', originalname: 'voice-advice.webm', mimetype: 'audio/webm' } });
    assert.equal(voice.status, 200);
    assert.equal(voice.body.advice.status, 'advice_given');
    assert.deepEqual({ url: voice.body.advice.adviceVoice.url, sec: voice.body.advice.adviceVoice.durationSec }, { url: '/uploads/advice-voice/v1.webm', sec: 42 });
    // Editing: the text can be added while the recording stays.
    const edited = await run(controller.updateAdviceAnswer, { user: doctor, body: { advice: 'Give the night dose at 9 pm' } });
    assert.equal(edited.body.advice.advice, 'Give the night dose at 9 pm');
    assert.equal(edited.body.advice.adviceVoice.url, '/uploads/advice-voice/v1.webm');
    // Removing the recording with no text left is refused.
    entry.advice = '';
    const removeAll = await run(controller.updateAdviceAnswer, { user: doctor, body: { advice: '', removeVoice: 'true' } });
    assert.equal(removeAll.status, 400);
  } finally { undo(); }
});
