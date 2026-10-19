const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanPurchase, describePoPaper } = require('./purchaseOrderRecord');

const image = { url: '/uploads/payments/1700000000-123.jpg', fileName: 'po-paper.jpg' };

test('the PO paper image is kept, and only uploaded images are accepted', () => {
  const { values } = cleanPurchase({ mode: 'Online', poNo: 'PO-9', medicineReadyDate: '2026-10-30', paperImages: [image, { url: 'https://evil.test/x.jpg', fileName: 'bad' }, { url: '/etc/passwd', fileName: 'bad' }] }, 42000);
  assert.deepEqual(values.paperImages, [image]);
  assert.equal(values.medicineReadyDate, '2026-10-30');
  assert.throws(() => cleanPurchase({ medicineReadyDate: 'next week' }, 42000), /date/);
  const cash = cleanPurchase({ mode: 'Cash', poNo: 'PO-9', paperImages: [image], screenshots: [image] }, 42000);
  assert.deepEqual(cash.values.paperImages, [image], 'the PO paper image is kept for a cash payment too');
  assert.deepEqual(cash.values.screenshots, [], 'a cash payment has no payment screenshot');
});

test('a saved PO paper is described for Patient Details: the paper image and the main PO details only', () => {
  const cleaned = cleanPurchase({
    mode: 'Online', medicineReadyDate: '2026-10-30', amountReceivedNow: '10000', utrReference: '166901178274', transactionId: 'T-1', poNo: 'PO-9', poDate: '2026-10-18', orderedTreatment: 'Autism / Phase 1',
    paymentTime: '15:10', plan: '2 Parts', part1Amount: '10000', part1Due: '32000', consentTaken: true, paperImages: [image], screenshots: [{ url: '/uploads/payments/9-9.png', fileName: 'proof.png' }],
  }, 42000);
  cleaned.values.payToBankName = 'Manovaidya Ayurveda';
  const view = describePoPaper({ values: cleaned.values, totals: { ...cleaned.totals, approvedProgramFee: 42000 }, savedAt: new Date('2026-10-18'), savedByName: 'Abhishek', source: 'post_counseling' });
  assert.equal(view.poNo, 'PO-9');
  assert.deepEqual(view.images, [image]);
  const line = (label) => view.details.find((item) => item.label === label)?.value;
  assert.equal(line('PO No.'), 'PO-9');
  assert.equal(line('PO date'), '2026-10-18');
  assert.equal(line('Ordered treatment / phase'), 'Autism / Phase 1');
  assert.equal(line('Medicine ready expected date'), '2026-10-30');
  assert.deepEqual(view.details.map((item) => item.label).sort(), ['Medicine ready expected date', 'Ordered treatment / phase', 'PO No.', 'PO date']);
  assert.equal('sections' in view, false, 'the payment, EMI and consent details are not copied to Patient Details');
  assert.equal('screenshots' in view, false);
  assert.equal(JSON.stringify(view).includes('166901178274'), false, 'no payment details (they live on the payment itself)');
  assert.equal(view.savedByName, 'Abhishek');
  assert.equal(describePoPaper(null), null);
  assert.equal(describePoPaper({}), null);
});

test('an image can be added to a saved PO paper later, and only for a phase that has one', async () => {
  const Patient = require('../models/Patient');
  const { addPoPaperImages } = require('../controllers/patientController');
  const stage = (number, poPaper) => ({ number, poPaper, payments: [], followUps: [], familySessions: [] });
  const make = (stages) => ({ _id: 'p1', patientName: 'Test', stages, activityLog: [], markModified() {}, populate: async function populate() { return this; }, save: async function save() { this.saved = true; } });
  const run = async (doc, number, files) => {
    const original = Patient.findById; Patient.findById = async () => doc;
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    let error = null;
    try { await addPoPaperImages({ params: { id: 'p1', number }, files, user: { _id: 'u', name: 'Abhishek', role: 'admin' } }, res, (e) => { error = e; }); } finally { Patient.findById = original; }
    return { res, error };
  };
  const upload = [{ filename: '1-1.jpg', originalname: 'paper.jpg' }];
  const withPaper = make(Array.from({ length: 6 }, (_, index) => stage(index + 1, index === 0 ? { values: { poNo: 'PO-9', paperImages: [image] }, totals: {} } : null)));
  const added = await run(withPaper, '1', upload);
  assert.equal(added.error, null);
  assert.deepEqual(withPaper.stages[0].poPaper.values.paperImages.map((file) => file.url), [image.url, '/uploads/payments/1-1.jpg']);
  assert.equal(withPaper.saved, true);
  const none = await run(make(Array.from({ length: 6 }, (_, index) => stage(index + 1, null))), '2', upload);
  assert.equal(none.res.statusCode, 404);
  assert.equal((await run(withPaper, '1', [])).res.statusCode, 400);
});
