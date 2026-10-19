const { test } = require('node:test');
const assert = require('node:assert/strict');
const { COMPONENTS, SECTION_A, cleanRecord, emptyRecord } = require('./postCounselingRecord');
const controller = require('../controllers/postCounselingRecordController');
const Management = require('../models/AppointmentManagementEntry');
const SalesSheetAudit = require('../models/SalesSheetAudit');

const price = (key) => COMPONENTS.find((component) => component.key === key).price;

test('components: prices match the sheet and the Ayurvedic price is left empty', () => {
  assert.equal(COMPONENTS.length, 13);
  assert.equal(price('dosDontsDiet'), 18000);
  assert.equal(price('regularFollowUps'), 30000);
  assert.equal(price('sensoryGuidance'), 10000);
  assert.equal(price('ayurvedicFormulations'), null);
  assert.equal(price('querySupport'), 0);
});

test('record: the reference value is the sum of the selected components, worked out on the server', () => {
  const record = cleanRecord({ components: { selected: ['dosDontsDiet', 'panchakarmaKit', 'ayurvedicFormulations', 'nonsense'], ayurvedicPrice: '68,000' }, e: { concession: '42000' } });
  assert.deepEqual(record.components.selected, ['dosDontsDiet', 'ayurvedicFormulations', 'panchakarmaKit']);
  assert.equal(record.totals.referenceValue, 18000 + 18000 + 68000);
  assert.equal(record.totals.programFeeBeforeConcession, 104000);
  assert.equal(record.totals.approvedProgramFee, 62000);
  // a total sent by the browser is ignored
  assert.equal(cleanRecord({ totals: { referenceValue: 1 }, components: { selected: ['dosDontsDiet'] } }).totals.referenceValue, 18000);
});

test('record: Ayurvedic price is needed when it is selected, and ignored when it is not', () => {
  assert.throws(() => cleanRecord({ components: { selected: ['ayurvedicFormulations'] } }), /Customized Ayurvedic/);
  assert.equal(cleanRecord({ components: { selected: ['dosDontsDiet'], ayurvedicPrice: '999' } }).components.ayurvedicPrice, '');
});

test('record: bad values are rejected or dropped', () => {
  assert.throws(() => cleanRecord({ components: { selected: ['dosDontsDiet'] }, e: { concession: '30000' } }), /concession/);
  assert.throws(() => cleanRecord({ e: { part1Amount: '-5' } }), /Part 1/);
  assert.throws(() => cleanRecord({ b: { decisionDate: 'tomorrow' } }), /date/);
  const question = SECTION_A[0];
  const record = cleanRecord({ a: { [question.key]: { choices: [question.options[1], 'made up'], note: ' hi ' } }, b: { decision: 'Maybe', planExplained: true } });
  assert.deepEqual(record.a[question.key].choices, [question.options[1]]);
  assert.equal(record.a[question.key].note, 'hi');
  assert.equal(record.b.decision, '');
  assert.equal(record.b.planExplained, true);
  assert.deepEqual(Object.keys(emptyRecord().a), SECTION_A.map((item) => item.key));
});

const OID = 'a'.repeat(24);
const COUNSELOR = 'b'.repeat(24);
const sentEntry = (extra = {}) => ({ _id: OID, appointmentCode: 'APT-1', values: new Map(), registration: { status: 'sent', postCounselor: COUNSELOR, fields: new Map([['patientName', 'vyom']]) }, ...extra });
const call = async (handler, user, body = {}) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  let error = null;
  await handler({ params: { id: OID }, body, user, app: { get: () => null } }, res, (e) => { error = e; });
  return { res, error };
};
const stubs = async (entry, fn) => {
  const find = Management.findById; const update = Management.findOneAndUpdate; const audit = SalesSheetAudit.create;
  let updateArgs = null;
  Management.findById = async () => entry;
  Management.findOneAndUpdate = async (filter, change) => { updateArgs = change; return { ...entry, postCounseling: { record: change.$set['postCounseling.record'], savedAt: new Date(), savedByName: 'x' } }; };
  SalesSheetAudit.create = async () => ({});
  try { return await fn(() => updateArgs); } finally { Management.findById = find; Management.findOneAndUpdate = update; SalesSheetAudit.create = audit; }
};

test('record access: only the assigned counselor or admin can save, others are refused', async () => {
  await stubs(sentEntry(), async (updated) => {
    const mine = await call(controller.saveRecord, { _id: COUNSELOR, role: 'post_counselor', name: 'Abhishek' }, { record: { components: { selected: ['dosDontsDiet'] } } });
    assert.equal(mine.error, null);
    assert.equal(updated().$set['postCounseling.record'].totals.referenceValue, 18000);
    assert.equal(mine.res.body.saved, true);
    assert.equal(mine.res.body.canEdit, true);
    assert.equal((await call(controller.saveRecord, { _id: 'z'.repeat(24), role: 'post_counselor', name: 'Other' }, { record: {} })).error.statusCode, 403);
    const doctor = await call(controller.getRecord, { _id: 'd1', role: 'doctor', name: 'Dr' });
    assert.equal(doctor.res.body.canEdit, false);
    assert.equal((await call(controller.saveRecord, { _id: 'd1', role: 'doctor', name: 'Dr' }, { record: {} })).error.statusCode, 403);
    assert.equal((await call(controller.saveRecord, { _id: 'a1', role: 'admin', name: 'Admin' }, { record: {} })).error, null);
  });
  await stubs(sentEntry({ registration: { status: 'draft' } }), async () => {
    assert.equal((await call(controller.getRecord, { _id: COUNSELOR, role: 'post_counselor' })).error.statusCode, 404);
  });
});

test('done list: only saved records, filtered by consultation date, and a counselor sees only their own', async () => {
  const saved = (date, name, extra = {}) => ({
    _id: 'e'.repeat(24), appointmentCode: 'A', values: new Map([['6abb6329297d3a5387593670', `${name[0]}-1`]]),
    registration: { status: 'sent', postCounselor: COUNSELOR, postCounselorName: 'Abhishek', consultationDate: date, fields: new Map([['patientName', name], ['age', '3']]) },
    postCounseling: { savedAt: new Date(), savedByName: 'Abhishek', record: cleanRecord({ components: { selected: ['dosDontsDiet', 'regularFollowUps'] }, e: { concession: '8000', paymentPlan: '2 Parts' }, b: { decision: 'Proceeding' } }) },
    ...extra,
  });
  let seen = null;
  const find = Management.find;
  Management.find = (filter) => { seen = filter; return { sort: () => ({ limit: async () => [saved('2026-10-19', 'Riddhima'), saved('2026-10-18', 'Vyom')] }) }; };
  try {
    const call2 = async (user, query) => { const res = { json(payload) { this.body = payload; } }; await controller.listDone({ query, user, app: { get: () => null } }, res, (e) => { throw e; }); return res; };
    const mine = await call2({ _id: COUNSELOR, role: 'post_counselor' }, { from: '2026-10-18', to: '2026-10-19' });
    assert.deepEqual(seen['registration.consultationDate'], { $gte: '2026-10-18', $lte: '2026-10-19' });
    assert.deepEqual(seen['postCounseling.savedAt'], { $ne: null });
    assert.equal(seen['registration.postCounselor'], COUNSELOR);
    assert.equal(mine.body.patients.length, 2);
    const first = mine.body.patients[0];
    assert.equal(first.referenceValue, 48000);
    assert.equal(first.approvedProgramFee, 40000);
    assert.equal(first.decision, 'Proceeding');
    assert.deepEqual(first.components, ["Do's & Don'ts + Diet Plan Guidance", 'Regular Follow-ups']);
    const admin = await call2({ _id: 'a1', role: 'admin' }, { from: 'bad', q: 'vyom' });
    assert.equal(seen['registration.consultationDate'], undefined, 'an invalid date is ignored');
    assert.equal(seen['registration.postCounselor'], undefined);
    assert.deepEqual(admin.body.patients.map((patient) => patient.patientName), ['Vyom']);
  } finally { Management.find = find; }
});
