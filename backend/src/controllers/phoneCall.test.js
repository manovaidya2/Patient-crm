// Calls from the staff phones: one webhook for every phone; only a patient's number is kept (with its recording);
// any other call is dropped at once. The database is mocked; the recording files are real temp files.
const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const PhoneCall = require('../models/PhoneCall');
const PhoneCallDevice = require('../models/PhoneCallDevice');
const Patient = require('../models/Patient');
const Management = require('../models/AppointmentManagementEntry');
const PackageNotBought = require('../models/PackageNotBoughtPatient');
const P = require('../utils/phoneCalls');
const c = require('./phoneCallController');

afterEach(() => mock.restoreAll());
const id = () => new mongoose.Types.ObjectId();
const chain = (value) => ({ select() { return this; }, limit() { return this; }, sort() { return this; }, lean: async () => value });
const call = async (handler, req) => {
  let body = null; let status = 200; let error = null;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; }, set() { return this; } };
  await handler({ app: { get: () => null }, headers: {}, query: {}, params: {}, body: {}, ...req }, res, (e) => { error = e; });
  return { body, status, error };
};
const AMR = Buffer.concat([Buffer.from('#!AMR\n'), Buffer.alloc(40, 1)]);
const tempFile = (content) => {
  const file = path.join(os.tmpdir(), `call-test-${Date.now()}-${Math.random().toString(16).slice(2)}.part`);
  fs.writeFileSync(file, content);
  return { fieldname: 'recording', originalname: '7004450064-voicecall-20261123101945039.amr', path: file, size: content.length };
};
// The fields the call app sends (as in its webhook test).
const fields = { callId: '481ea61c-c142-41f9-b7c1-fc178bd5515e-1795409377714', deviceId: '481ea61c-c142-41f9-b7c1-fc178bd5515e', direction: 'outgoing', durationSec: '10', phoneNumber: '7004450064', startedAt: '2026-11-23T04:49:37.714Z', userName: 'Sachin', userPhone: '' };
const noMatches = () => {
  mock.method(Patient, 'find', () => chain([]));
  mock.method(Management, 'find', () => chain([]));
  mock.method(PackageNotBought, 'find', () => chain([]));
};

test('the call app fields, any spelling; the number by its last 10 digits; direction, duration and time', () => {
  const f = P.fieldsOf(fields);
  assert.deepEqual([f.callId, f.deviceId, f.directionRaw, f.durationRaw, f.phoneNumber, f.userName], [fields.callId, fields.deviceId, 'outgoing', '10', '7004450064', 'Sachin']);
  assert.equal(P.fieldsOf({ Call_ID: 'x1', phone_number: '+91 70044-50064', user_name: 'Riya' }).phoneNumber, '+91 70044-50064');
  assert.equal(P.phoneTail('+91 70044-50064'), '7004450064');
  assert.equal(P.phoneTail('07004450064'), '7004450064');
  assert.equal(P.phoneTail('121'), '', 'a service number matches nothing');
  assert.ok(P.tailPattern('7004450064').test('+91 70044-50064'));
  assert.ok(!P.tailPattern('7004450064').test('70044500641'));
  assert.deepEqual(['outgoing', 'INCOMING', 'missed', 'Missed incoming', 'rejected', '1', ''].map(P.directionOf), ['outgoing', 'incoming', 'missed', 'missed', 'rejected', 'unknown', 'unknown']);
  assert.deepEqual(['10', 10, '2:05', '0:02:05', '', 'abc', -5, 999999].map(P.durationOf), [10, 10, 125, 125, 0, 0, 0, 86400]);
  const now = new Date('2026-11-23T05:00:00Z');
  assert.equal(P.startedAtOf('2026-11-23T04:49:37.714Z', now).toISOString(), '2026-11-23T04:49:37.714Z');
  assert.equal(P.startedAtOf('1795409377714', now)?.getTime(), 1795409377714);
  assert.equal(P.startedAtOf('2027-01-01T00:00:00Z', now), null, 'far in the future: not trusted');
  assert.equal(P.startedAtOf('not a date', now), null);
});

test('the recording must really be audio (by its first bytes)', () => {
  assert.equal(P.audioTypeOf(AMR), 'amr');
  assert.equal(P.audioTypeOf(Buffer.from('\0\0\0\x1cftypM4A \0\0\0\0', 'latin1')), 'm4a');
  assert.equal(P.audioTypeOf(Buffer.from('\0\0\0\x1cftyp3gp4\0\0\0\0', 'latin1')), '3gp');
  assert.equal(P.audioTypeOf(Buffer.from('ID3\x04\0\0\0\0\0\0\0\0', 'latin1')), 'mp3');
  assert.equal(P.audioTypeOf(Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1')), 'wav');
  assert.equal(P.audioTypeOf(Buffer.from('<html><script>alert(1)</script>')), '');
  assert.ok(!P.PLAYS_AS_IS.includes('amr'), 'an .amr does not play in a browser: it is always compressed to WebM');
});

test('whose number: every number of a patient, a registration (father / mother / WhatsApp) and Package Not Bought - one entry per person', () => {
  const tail = '7004450064';
  const patientA = id(); const patientB = id(); const nb = id(); const visit1 = id(); const visit2 = id();
  const matches = P.buildMatches({
    tail,
    patients: [
      { _id: patientA, patientName: 'Aarav', patientCode: 'A-201126-11', number: '+91 7004450064', alternateNumber: '9999999999', whatsappNumber: '7004450064' },
      { _id: patientB, patientName: 'Anaya', patientCode: 'A-101126-12', number: '1111111111', alternateNumber: '07004450064' },
    ],
    visits: [
      // converted: the same person as patient A (father's number)
      { _id: visit1, values: { code: 'A-201126-11' }, registration: { fields: { patientName: 'Aarav', fatherNumber: '7004450064' } }, postCounseling: { outcome: { kind: 'converted', patient: patientA } } },
      // did not buy: the same person as the Package Not Bought record
      { _id: visit2, values: { code: 'K-221126-13' }, registration: { fields: { patientName: 'Kabir', motherNumber: '7004450064' } }, postCounseling: { outcome: { kind: 'not_purchased', packageNotBought: nb } } },
    ],
    notBought: [{ _id: nb, patientName: 'Kabir', patientId: 'K-221126-13', fatherNumber: '', motherNumber: '7004450064' }],
    visitCodeOf: (v) => v.values.code,
  });
  assert.deepEqual(matches.map((m) => [m.kind, m.name, m.code, m.label]), [
    ['patient', 'Aarav', 'A-201126-11', "Mobile, WhatsApp, Father's mobile"],
    ['patient', 'Anaya', 'A-101126-12', 'Alternate mobile'],
    ['not_bought', 'Kabir', 'K-221126-13', "Mother's mobile"],
  ]);
  assert.deepEqual(P.buildMatches({ tail, patients: [{ _id: id(), patientName: 'X', number: '9876543210' }] }), []);
});

test('webhook key: one key for every phone; a wrong or missing key is refused before anything is saved', async () => {
  const before = process.env.CALL_APP_WEBHOOK_SECRET;
  process.env.CALL_APP_WEBHOOK_SECRET = 'phone-key-123';
  try {
    let passed = false;
    const run = (req) => call((rq, rs, next) => c.verifySecret(rq, rs, () => { passed = true; next(); }), req);
    assert.equal((await run({ query: {} })).status, 401);
    assert.equal((await run({ query: { key: 'wrong' } })).status, 401);
    assert.equal(passed, false);
    await run({ query: { key: 'phone-key-123' } });
    assert.equal(passed, true);
    passed = false;
    await run({ headers: { 'x-webhook-secret': 'phone-key-123' } });
    assert.equal(passed, true);
  } finally { if (before === undefined) delete process.env.CALL_APP_WEBHOOK_SECRET; else process.env.CALL_APP_WEBHOOK_SECRET = before; }
});

test('a call with a number that is not a patient\'s: nothing is kept, the recording is deleted at once', async () => {
  noMatches();
  const create = mock.method(PhoneCall, 'create', async () => assert.fail('not saved'));
  const devices = [];
  mock.method(PhoneCallDevice, 'findOneAndUpdate', async (q, u) => { devices.push([q.key, u.$inc, u.$set.userName]); });
  const file = tempFile(AMR);
  const out = await call(c.receive, { body: fields, files: [file] });
  assert.equal(out.error, null);
  assert.deepEqual([out.body.saved, /not a patient number/.test(out.body.reason)], [false, true]);
  assert.equal(fs.existsSync(file.path), false, 'the recording is deleted');
  assert.equal(create.mock.callCount(), 0);
  assert.deepEqual(devices, [[`device:${fields.deviceId}`, { received: 1, ignored: 1 }, 'Sachin']], 'only the phone\'s counts');
});

test('a patient\'s call is kept with its recording (moved to its month folder); the same call sent again is kept once', async () => {
  const patient = id();
  mock.method(Patient, 'find', () => chain([{ _id: patient, patientName: 'Aarav', patientCode: 'A-201126-11', number: '7004450064' }]));
  mock.method(Management, 'find', () => chain([]));
  mock.method(PackageNotBought, 'find', () => chain([]));
  mock.method(PhoneCall, 'findOne', () => chain(null));
  mock.method(PhoneCall, 'findById', () => chain(null));
  mock.method(PhoneCallDevice, 'findOneAndUpdate', async () => null);
  const moved = [];
  mock.method(fs.promises, 'mkdir', async () => {});
  mock.method(fs.promises, 'rename', async (from, to) => { moved.push(to); });
  let saved = null;
  mock.method(PhoneCall, 'create', async (data) => { saved = data; return { _id: id(), ...data }; });
  const emitted = [];
  const app = { get: () => ({ to: (room) => ({ emit: (event) => emitted.push([room, event]) }) }) };
  const file = tempFile(AMR);
  try {
    const out = await call(c.receive, { app, body: fields, files: [file] });
    assert.equal(out.error, null);
    assert.deepEqual([out.status, out.body.saved, out.body.matched], [201, true, 1]);
    assert.deepEqual([saved.callId, saved.userName, saved.direction, saved.durationSec, saved.phoneTail, saved.startedAt.toISOString()], [fields.callId, 'Sachin', 'outgoing', 10, '7004450064', '2026-11-23T04:49:37.714Z']);
    assert.deepEqual(saved.matches.map((m) => [m.kind, m.name, m.label]), [['patient', 'Aarav', 'Mobile']]);
    assert.deepEqual(saved.patients, [patient]);
    assert.equal(saved.recording.type, 'amr');
    assert.match(saved.recording.file, /^2026-11\/\d+-[0-9a-f]+\.amr$/);
    assert.match(moved[0], /call-recordings[\\/]2026-11[\\/]/);
    assert.deepEqual(emitted, [['enquiry:admins', 'phone-calls:changed']]);
  } finally { fs.rmSync(file.path, { force: true }); }

  // Sent again (the app retried): not saved twice, the second recording is dropped.
  mock.method(PhoneCall, 'findOne', () => chain({ _id: id(), recording: { file: '2026-11/x.amr' } }));
  const again = tempFile(AMR);
  const out = await call(c.receive, { body: fields, files: [again] });
  assert.deepEqual([out.body.saved, out.body.duplicate], [true, true]);
  assert.equal(fs.existsSync(again.path), false);
});

test('a file that is not audio is not kept (the call is, with a note)', async () => {
  mock.method(Patient, 'find', () => chain([{ _id: id(), patientName: 'Aarav', number: '7004450064' }]));
  mock.method(Management, 'find', () => chain([]));
  mock.method(PackageNotBought, 'find', () => chain([]));
  mock.method(PhoneCall, 'findOne', () => chain(null));
  mock.method(PhoneCallDevice, 'findOneAndUpdate', async () => null);
  let saved = null;
  mock.method(PhoneCall, 'create', async (data) => { saved = data; return { _id: id(), ...data }; });
  const file = tempFile(Buffer.from('<html><script>alert(1)</script></html>'));
  const out = await call(c.receive, { body: { ...fields, callId: 'other-1' }, files: [file] });
  assert.equal(out.status, 201);
  assert.equal(saved.recording.file, undefined);
  assert.match(saved.recording.error, /not an audio recording/);
  assert.equal(fs.existsSync(file.path), false);
});

// A real (short) WAV recording: 2 seconds of a tone, 16 kHz mono.
const wav = (seconds = 2, rate = 16000) => {
  const samples = seconds * rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
};

test('the recording is kept compressed: one WebM (Opus) file replaces what the phone sent', async () => {
  const sub = `zz-test-${Date.now()}`;
  const folder = path.join(c.DIR, sub);
  fs.mkdirSync(folder, { recursive: true });
  try {
    const original = wav();
    fs.writeFileSync(path.join(folder, 'call.wav'), original);
    const callId = id();
    mock.method(PhoneCall, 'findById', () => chain({ _id: callId, recording: { file: `${sub}/call.wav`, type: 'wav', mime: 'audio/wav', size: original.length } }));
    let set = null;
    mock.method(PhoneCall, 'updateOne', async (q, u) => { set = [q['recording.file'], u.$set.recording]; return { matchedCount: 1 }; });
    const out = await c.compressRecording(callId);
    const [was, r] = set;
    assert.equal(was, `${sub}/call.wav`, 'changed only if it is still the same file');
    assert.deepEqual([r.file, r.type, r.mime, r.compressed, r.originalType, r.originalSize], [`${sub}/call.webm`, 'webm', 'audio/webm', true, 'wav', original.length]);
    assert.ok(r.size > 0 && r.size < original.length / 5, `much smaller: ${r.size} of ${original.length} bytes`);
    assert.equal(fs.existsSync(path.join(folder, 'call.wav')), false, 'the original is deleted');
    assert.equal(P.audioTypeOf(fs.readFileSync(path.join(folder, 'call.webm'))), 'webm');
    assert.equal(out.recording.file, r.file);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('Calls page filters: IST dates, who used the phone, direction, connected only, a number or a patient', () => {
  const q = c.queryOf({ from: '2026-11-23', to: '2026-11-23', user: 'Sachin', direction: 'missed', connected: '1', q: '70044 50064' });
  assert.equal(q.startedAt.$gte.toISOString(), '2026-11-22T18:30:00.000Z');
  assert.equal(q.startedAt.$lt.toISOString(), '2026-11-23T18:30:00.000Z');
  assert.deepEqual([q.userName, q.direction, q.durationSec], ['Sachin', 'missed', { $gt: 0 }]);
  assert.ok(q.phoneTail.test('7004450064'));
  const byName = c.queryOf({ q: 'Aar(av', direction: 'everything' });
  assert.equal(byName.direction, undefined);
  assert.ok(byName.$or[0]['matches.name'].test('aar(av'), 'searched as typed, not as a pattern');
});
