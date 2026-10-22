// Local UI smoke test for Purchase Orders and the tabbed Patient Details, with synthetic data.
// No backend or production requests are sent. Start the frontend on port 5173 first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const Patient = require('../src/models/Patient');
const { buildPoView } = require('../src/utils/purchaseOrderFlow');
const { buildTransitCase } = require('../src/utils/transitFlow');
const purchase = require('../src/utils/purchaseOrderRecord');

const PATIENT_ID = '507f1f77bcf86cd799439011';
const patientDoc = () => {
  const doc = new Patient({ _id: PATIENT_ID, patientName: 'Aarav Mehra', patientCode: 'A-221026-11', guardianName: 'Sunita Mehra', category: 'autism_adhd', number: '9999999999', age: '7', approvalStatus: 'approved', currentStage: 1 });
  const stage = doc.stages[0];
  Object.assign(stage, { purchaseOrder: 'PO-4821', totalAmount: 42000, packageName: 'Autism / Phase 1' });
  stage.payments.push({ _id: '507f1f77bcf86cd799439021', amount: 10000, approvalStatus: 'approved', paymentMode: 'online', utr: 'UTR-1', date: new Date() });
  stage.payments.push({ _id: '507f1f77bcf86cd799439022', amount: 32000, approvalStatus: 'pending', paymentMode: 'online', utr: 'UTR-2', date: new Date() });
  stage.medicineRequests.push({ requestId: 'req-1', status: 'in_process', medicines: 'Medhya ghrit, Shiva-leh', requestedAt: new Date(), inProcessAt: new Date(), readyByDate: new Date(Date.now() + 3 * 86400000), poNumber: 'PO-4821', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12' });
  return doc.toObject();
};
const pos = (patient) => [
  buildPoView({ _id: '6500000000000000000000a1', poNumber: 'PO-4821', generated: true, phase: 1, status: 'verified', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12', amount: 42000, packageName: 'Autism / Phase 1', paymentIds: ['507f1f77bcf86cd799439021'], medicineRequestId: 'req-1', source: 'conversion', paperValues: { mode: 'Online', amountReceivedNow: 10000, utrReference: '166901178274', paymentDate: '2026-10-18', plan: '2 Parts', part1Amount: 10000, part2Amount: 32000, poNo: 'PO-4821', poDate: '2026-10-18', orderedTreatment: 'Autism / 1st 6 months', supplyOrder: '1+5: First 1 month', guardianName: 'Sonam', consentTaken: true, screenshots: [{ url: '/uploads/payments/x.png', fileName: 'upi.png' }], totals: { approvedProgramFee: 42000, cardCharge: 0, outstandingBalance: 32000 } }, createdAt: new Date(), createdByName: 'Counselor', verifiedAt: new Date(), verifiedByName: 'Transit', events: [{ at: new Date(), action: 'PO created', byName: 'Counselor' }] }, patient, { includeEvents: true }),
  buildPoView({ _id: '6500000000000000000000a2', poNumber: 'PO-7310', generated: true, phase: 1, status: 'pending', supplyPlan: '1+5', supplyPart: 'rest', amount: 0, paymentIds: ['507f1f77bcf86cd799439022'], source: 'manual', createdAt: new Date(), createdByName: 'Counselor', events: [] }, patient, { includeEvents: true }),
];
// Shape Patient Details reads (the parts the page touches).
const formattedPatient = (p) => ({
  ...p, id: p._id, categoryLabel: 'Autism / ADHD', currentStageLabel: 'Phase 1', canApprove: true, isActive: true, canToggleActive: true, profileFields: [], hasDueMedicineConnect: false,
  assignedDoctor: null, assignedPsychologist: null, activityLog: [],
  stages: p.stages.map((s) => {
    const paid = s.payments.filter((x) => x.approvalStatus === 'approved').reduce((sum, x) => sum + x.amount, 0);
    return { ...s, statusLabel: 'Not Started', amountPaid: paid, remainingAmount: Math.max(s.totalAmount - paid, 0), poPaper: null, postCounselor: null, recordFiles: [], recordScanFiles: [],
      payments: s.payments.map((x) => ({ ...x, id: x._id, paymentModeLabel: 'Online', refunds: [], screenshotFiles: [] })),
      medicineRequest: { status: 'not_requested', prescriptionFiles: [], medicineImages: [], courier: { packageImages: [], deliveryProofImages: [] } },
      medicineRequests: s.medicineRequests.map((r) => ({ ...r, id: r.requestId, statusLabel: 'In process', supplyLabel: '1+5: First 1 month', ageBandLabel: 'Above 4 - 12 years', prescriptionFiles: [], medicineImages: [], courier: { status: 'pending', packageImages: [], deliveryProofImages: [] } })),
      followUps: [], familySessions: [] };
  }),
});

async function main() {
  const base = process.env.PO_UI_URL || 'http://127.0.0.1:5173';
  const output = path.resolve(__dirname, '../.cache/purchase-order-ui');
  fs.mkdirSync(output, { recursive: true });
  const raw = patientDoc();
  const items = pos(raw);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const user = { _id: '507f1f77bcf86cd799439012', name: 'Transit Staff', role: 'in_transit' };
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.stack || error.message).split('\n').slice(0, 4).join(' <- ')));
    await page.evaluateOnNewDocument((u) => {
      localStorage.setItem('crm_token', 'test-only'); localStorage.setItem('crm_user', JSON.stringify(u));
      window.WebSocket = class { close() {} addEventListener() {} removeEventListener() {} };
    }, user);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        let data = { success: true, items: [], patients: [], reminders: [], rows: [], records: [], callLogs: [], banks: [], doctors: [], psychologists: [], postCounselors: [], count: 0, total: 0 };
        if (url.pathname.endsWith('/auth/me')) data = { user };
        else if (url.pathname === '/api/purchase-orders') data = { success: true, items, counts: { all: 2, verification: 1, medicine: 1 } };
        else if (/^\/api\/purchase-orders\/[a-f0-9]{24}$/.test(url.pathname)) data = { success: true, purchaseOrder: items.find((po) => url.pathname.endsWith(po.id)) };
        else if (url.pathname === `/api/patients/${PATIENT_ID}`) data = { success: true, patient: formattedPatient(raw) };
        else if (url.pathname === `/api/transit/${PATIENT_ID}/1`) data = { success: true, item: buildTransitCase(raw, raw.stages[0]), events: [] };
        else if (url.pathname === '/api/purchase-orders/form') data = { success: true, definitions: purchase.definitions(), values: purchase.defaults({ record: null, registration: { category: 'autism_adhd', fatherName: 'Rajnish', fatherNumber: '8800611900' }, counselorName: 'Transit Staff', today: '2026-10-22' }), contacts: { fatherNumber: '8800611900' }, phase: 1 };
        return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(data) });
      }
      if (url.origin !== base || url.pathname.startsWith('/socket.io')) return request.abort();
      return request.continue();
    });
    const shots = [
      ['po-list', '/admin/purchase-orders', 'PO-7310'],
      ['po-verify', `/admin/purchase-orders/${items[1].id}`, 'Verify the PO details'],
      ['po-detail', `/admin/purchase-orders/${items[0].id}`, 'Handover & treatment start'],
      ['patient-overview', `/admin/patients/${PATIENT_ID}`, 'Contact & care team'],
      ['patient-orders', `/admin/patients/${PATIENT_ID}?tab=orders`, 'PO-4821'],
      ['patient-phases', `/admin/patients/${PATIENT_ID}?tab=phases`, 'Treatment phases & payments'],
      ['patient-medicine', `/admin/patients/${PATIENT_ID}?tab=medicine`, 'Medicine supply & requests'],
    ];
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 1000 });
      for (const [name, route, text] of shots) {
        await page.goto(base + route, { waitUntil: 'networkidle0' });
        try {
          await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, text);
        } catch (error) {
          await page.screenshot({ path: path.join(output, `FAILED-${name}-${width}.png`), fullPage: true });
          throw new Error(`${name} at ${width}: "${text}" not shown. Page says: ${(await page.evaluate(() => document.body.innerText)).slice(0, 600)} | errors: ${errors.join(' / ')}`);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} overflows at ${width}`);
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
        if (name === 'patient-orders') {
          // "New PO" opens the same PO paper the post counselor fills (sections F, G, H).
          await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'New PO').click());
          await page.waitForFunction(() => document.body.innerText.includes('Payment collection') && document.body.innerText.includes('Medicine supply on this PO'), { timeout: 15000 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `new PO form overflows at ${width}`);
          await page.screenshot({ path: path.join(output, `po-new-form-${width}.png`), fullPage: false });
          await page.keyboard.press('Escape');
        }
      }
    }
    assert.deepEqual(errors, [], 'runtime errors');
    console.log('Purchase order pages and Patient Details tabs: desktop/mobile render passed');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
