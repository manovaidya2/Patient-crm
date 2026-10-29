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
const MedicineJob = require('../src/models/MedicineJob');
const { formulationFor, chitsFor, stockNeeds, applyOverrides } = require('../src/constants/formulationMaster');
const { buildJobView, jobSummary, STAGES } = require('../src/utils/medicineJobFlow');
const { SAMPLE_STOCKS } = require('../src/utils/stockSeed');
const { formatItem } = require('../src/controllers/stockController');
const { bandView } = require('../src/controllers/formulationMasterController');
const { MASTER_ITEMS, MASTER_DOSES, SPLIT_DAYS, PENDING_KEYS, defaultMasterFor } = require('../src/constants/formulationMaster');
const { SUPPLY_OPTIONS } = require('../src/constants/supplyPlans');
const JOB_ID = '6500000000000000000000b1';
const JOB2_ID = '6500000000000000000000b2';
const JOB3_ID = '6500000000000000000000b3';
const stockDocs = () => SAMPLE_STOCKS.map((x) => ({ _id: '65000000000000000000' + String(1000 + SAMPLE_STOCKS.indexOf(x)).slice(-4), ...x, currentStock: x.opening, updatedAt: new Date() }));
const jobDoc = (patient) => { const f = formulationFor({ ageBand: '4-12', plan: '1+5', part: 'first' }); return new MedicineJob({ _id: JOB_ID, patient: patient._id, patientCode: patient.patientCode, patientName: patient.patientName, phase: 1, requestId: 'req-1', poNumber: 'PO-4821', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12', medicines: 'Medhya ghrit, Shiva-leh', requestedAt: new Date(), requestedByName: 'Transit', readyByDate: new Date(Date.now() + 2 * 86400000), currentStage: 5, stages: [['accept', { readyByDate: '2026-10-25' }], ['review', {}], ['formula', { remarks: 'Sheet is right' }], ['stock', { batchRefs: 'MG-2610' }], ['prepare', { batchNo: 'B-1', preparerName: 'Meena' }]].map(([key, fields], i) => ({ key, doneAt: new Date(), doneByName: key === 'formula' ? 'Dr Garg' : 'Meena', doneByRole: key === 'formula' ? 'doctor' : 'medicine_department', checks: STAGES[i].checks.map(() => true), fields })), formulation: f, chits: chitsFor(f, patient.patientName), consumption: stockNeeds(f).map((n) => ({ code: n.code, name: n.name, unit: n.unit, planned: n.qty, actual: n.qty, txId: '6500000000000000000000c1' })), events: [{ at: new Date(), action: 'Job opened', byName: 'Meena' }] }).toObject(); };

const PATIENT_ID = '507f1f77bcf86cd799439011';
// A second job still at the formulation review stage, with one line already corrected by the department.
const reviewJobDoc = (patient) => { const f = applyOverrides(formulationFor({ ageBand: '4-12', plan: '1+5', part: 'first' }), [{ key: 'ghrit', qty: 60, dose: 'सुबह खाली पेट: ½ चम्मच (2 ml), दिन में एक बार।' }], { byName: 'Meena' }); return new MedicineJob({ _id: JOB2_ID, patient: patient._id, patientCode: patient.patientCode, patientName: patient.patientName, phase: 1, requestId: 'req-2', poNumber: 'PO-7310', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12', medicines: 'Medhya ghrit, Shiva-leh', requestedAt: new Date(), requestedByName: 'Transit', readyByDate: new Date(Date.now() + 3 * 86400000), currentStage: 1, stages: [{ key: 'accept', doneAt: new Date(), doneByName: 'Meena', doneByRole: 'medicine_department', checks: STAGES[0].checks.map(() => true), fields: { readyByDate: '2026-10-25' } }], formulation: f, chits: chitsFor(f, patient.patientName), consumption: stockNeeds(f).map((n) => ({ code: n.code, name: n.name, unit: n.unit, planned: n.qty })), events: [{ at: new Date(), action: 'Formulation sheet corrected', byName: 'Meena' }] }).toObject(); };
const patientDoc = () => {
  const doc = new Patient({ _id: PATIENT_ID, patientName: 'Aarav Mehra', patientCode: 'A-221026-11', guardianName: 'Sunita Mehra', category: 'autism_adhd', number: '9999999999', age: '7', approvalStatus: 'approved', currentStage: 1 });
  const stage = doc.stages[0];
  Object.assign(stage, { purchaseOrder: 'PO-4821', totalAmount: 42000, packageName: 'Autism / Phase 1' });
  stage.payments.push({ _id: '507f1f77bcf86cd799439021', amount: 10000, approvalStatus: 'approved', paymentMode: 'online', utr: 'UTR-1', date: new Date() });
  stage.payments.push({ _id: '507f1f77bcf86cd799439022', amount: 32000, approvalStatus: 'pending', paymentMode: 'online', utr: 'UTR-2', date: new Date() });
  stage.medicineRequests.push({ requestId: 'req-1', status: 'in_process', medicines: 'Medhya ghrit, Shiva-leh', requestedAt: new Date(), inProcessAt: new Date(), readyByDate: new Date(Date.now() + 3 * 86400000), poNumber: 'PO-4821', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12' });
  return doc.toObject();
};
// The same patient further along: medicine handed over at the clinic, PCC assigned, explanation due - what the PCC sees.
const PCC_ID = '507f1f77bcf86cd799439015';
const explainPatient = () => {
  const doc = patientDoc();
  const stage = doc.stages[0];
  stage.payments[1].approvalStatus = 'approved';
  Object.assign(stage.medicineRequests[0], { status: 'sent_to_courier', madeAt: new Date(), madeByName: 'Meena', sentToCourierAt: new Date(), sentToCourierByName: 'Meena', medicineImages: [{ url: '/uploads/medicine/a.png', fileName: 'photoA.png' }],
    courier: { status: 'delivered', deliveryMode: 'self', receivedByName: 'Sunita Mehra', deliveredAt: new Date(), deliveredByName: 'Transit Staff', packageImages: [], deliveryProofImages: [] } });
  stage.medicineExplainDate = new Date(Date.now() + 86400000);
  Object.assign(stage.transit, { fulfilmentMode: 'pickup', fulfilmentSetAt: new Date(), fulfilmentSetByName: 'Transit Staff', pickupScheduledAt: new Date(), explanationScheduledAt: new Date(), explanationScheduledByName: 'Transit Staff', explanationMode: 'clinic', assignedAt: new Date(), assignedByName: 'Transit Staff', explanationDoctor: PCC_ID, calls: [{ at: new Date(), outcome: 'connected', notes: 'Will collect on Friday', byName: 'Transit Staff' }] });
  doc.assignedDoctor = { _id: PCC_ID, name: 'Dr Asha' };
  return doc;
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
  const job = jobDoc(raw);
  const stocks = stockDocs();
  items[0].medicineJob = jobSummary(job);
  const job2View = buildJobView(reviewJobDoc(raw), { stocks, includeEvents: true });
  // A job waiting for the doctor's formulation step (the Medicine Department sees it blurred).
  const job3Doc = { ...reviewJobDoc(raw), _id: JOB3_ID, requestId: 'req-3', currentStage: 2 };
  job3Doc.stages = [...job3Doc.stages, { key: 'review', doneAt: new Date(), doneByName: 'Meena', doneByRole: 'medicine_department', checks: STAGES[1].checks.map(() => true), fields: {} }];
  const job3View = buildJobView(job3Doc, { stocks, includeEvents: true });
  const jobView = buildJobView(job, { stocks, payment: { totalAmount: 42000, amountPaid: 10000, remaining: 32000, pendingCount: 0, patientApproved: true, releasable: false }, includeEvents: true });
  // Formulation Master: document values, with one band edited by the doctor.
  const masters = ['3-4', '4-12', '12-70', '70+'].map((b) => {
    const m = defaultMasterFor(b);
    if (b === '4-12') { m.quantities.ghrit = { qty: 600, unit: 'ml' }; m.pendingNotes.mix = ''; Object.assign(m, { version: 2, source: 'edited', updatedAt: new Date().toISOString(), updatedByName: 'Dr Garg', note: 'Dr Garg 22 Oct: 1 चम्मच ghrit above 4 years', history: [{ at: new Date().toISOString(), version: 1, byName: 'Dr Garg', byRole: 'doctor', note: 'Dr Garg 22 Oct: 1 चम्मच ghrit above 4 years', changes: ['मेध्य घृत: 450 ml -> 600 ml', 'mix: pending point confirmed (note cleared)'] }] }); }
    return bandView(m);
  });
  const masterPayload = (user) => ({ success: true, bands: masters, items: MASTER_ITEMS, doses: MASTER_DOSES, splitDays: SPLIT_DAYS, pendingKeys: PENDING_KEYS, supplyOptions: SUPPLY_OPTIONS, canEdit: ['admin', 'doctor'].includes(user.role) });
  // Patient Improvement board: one patient, this month, built with the same helpers as the API.
  const improvementPayload = () => {
    const imp = require('../src/utils/patientImprovement');
    const at = (day) => new Date(Date.now() - day * 3600000).toISOString();
    const done = (id, d, extra) => ({ _id: id, dateTime: at(d), completedAt: at(d), status: 'completed', ...extra });
    const sessions = imp.collectSessions({ stages: [{ number: 1, followUps: [done('f1', 3, { outcome: 'problem', outcomeNote: 'Anger outbursts' })], familySessions: [done('s1', 2, { outcome: 'improvement', outcomeNote: 'Talks more at home' }), done('s2', 1, { outcome: 'improvement', outcomeNote: 'Eye contact improved' })] }] });
    const counts = imp.countOutcomes(sessions);
    return { success: true, month: imp.monthKeyOf(new Date()), kind: 'all', marketingRule: { minImprovements: 2 }, totals: { patients: 1, inMarketing: 1, ...counts }, total: 1, page: 1, pages: 1, limit: 25, rows: [{ id: PATIENT_ID, patientCode: 'MV-1001', patientName: 'Aarav Mehra', parentName: 'Rajnish', program: 'Autism / ADHD', assignedDoctorName: 'Dr Asha', isActive: true, counts, sessions, inMarketing: true, marketingMonth: imp.monthKeyOf(new Date()), qualifies: imp.qualifiesForMarketing(counts) }] };
  };
  const browser = await puppeteer.launch({ headless: true });
  try {
  // PO / patient pages as In Transit; job, queue and stocks pages as Medicine Department.
  const runs = [
    [{ _id: '507f1f77bcf86cd799439012', name: 'Transit Staff', role: 'in_transit' }, (sh) => !sh[0].startsWith('job') && !['stocks', 'explanations'].includes(sh[0]) && !sh[0].startsWith('master') && !sh[0].startsWith('admin-') && !sh[0].startsWith('pnb-') && sh[0] !== 'desk' && sh[0] !== 'followups'],
    [{ _id: '507f1f77bcf86cd799439013', name: 'Meena', role: 'medicine_department' }, (sh) => sh[0].startsWith('job') || sh[0] === 'stocks'],
    [{ _id: '507f1f77bcf86cd799439014', name: 'Dr Garg', role: 'doctor' }, (sh) => sh[0] === 'master-edit' || sh[0] === 'master'],
    [{ _id: PCC_ID, name: 'Dr Asha', role: 'assistant_doctor' }, (sh) => sh[0] === 'explanations' || sh[0] === 'followups'],
    [{ _id: '507f1f77bcf86cd799439016', name: 'Super Admin', role: 'admin' }, (sh) => sh[0].startsWith('admin-')],
    [{ _id: '507f1f77bcf86cd799439017', name: 'Counselor', role: 'post_counselor' }, (sh) => sh[0].startsWith('pnb-')],
    [{ _id: '507f1f77bcf86cd799439018', name: 'Pooja', role: 'receptionist' }, (sh) => sh[0] === 'desk'],
  ];
  for (const [user, pick] of runs) {
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
        else if (url.pathname === '/api/purchase-orders') data = { success: true, items, counts: { all: 2, pending: 2, verification: 1, medicine: 1, mine: { all: 1, pending: 1, verification: 1 } } };
        else if (/^\/api\/purchase-orders\/[a-f0-9]{24}$/.test(url.pathname)) data = { success: true, purchaseOrder: items.find((po) => url.pathname.endsWith(po.id)) };
        else if (url.pathname === `/api/patients/${PATIENT_ID}`) data = { success: true, patient: formattedPatient(raw) };
        else if (url.pathname === `/api/transit/${PATIENT_ID}/1`) data = { success: true, item: buildTransitCase(raw, raw.stages[0]), events: [] };
        else if (url.pathname === '/api/medicine-jobs/' + JOB_ID) data = { success: true, job: jobView };
        else if (url.pathname === '/api/medicine-jobs/' + JOB2_ID) data = { success: true, job: job2View };
        else if (url.pathname === '/api/medicine-jobs/' + JOB3_ID) data = { success: true, job: job3View };
        else if (url.pathname === '/api/medicine-jobs') data = { success: true, items: [{ id: JOB_ID, patientId: PATIENT_ID, patientName: raw.patientName, patientCode: raw.patientCode, phase: 1, poNumber: 'PO-4821', supplyLabel: '1+5: First 1 month', ageBandLabel: 'Above 4 - 12 years', readyByDate: jobView.readyByDate, status: 'open', currentStage: 5, currentLabel: STAGES[5].label, progress: jobView.progress, hold: null, urgency: jobView.urgency, totalStages: STAGES.length }] };
        else if (url.pathname === '/api/patients') data = { success: true, total: 2, page: 1, pages: 1, patients: [
          { id: PATIENT_ID, patientCode: 'A-3445', patientName: 'Amayra Gupta', category: 'autism_adhd', categoryLabel: 'Autism/ADHD', age: '4 years', number: '9590055856', guardianName: 'Ravi Kant Gupta', alternateNumber: '9598860070', consultationDate: new Date().toISOString(), createdAt: new Date().toISOString(), approvalStatus: 'pending', currentStage: 1, totalAmount: 42000 },
          { id: '6500000000000000000000e2', patientCode: 'R-3440', patientName: 'Riddhima Pandey', category: 'autism_adhd', categoryLabel: 'Autism/ADHD', age: '4 years', number: '9000000001', relativeName: 'Amit Pandey', consultationDate: null, createdAt: new Date().toISOString(), currentStage: 1 },
        ] };
        else if (url.pathname === '/api/stocks') data = { success: true, items: stocks.map(formatItem) };
        else if (url.pathname === '/api/formulation-master') data = masterPayload(user);
        else if (url.pathname === '/api/package-not-bought') data = { success: true, rows: [{ id: '6500000000000000000000d1', patientName: 'Kabir Sethi', parentName: 'Neha Sethi', fatherNumber: '9888877777', motherNumber: '', age: '5', program: 'Autism', reason: 'Fees', followUpDate: new Date().toISOString(), notes: '', followUps: [], status: 'open', createdByName: 'Counselor', createdAt: new Date().toISOString() }, { id: '6500000000000000000000d2', patientName: 'Ira Jain', parentName: 'Mohit Jain', fatherNumber: '9777766666', motherNumber: '', age: '6', program: 'ADHD', reason: '', followUpDate: null, notes: '', followUps: [], status: 'closed', closedAt: new Date().toISOString(), closedByName: 'Counselor', closeReason: 'Not interested', createdByName: 'Counselor', createdAt: new Date().toISOString() }], total: 2, page: 1, pages: 1, summary: { open: 1, overdue: 0, today: 1, upcoming: 0, noFollowUp: 0 } };
        else if (url.pathname === '/api/package-not-bought/6500000000000000000000d1') data = { success: true, row: { id: '6500000000000000000000d1', patientName: 'Kabir Sethi', parentName: 'Neha Sethi', fatherNumber: '9888877777', motherNumber: '', age: '5', program: 'Autism', reason: 'Fees', followUpDate: new Date().toISOString(), notes: '', followUps: [], status: 'open', createdByName: 'Counselor', createdAt: new Date().toISOString() } };
        else if (url.pathname === '/api/tasks/my-day') { const day = (d) => new Date(Date.now() + d * 86400000).toISOString(); data = { success: true, sections: [
          { page: '/admin/purchase-orders', count: 2, items: [{ page: '/admin/purchase-orders', key: 'po1', title: 'Aarav Mehra', detail: 'PO-4821 · Delivery & explanation scheduled', due: day(-3), href: '/admin/purchase-orders/x', waitingSince: true }, { page: '/admin/purchase-orders', key: 'po2', title: 'Riddhima Pandey', detail: 'PO-3 · Payment verified', due: day(0), href: '/admin/purchase-orders/y', waitingSince: true }] },
          { page: '/admin/payments', count: 1, items: [{ page: '/admin/payments', key: 'pay1', title: 'sanskriti', detail: 'S-3438 · Phase 1 · Rs 40,000 online', due: day(-1), href: '/admin/patients/z', waitingSince: true }] },
          { page: '/admin/courier', count: 1, items: [{ page: '/admin/courier', key: 'c1', title: 'Amaya', detail: 'A-3322 · Phase 1 · Released · dispatch it', due: day(2), href: '/admin/courier' }] },
        ] }; }
        else if (url.pathname === '/api/schedule/followups' || url.pathname === '/api/schedule/family-sessions') {
          // Entries around today in every status, as the schedule endpoint returns them.
          const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
          const e = (id, name, d, h, st, label) => ({ id, patientId: PATIENT_ID, patientName: name, dateTime: at(d, h), displayStatus: st, displayStatusLabel: label, stageLabel: 'Phase 1', followUpType: 'normal', notes: 'Dose check' });
          data = { success: true, rows: [{ assignee: 'Dr Asha', counts: {}, entries: [e('f1', 'Aarav Mehra', 0, 10, 'upcoming', 'Upcoming'), e('f2', 'Kabir Sethi', -2, 11, 'late', 'Late'), e('f3', 'Myra Bansal', -1, 16, 'done', 'Done'), e('f4', 'Ira Jain', 1, 12, 'upcoming', 'Upcoming'), e('f5', 'Arjun Rao', 2, 18, 'cancelled', 'Cancelled')] }] };
        }
        else if (url.pathname === '/api/reception/desk') {
          const c = (id, name, time, state, extra = {}) => ({ id, code: 'APT-' + id, bookedBy: 'Rohit', name, age: '5 yrs', guardian: 'Kavita', phone: '9811022334', city: 'Noida', category: 'Autism + ADHD', time, state, href: '/admin/appointment-management', ...extra });
          data = { success: true, date: '2026-10-23', lanes: { toAccept: [c('a1', 'Advik Rana', '13:00', 'pending_acceptance', { href: '/sales' })], expected: [c('a2', 'Pihu Gupta', '11:30', 'accepted', { acceptedBy: 'Pooja' })], inClinic: [c('a3', 'Neel Verma', '10:00', 'arrived', { arrivalTime: '10:02', patientId: 'N-231026-11' })], done: [c('a4', 'Om Tiwari', '12:00', 'not_coming', { note: 'travelling' })] }, totals: { total: 4, toAccept: 1, expected: 1, inClinic: 1, sentToPostCounselling: 0, notComing: 1, rescheduled: 0, collected: 3000, toVerify: 2 } };
        }
        else if (url.pathname === '/api/tasks/counts') data = { success: true, counts: { '/admin/purchase-orders': 2, '/admin/medicine-jobs': 1 } };
        else if (url.pathname === '/api/transit/explanations') { const ep = explainPatient(); data = { success: true, items: [buildTransitCase(ep, ep.stages[0])] }; }
        else if (url.pathname === '/api/stocks/ledger') data = { success: true, rows: [] };
        else if (url.pathname === '/api/patient-improvement') data = improvementPayload();
        else if (url.pathname === '/api/digital-marketing/reviews') { const imp = improvementPayload().rows[0]; data = { success: true, reviews: [{ id: 'r1', patientId: PATIENT_ID, patientCode: 'MV-1001', parentName: 'Rajnish', mobileNumber: '8800611900', patientName: 'Aarav Mehra', program: 'Autism / ADHD', programStartDate: '2026-09-01', latestFollowUpDate: '2026-10-26', improvementSummary: 'Eye contact improved', autoAdded: true, improvementMonth: imp.marketingMonth, monthImprovements: 2, monthProblems: 1, improvement: { totals: imp.counts, notes: imp.sessions.slice().reverse().map((x) => ({ id: x.id, kind: x.kind, kindLabel: x.kindLabel, stage: x.stage, date: x.date, month: x.month, outcome: x.outcome, note: x.outcomeNote, byName: 'Dr Asha' })) } }] }; }
        else if (url.pathname === '/api/purchase-orders/form') data = { success: true, definitions: purchase.definitions(), values: purchase.defaults({ record: null, registration: { category: 'autism_adhd', fatherName: 'Rajnish', fatherNumber: '8800611900' }, counselorName: 'Transit Staff', today: '2026-10-22' }), contacts: { fatherNumber: '8800611900' }, phase: 1 };
        return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(data) });
      }
      if (url.origin !== base || url.pathname.startsWith('/socket.io')) return request.abort();
      return request.continue();
    });
    const shots = [
      ['po-list', '/admin/purchase-orders', 'PO-7310'],
      ['myday', '/admin/my-day', 'Do next'],
      ['desk', '/admin', 'Review & accept'],
      ['po-verify', `/admin/purchase-orders/${items[1].id}`, 'Verify the PO details'],
      ['po-detail', `/admin/purchase-orders/${items[0].id}`, 'Medicine Department progress'],
      ['patient-overview', `/admin/patients/${PATIENT_ID}`, 'Care team'],
      ['patient-orders', `/admin/patients/${PATIENT_ID}?tab=orders`, 'PO-4821'],
      ['patient-phases', `/admin/patients/${PATIENT_ID}?tab=phases`, 'Treatment phases & payments'],
      ['patient-medicine', `/admin/patients/${PATIENT_ID}?tab=medicine`, 'Medicine supply & requests'],
      ['job-review', `/admin/medicine-jobs/${JOB_ID}`, 'Chit on pack'],
      ['job-edit', `/admin/medicine-jobs/${JOB2_ID}`, 'corrected by Meena'],
      ['job-doctor-wait', `/admin/medicine-jobs/${JOB3_ID}`, 'Please verify formulation from doctor'],
      ['job-queue', '/admin/medicine-jobs', 'Primary packing & chits'],
      ['stocks', '/admin/stocks', 'MEDHYA-GHRIT'],
      ['patients-list', '/admin/patients', 'Amayra Gupta'],
      ['master', '/admin/formulation-master', 'Document values'],
      ['master-edit', '/admin/formulation-master', 'Document values'],
      ['explanations', '/admin/medicine-explanations', 'Ready to explain'],
      ['followups', '/admin/followups', 'Aarav Mehra'],
      ['admin-po-revert', `/admin/purchase-orders/${items[0].id}`, 'Medicine Department progress'],
      ['pnb-list', '/admin/package-not-bought', 'Kabir Sethi'],
      ['pnb-detail', '/admin/package-not-bought/6500000000000000000000d1', 'Convert to Patient'],
      ['admin-improvement', '/admin/patient-improvement', 'Eye contact improved'],
      ['admin-digital-marketing', '/admin/digital-marketing', 'Talks more at home'],
      ['admin-job-revert', `/admin/medicine-jobs/${JOB_ID}`, 'Chit on pack'],
    ].filter(pick);
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
        if (name === 'job-review') {
          // Stage 4 (preparation) and stage 5 (chits) are reachable by clicking the rail; they must render too.
          // Step 0 shows the request as it came in and the patient's Records Room file.
          for (const [label, text] of [['0. Request received', 'Patient file (Records Room)'], ['1. Order accepted', 'Ready-by date is achievable'], ['2. Prescription & formulation check', '1 MONTH FORMULATION | PART 1'], ['3. Doctor formulation verification', 'Sheet is right'], ['4. Medicine preparation', 'drawn (sheet'], ['6. Pack QC', 'Opens after']]) {
            await page.evaluate((l) => [...document.querySelectorAll('nav button')].find((b) => b.innerText.includes(l)).click(), label.slice(3));
            try { await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, text); }
            catch { await page.screenshot({ path: path.join(output, `FAILED-job-${label.slice(0, 1)}-${width}.png`), fullPage: true }); throw new Error(`job stage "${label}" at ${width}: "${text}" not shown. Page says: ${(await page.evaluate(() => document.body.innerText)).slice(0, 500)} | errors: ${errors.join(' / ')}`); }
            await page.screenshot({ path: path.join(output, `job-${label.slice(0, 1)}-${width}.png`), fullPage: true });
          }
        }
        if (name === 'master' || name === 'master-edit') {
          // The edited band shows its version, history and the struck-through document value; the doctor can open the edit form.
          await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Above 4 - 12 years')).click());
          await page.waitForFunction(() => document.body.innerText.includes('edited by Dr Garg') && document.body.innerText.includes('450 ml -> 600 ml'), { timeout: 15000 });
          await page.screenshot({ path: path.join(output, `${name}-band-${width}.png`), fullPage: true });
          if (name === 'master-edit') {
            await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Edit master')).click());
            await page.waitForFunction(() => document.body.innerText.includes('Why is the master changed?'), { timeout: 15000 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `master edit form overflows at ${width}`);
            await page.screenshot({ path: path.join(output, `master-edit-form-${width}.png`), fullPage: true });
          } else {
          }
        }
        if (name === 'po-list') {
          // Orange task marks: sidebar count and the PO waiting for In Transit.
          // The desktop sidebar is closed by default and opens on hover, so hover it to read the counts.
          if (width >= 768) { await page.hover('aside.sidebar-compact'); await new Promise((resolve) => setTimeout(resolve, 600)); }
          const marks = await page.evaluate(() => ({ badge: [...document.querySelectorAll('nav a')].find((a) => a.innerText.includes('Purchase Orders'))?.querySelector('.bg-orange-500')?.innerText, rows: document.body.innerText.toUpperCase().split('YOUR ACTION').length - 1 }));
          if (width >= 768) assert.equal(marks.badge, '2', 'sidebar shows the orange task count');
          // Phones: the count is on the bottom tab bar instead.
          else assert.equal(await page.evaluate(() => document.querySelector('nav[aria-label="Quick navigation"] a[href="/admin/purchase-orders"] [class*="F97316"]')?.innerText), '2', 'phone tab bar shows the orange task count');
          assert.ok(marks.rows >= 1, 'the PO waiting for In Transit is marked');
        }
        if (name === 'po-verify') {
          // In Transit verifies a waiting PO and its payment from the Payments section itself.
          const text = await page.evaluate(() => document.body.innerText);
          if (text.includes('Pending')) assert.ok(text.includes('Verify PO & payment'), 'a pending payment on a waiting PO offers Verify PO & payment');
        }
        if (name === 'po-detail') {
          // The PO timeline carries the handover and treatment steps after "Medicine ready".
          const text = await page.evaluate(() => document.body.innerText);
          for (const step of ['Delivery & explanation scheduled', 'Full payment verified', 'PCC assigned', 'Medicine explained']) assert.ok(text.includes(step), `po-detail lacks step "${step}"`);
          // Several same-day UTRs in one payment: "+ Add another UTR" adds a row and the amount is their total.
          const canAdd = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Add payment'); if (b) b.click(); return !!b; });
          if (canAdd) {
            await page.waitForFunction(() => document.body.innerText.includes('Add another UTR (same day)'), { timeout: 15000 });
            await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Add another UTR')).click());
            await page.waitForFunction(() => document.body.innerText.includes('2 transfers'), { timeout: 15000 });
            const amounts = await page.$$('input[inputmode="decimal"][placeholder="0"]');
            for (const input of amounts.slice(-2)) await input.type('2000');
            await page.waitForFunction(() => document.body.innerText.includes('Rs 4,000'), { timeout: 15000 });
            await page.keyboard.press('Escape');
          }
        }
        if (name === 'explanations') {
          const text = await page.evaluate(() => document.body.innerText);
          for (const bit of ['Dr Asha', 'PO-4821', 'Collected at clinic', 'Complete explanation']) assert.ok(text.includes(bit), `explanations page lacks "${bit}"`);
        }
        if (name === 'pnb-list') {
          const text = await page.evaluate(() => document.body.innerText);
          for (const bit of ['Follow-up today', 'Close', 'Reopen', 'Not interested']) assert.ok(text.includes(bit), `package-not-bought list lacks "${bit}"`);
        }
        if (name === 'pnb-detail') {
          await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Close').click());
          await page.waitForFunction(() => document.body.innerText.includes('Close record'), { timeout: 15000 });
          await page.screenshot({ path: path.join(output, `pnb-detail-close-${width}.png`), fullPage: true });
        }
        if (name === 'po-verify') {
          // The timeline is a filter: "PO created" shows the patient and the PO, "Payment verified" the payments.
          const pick = (label) => page.evaluate((l) => [...document.querySelectorAll('button[aria-pressed]')].find((b) => b.innerText.trim().startsWith(l)).click(), label);
          await pick('PO created');
          await page.waitForFunction(() => /step 1 of 14/i.test(document.body.innerText), { timeout: 15000 });
          let text = await page.evaluate(() => document.body.innerText);
          assert.ok(text.includes('Patient approval') && /PO paper as filled/i.test(text), 'PO created step lacks the patient / PO details');
          assert.ok(!text.includes('Payments on this PO') && !text.includes('Verify the PO details'), 'PO created step shows other steps');
          await pick('Payment verified');
          await page.waitForFunction(() => document.body.innerText.includes('Payments on this PO'), { timeout: 15000 });
          text = await page.evaluate(() => document.body.innerText);
          assert.ok(!text.includes('Patient approval'), 'Payment step still shows the patient card');
          await page.screenshot({ path: path.join(output, `po-step-payment-${width}.png`), fullPage: true });
        }
        if (name === 'po-detail') {
          // A done step lists what was done in it, in green.
          await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].find((b) => b.innerText.trim().startsWith('PO details verified')).click());
          await page.waitForFunction(() => /done in this step/i.test(document.body.innerText), { timeout: 15000 });
          await page.screenshot({ path: path.join(output, `po-step-done-${width}.png`), fullPage: false });
        }
        if (name === 'admin-po-revert') {
          // Admin only: "Revert" sits on done timeline steps; the confirmation lists every step that goes back.
          const reverts = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Revert').length);
          assert.equal(reverts, 4, `Revert on the four done steps after "PO created", found ${reverts}`);
          await page.evaluate(() => { const li = [...document.querySelectorAll('li')].find((l) => l.innerText.startsWith('Medicine requested') && [...l.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Revert')); [...li.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Revert').click(); });
          await page.waitForFunction(() => document.body.innerText.includes('Why is this reverted?') && document.body.innerText.includes('Revert 2 steps'), { timeout: 15000 });
          await page.screenshot({ path: path.join(output, `admin-po-revert-modal-${width}.png`), fullPage: true });
        }
        if (name === 'admin-job-revert') {
          await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.innerText.includes('Medicine preparation')).click());
          await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Revert'), { timeout: 15000 });
          await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Revert').click());
          await page.waitForFunction(() => document.body.innerText.includes('Revert to this stage'), { timeout: 15000 });
          await page.screenshot({ path: path.join(output, `admin-job-revert-${width}.png`), fullPage: true });
        }
        if (name === 'job-edit') {
          // The Medicine Department reads the corrected sheet but cannot edit it (doctor / admin only).
          assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Edit sheet'))), false, 'Medicine Department sees "Edit sheet"');
          assert.equal(await page.evaluate(() => document.body.innerText.includes('Doctor approval / formula reference')), false, 'the formula reference field is still asked');
        }
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
    assert.deepEqual(errors, [], user.role + ' runtime errors');
    await page.close();
  }
    console.log('Purchase order, patient, medicine job and stocks pages: desktop/mobile render passed');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
