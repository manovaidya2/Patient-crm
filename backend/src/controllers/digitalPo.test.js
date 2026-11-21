// Digital purchase order: the frozen purchase order (nothing else of the patient), the public link (by its secret
// only), the consent + signature (one time), with the database mocked.
const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');
const DigitalPurchaseOrder = require('../models/DigitalPurchaseOrder');
const D = require('../utils/digitalPo');
const c = require('./digitalPoController');

afterEach(() => mock.restoreAll());
const id = () => new mongoose.Types.ObjectId();
const call = async (handler, req) => {
  let body = null; let status = 200; let error = null;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; }, set() { return this; }, type() { return this; } };
  await handler({ app: { get: () => null }, headers: {}, params: {}, body: {}, ...req }, res, (e) => { error = e; });
  return { body, status, error };
};
const lean = (value) => ({ lean: async () => value, select() { return this; } });

const registration = {
  patientId: 'MV-1042', postCounselorName: 'PC Riya',
  fields: { patientName: 'Aarav', age: '6', category: 'autism_adhd', fatherName: 'Rahul', fatherNumber: '9876543210', motherNumber: '9123456780', whatsappNumber: '9988776655', address: 'Flat 4, Pune' },
};
const record = {
  components: { selected: ['dosDontsDiet', 'ayurvedicFormulations', 'querySupport'], ayurvedicPrice: 68000 },
  otherComponent: '', e: { approvedProgramFee: 39000, paymentPlan: '2 Parts', part1Amount: 10000, part2Amount: 29000, otherPlan: '' },
  totals: { referenceValue: 86000, approvedProgramFee: 39000, concession: 47000 },
};

test('the snapshot is only the purchase order: no phone numbers, address or anything else of the patient', () => {
  const s = D.snapshotOf({ registration, record, phase: 2, now: new Date('2026-11-21T10:00:00Z') });
  assert.deepEqual(s.patient, { name: 'Aarav', patientId: 'MV-1042', program: 'Autism / ADHD', age: '6', parent: 'Rahul', phase: 2, counsellor: 'PC Riya' });
  assert.deepEqual(s.components.map((x) => [x.name, x.value]), [["Do's & Don'ts + Diet Plan Guidance", 18000], ['Customized Ayurvedic Formulations', 68000], ['Multiple Query Support & Resolution', 0]]);
  assert.equal(s.approvedFee, 39000);
  assert.equal(s.paymentPlan, '2 Parts');
  assert.equal(s.date, '2026-11-21');
  const all = JSON.stringify(s);
  ['9876543210', '9123456780', '9988776655', 'Pune'].forEach((secret) => assert.ok(!all.includes(secret), `${secret} must not be in the purchase order`));
});

test('consent: every point ticked, a name and who signs; the signature must really be an image', () => {
  assert.match(D.cleanSign({ consents: ['explained'], signerName: 'Neeta', relation: 'Mother' }).error, /every consent/);
  const all = D.CONSENT_ITEMS.map((i) => i.key);
  assert.match(D.cleanSign({ consents: JSON.stringify(all), signerName: 'N', relation: 'Mother' }).error, /full name/);
  assert.match(D.cleanSign({ consents: all, signerName: 'Neeta', relation: 'Neighbour' }).error, /who is signing/);
  assert.deepEqual(D.cleanSign({ consents: JSON.stringify(all), signerName: ' Neeta Mehta ', relation: 'Mother', kind: 'photo' }).value, { consents: all, signerName: 'Neeta Mehta', relation: 'Mother', kind: 'photo' });
  assert.equal(D.imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), 'png');
  assert.equal(D.imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
  assert.equal(D.imageType(Buffer.from('<html><script>alert(1)</script>')), '');
  const token = D.newToken();
  assert.ok(D.validToken(token));
  assert.ok(!D.validToken('abc') && !D.validToken(`${token}x`) && !D.validToken({ $ne: null }));
});

test('public link: a wrong link finds nothing; an open one shows only the purchase order; a signed or old one shows nothing of it', async () => {
  mock.method(DigitalPurchaseOrder, 'findOne', () => assert.fail('a link of the wrong shape is never looked up'));
  assert.equal((await call(c.getPublic, { params: { token: 'short' } })).error.statusCode, 404);
  mock.restoreAll();

  const snapshot = D.snapshotOf({ registration, record, phase: 1 });
  const doc = { _id: id(), ref: 'DPO-261121-AB12', token: D.newToken(), status: 'sent', snapshot, expiresAt: new Date(Date.now() + 86400000), openedAt: null };
  const updates = [];
  mock.method(DigitalPurchaseOrder, 'findOne', () => lean(doc));
  mock.method(DigitalPurchaseOrder, 'updateOne', async (q, u) => { updates.push(u); });
  const open = await call(c.getPublic, { params: { token: doc.token } });
  assert.deepEqual([open.body.status, open.body.snapshot.patient.name, open.body.consentItems.length], ['sent', 'Aarav', D.CONSENT_ITEMS.length]);
  assert.ok(updates[0].$inc && updates[0].$set.openedAt, 'the first open is noted');
  assert.equal(open.body.token, undefined);

  const signed = c.publicView({ ...doc, status: 'signed', signed: { at: new Date(), signerName: 'Neeta', signatureFile: 'x.png' } });
  assert.deepEqual(Object.keys(signed).sort(), ['ref', 'signedAt', 'status', 'success']);
  assert.equal(c.publicView({ ...doc, expiresAt: new Date(Date.now() - 1000) }).snapshot, undefined, 'expired: nothing shown');
  assert.equal(c.publicView({ ...doc, status: 'replaced' }).snapshot, undefined);
});

test('signing: consent + an image signs it once; a second time, a non-image or an expired link is refused', async () => {
  const doc = { _id: id(), entry: id(), ref: 'DPO-1', token: D.newToken(), status: 'sent', snapshot: {}, expiresAt: new Date(Date.now() + 86400000) };
  mock.method(DigitalPurchaseOrder, 'findOne', () => lean(doc));
  mock.method(fs.promises, 'mkdir', async () => {});
  const written = [];
  mock.method(fs.promises, 'writeFile', async (file) => { written.push(file); });
  mock.method(fs.promises, 'unlink', async () => {});
  let saved = null;
  mock.method(DigitalPurchaseOrder, 'findOneAndUpdate', async (q, u) => { if (saved) return null; saved = u.$set; return { ...doc, ...u.$set }; });
  const body = { consents: JSON.stringify(D.CONSENT_ITEMS.map((i) => i.key)), signerName: 'Neeta Mehta', relation: 'Mother', kind: 'drawn' };
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3]);

  assert.match((await call(c.signPublic, { params: { token: doc.token }, body })).error.message, /Sign in the box/);
  assert.match((await call(c.signPublic, { params: { token: doc.token }, body, file: { buffer: Buffer.from('not an image at all') } })).error.message, /must be an image/);
  assert.match((await call(c.signPublic, { params: { token: doc.token }, body: { ...body, consents: '[]' }, file: { buffer: png } })).error.message, /every consent/);
  const ok = await call(c.signPublic, { params: { token: doc.token }, body, file: { buffer: png }, headers: { 'user-agent': 'Phone', 'x-forwarded-for': '1.2.3.4' } });
  assert.equal(ok.error, null);
  assert.deepEqual([ok.body.status, saved.status, saved.signed.signerName, saved.signed.relation, saved.signed.signatureMime, saved.signed.ip], ['signed', 'signed', 'Neeta Mehta', 'Mother', 'image/png', '1.2.3.4']);
  assert.match(written[0], /digital-po/);
  assert.equal((await call(c.signPublic, { params: { token: doc.token }, body, file: { buffer: png } })).error.statusCode, 409, 'one time only');

  mock.method(DigitalPurchaseOrder, 'findOne', () => lean({ ...doc, status: 'signed' }));
  assert.equal((await call(c.signPublic, { params: { token: doc.token }, body, file: { buffer: png } })).error.statusCode, 409);
  mock.method(DigitalPurchaseOrder, 'findOne', () => lean({ ...doc, expiresAt: new Date(Date.now() - 1000) }));
  assert.equal((await call(c.signPublic, { params: { token: doc.token }, body, file: { buffer: png } })).error.statusCode, 410);
});

test('one digital PO per visit: made once, then updated in place (same number and link); a signed one that changed is signed again, its signed version kept', async () => {
  const user = { _id: id(), name: 'PC Riya' };
  const entry = { _id: id(), postCounseling: { savedAt: new Date(), record } };
  let stored = null;
  const updates = [];
  mock.method(DigitalPurchaseOrder, 'findOne', () => ({ sort: () => ({ lean: async () => stored }) }));
  mock.method(DigitalPurchaseOrder, 'create', async (data) => { stored = { _id: id(), createdAt: new Date(), ...data }; return stored; });
  mock.method(DigitalPurchaseOrder, 'findOneAndUpdate', async (q, u) => {
    updates.push([q, u]);
    if (q.status !== stored.status) return null;
    stored = { ...stored, ...u.$set, ...(u.$push ? { history: [...(stored.history || []), u.$push.history] } : {}) };
    if (u.$unset?.signed) delete stored.signed;
    return stored;
  });

  const first = await c.saveForEntry({ entry, registration, phase: 1, user });
  assert.equal(first.action, 'created');
  assert.ok(D.validToken(first.doc.token));
  assert.match(first.doc.ref, /^DPO-\d{6}-[0-9A-F]{4}$/);
  assert.ok(first.doc.expiresAt - Date.now() > 29 * 86400000);
  const { token, ref } = first.doc;

  const same = await c.saveForEntry({ entry, registration, phase: 1, user });
  assert.deepEqual([same.action, same.doc.version, same.doc.token, same.doc.ref], ['extended', 1, token, ref], 'nothing changed: the link is renewed');

  const changed = { ...entry, postCounseling: { ...entry.postCounseling, record: { ...record, e: { ...record.e, approvedProgramFee: 45000 }, totals: { ...record.totals, approvedProgramFee: 45000, concession: 41000 } } } };
  const updated = await c.saveForEntry({ entry: changed, registration, phase: 1, user });
  assert.deepEqual([updated.action, updated.doc.version, updated.doc.token, updated.doc.ref, updated.doc.snapshot.approvedFee], ['updated', 2, token, ref, 45000]);

  stored = { ...stored, status: 'signed', signed: { at: new Date(), signerName: 'Avinash', relation: 'Father', signatureFile: 'a.png' } };
  await assert.rejects(c.saveForEntry({ entry: changed, registration, phase: 1, user }), /Nothing changed in the record since the parent signed/);
  const resign = await c.saveForEntry({ entry, registration, phase: 1, user });
  assert.deepEqual([resign.action, resign.doc.status, resign.doc.version, resign.doc.token, resign.doc.signed], ['resign', 'sent', 3, token, undefined]);
  assert.deepEqual([resign.doc.history[0].version, resign.doc.history[0].signed.signerName, resign.doc.history[0].snapshot.approvedFee], [2, 'Avinash', 45000], 'the signed version is kept');
  assert.equal(c.staffView(resign.doc).history[0].signed.hasSignature, true);

  // The parent signs while the clinic updates: the update is refused, not lost.
  stored = { ...stored, status: 'sent' };
  mock.method(DigitalPurchaseOrder, 'findOne', () => ({ sort: () => ({ lean: async () => ({ ...stored, status: 'sent' }) }) }));
  stored.status = 'signed';
  await assert.rejects(c.saveForEntry({ entry: changed, registration, phase: 1, user }), /just signed/);

  await assert.rejects(c.saveForEntry({ entry: { _id: id(), postCounseling: {} }, registration, phase: 1, user }), /Save the post-counselling record first/);
  await assert.rejects(c.saveForEntry({ entry: { _id: id(), postCounseling: { savedAt: new Date(), record: { ...record, components: { selected: [] } } } }, registration, phase: 1, user }), /components/);
});

test('the parent signs the version on their screen: an updated purchase order must be read again', async () => {
  const doc = { _id: id(), entry: id(), ref: 'DPO-1', token: D.newToken(), status: 'sent', version: 3, snapshot: {}, expiresAt: new Date(Date.now() + 86400000) };
  mock.method(DigitalPurchaseOrder, 'findOne', () => lean(doc));
  mock.method(DigitalPurchaseOrder, 'updateOne', async () => {});
  assert.equal((await call(c.getPublic, { params: { token: doc.token } })).body.version, 3);
  const body = { consents: JSON.stringify(D.CONSENT_ITEMS.map((i) => i.key)), signerName: 'Neeta', relation: 'Mother', version: '2' };
  assert.match((await call(c.signPublic, { params: { token: doc.token }, body, file: { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) } })).error.message, /just updated/);
});

test('Digital PO page: submitted (signed) by default; a Post Counselor sees only theirs; search and dates', async () => {
  const pc = { _id: id(), name: 'PC Riya', role: 'post_counselor' };
  const admin = { _id: id(), name: 'Admin', role: 'admin' };
  const signedAt = new Date('2026-11-21T10:00:00Z');
  const row = { _id: id(), entry: id(), ref: 'DPO-1', token: D.newToken(), status: 'signed', snapshot: { patient: { name: 'Aarav' } }, expiresAt: new Date(Date.now() + 86400000), signed: { at: signedAt, signerName: 'Neeta', relation: 'Mother', consents: [], signatureFile: 'x.png' } };
  const asked = [];
  mock.method(DigitalPurchaseOrder, 'find', (filter) => { asked.push(filter); return { sort: () => ({ limit: () => ({ lean: async () => [row] }) }) }; });
  mock.method(DigitalPurchaseOrder, 'countDocuments', async () => 1);
  const mine = await call(c.listDigitalPos, { user: pc, query: {} });
  assert.equal(mine.error, null);
  assert.equal(asked[0].status, 'signed');
  assert.deepEqual(asked[0].$or, [{ postCounselor: pc._id }, { createdBy: pc._id }]);
  assert.deepEqual([mine.body.items[0].ref, mine.body.items[0].status, mine.body.items[0].token, mine.body.items[0].signed.signerName], ['DPO-1', 'signed', '', 'Neeta']);
  assert.equal(JSON.stringify(mine.body).includes('x.png'), false, 'the file name is not sent');
  await call(c.listDigitalPos, { user: admin, query: { view: 'waiting', q: 'Aar(', from: '2026-11-01', to: '2026-11-30' } });
  assert.equal(asked[1].$or, undefined, 'the admin sees everyone\'s');
  assert.equal(asked[1].status, 'sent');
  assert.ok(asked[1].$and.some((part) => part.$or && part.$or[0].ref instanceof RegExp));
  assert.ok(asked[1].$and.some((part) => part.createdAt?.$gte && part.createdAt?.$lte));
});

test('delete: an unsigned digital PO is taken back (the link stops working, the record stays); a signed one is not deleted', async () => {
  const user = { _id: id(), name: 'PC Riya' };
  const entry = { _id: id() };
  let stored = { _id: id(), entry: entry._id, ref: 'DPO-9', token: D.newToken(), status: 'sent', snapshot: {}, expiresAt: new Date(Date.now() + 86400000) };
  mock.method(DigitalPurchaseOrder, 'findOne', (q) => ({ sort: () => ({ lean: async () => (q.status?.$nin?.includes(stored.status) ? null : stored) }) }));
  mock.method(DigitalPurchaseOrder, 'findOneAndUpdate', async (q, u) => { if (q.status !== stored.status) return null; stored = { ...stored, ...u.$set }; return stored; });
  const gone = await c.deleteForEntry({ entry, user });
  assert.deepEqual([gone.status, gone.deletedByName], ['deleted', 'PC Riya']);
  assert.equal(D.statusOf(gone), 'deleted');
  assert.deepEqual(Object.keys(c.publicView(gone)).sort(), ['ref', 'status', 'success'], 'the link shows nothing of it');
  await assert.rejects(c.deleteForEntry({ entry, user }), /no digital purchase order to delete/);

  // The parent opens or signs the deleted link: refused.
  mock.method(DigitalPurchaseOrder, 'findOne', () => lean(stored));
  const body = { consents: JSON.stringify(D.CONSENT_ITEMS.map((i) => i.key)), signerName: 'Neeta', relation: 'Mother' };
  const tried = await call(c.signPublic, { params: { token: stored.token }, body, file: { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) } });
  assert.deepEqual([tried.error.statusCode, /no longer active/.test(tried.error.message)], [410, true]);

  // A new one can be made for the visit afterwards (the deleted one does not count).
  mock.method(DigitalPurchaseOrder, 'findOne', (q) => ({ sort: () => ({ lean: async () => (q.status?.$nin?.includes('deleted') ? null : stored) }) }));
  mock.method(DigitalPurchaseOrder, 'create', async (data) => ({ _id: id(), ...data }));
  const fresh = await c.saveForEntry({ entry: { ...entry, postCounseling: { savedAt: new Date(), record } }, registration, phase: 1, user });
  assert.equal(fresh.action, 'created');
  assert.notEqual(fresh.doc.token, stored.token);

  stored = { ...stored, status: 'signed', signed: { at: new Date(), signerName: 'Neeta' } };
  mock.method(DigitalPurchaseOrder, 'findOne', () => ({ sort: () => ({ lean: async () => stored }) }));
  await assert.rejects(c.deleteForEntry({ entry, user }), /is not deleted/);
});

test('download: a signed digital PO (or an earlier signed version) comes as a PDF; one not signed yet does not', async () => {
  const pdf = require('../utils/digitalPoPdf');
  const sharp = require('sharp');
  const snapshot = D.snapshotOf({ registration, record, phase: 2, now: new Date('2026-11-21T10:00:00Z') });
  const signed = { at: new Date('2026-11-21T11:42:00Z'), signerName: 'Neeta Mehta', relation: 'Mother', consents: D.CONSENT_ITEMS.map((i) => i.key), signatureKind: 'drawn', signatureFile: 'no-such-file.png' };
  const doc = { _id: id(), ref: 'DPO-261121-AB12', status: 'sent', version: 2, snapshot, history: [{ version: 1, snapshot, signed }] };
  mock.method(DigitalPurchaseOrder, 'findById', () => lean(doc));
  const get = async (req) => {
    let sent = null; let headers = {}; let error = null;
    const res = { set(h) { headers = { ...headers, ...h }; return this; }, send(b) { sent = b; return this; }, status() { return this; }, type() { return this; } };
    await c.downloadPdf({ params: { id: String(doc._id) }, query: {}, ...req }, res, (e) => { error = e; });
    return { sent, headers, error };
  };

  assert.equal((await get({})).error.statusCode, 404, 'v2 is waiting for the parent: nothing to download yet');
  const v1 = await get({ query: { version: '1' } });
  assert.equal(v1.error, null);
  assert.equal(v1.sent.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual([v1.headers['Content-Type'], v1.headers['Content-Disposition'], v1.headers['Cache-Control']], ['application/pdf', 'attachment; filename="Purchase-Order-DPO-261121-AB12-Aarav.pdf"', 'private, no-store']);
  mock.method(DigitalPurchaseOrder, 'findById', () => lean({ ...doc, status: 'signed', signed }));
  assert.match((await get({})).headers['Content-Disposition'], /Purchase-Order-DPO-261121-AB12-v2-Aarav\.pdf/);
  assert.equal((await get({ params: { id: 'nope' } })).error.statusCode, 404);

  // The signature goes in as PNG / JPEG; a WebP photo is turned into PNG; anything else is left out.
  const png = await sharp({ create: { width: 8, height: 4, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const webp = await sharp(png).webp().toBuffer();
  assert.equal(await pdf.pdfImage(png), png);
  assert.equal(D.imageType(await pdf.pdfImage(webp)), 'png');
  assert.equal(await pdf.pdfImage(Buffer.from('<svg onload=alert(1)></svg>')), null);
  const withSignature = await pdf.renderDigitalPoPdf({ refNo: 'DPO-1', snapshot, signed, consentItems: D.CONSENT_ITEMS, signature: webp });
  assert.equal(withSignature.subarray(0, 5).toString(), '%PDF-');
});
