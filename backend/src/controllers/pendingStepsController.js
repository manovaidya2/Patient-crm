// Pending work step by step: instead of one "Medicine Requests" / "Fulfilment Queue" card with a total, one card
// (or list section) per step that has work waiting - the step's name, who it is pending with, and how many.
// Used by "Your pending work" (GET /tasks/steps), My day, the bell and Team pending / Control Room.
const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, ROLE_LABELS } = require('../constants/roles');
const { PAGES, stepRole, shared } = require('./taskCountController');
const { jobActionBy } = require('./medicineJobController');
const { handedOverRequestIds } = require('../utils/legacyHandover');
const { releaseView } = require('../utils/medicineRelease');
const { STAGES } = require('../utils/medicineJobFlow');

const JOBS = '/admin/medicine-jobs';
const REQUESTS = '/admin/medicine-requests';
const STEP_PAGES = new Set([JOBS, REQUESTS]);
const withLabels = (roles) => [...new Set((roles || []).filter((r) => r !== ROLES.ADMIN))].map((r) => ROLE_LABELS[r] || r).join(', ');

// A fulfilment stage as a step: "<n>. <label>", pending with the roles that can do it; opens the queue on that step.
const stageStep = (index, roles) => {
  const stage = STAGES[index];
  return { key: `stage-${index}`, stage: index, title: `${stage?.n || index + 1}. ${stage?.label || 'Step'}`, roles, order: index + 1, href: `${JOBS}?step=${index}&mine=1` };
};
const otherStep = (key, title, roles, order) => ({ key, title, roles, order, href: `${JOBS}?mine=1` });

// Where one fulfilment job waits: { key, title, roles, order, href } (key keeps jobs of the same step together).
const jobStep = (job, actionBy, user) => {
  const release = releaseView(job);
  if (job.hold?.active) return otherStep('hold', 'On hold — question to answer', actionBy, 90);
  if (job.returned?.at) return otherStep('returned', 'Sent back — correct the request', [ROLES.IN_TRANSIT], 0);
  if (job.boxReceipt?.requestedAt && !job.boxReceipt.receivedAt && user.role === ROLES.ASSISTANT_DOCTOR) return otherStep('box', 'Receive the medicine box', [ROLES.ASSISTANT_DOCTOR], 95);
  if (job.status === 'ready' && release) {
    if (release.needsTransitAction) return otherStep('release-transit', release.overdue ? 'Medicine release overdue — cancel or extend' : 'Request medicine release', [ROLES.IN_TRANSIT], 80);
    if (release.state === 'requested') return otherStep('release-requested', 'Release requested — check payment and accept', [ROLES.MEDICINE_DEPARTMENT], 81);
    if (release.state === 'accepted') return otherStep('release-accepted', 'Release the medicine', [ROLES.MEDICINE_DEPARTMENT], 82);
  }
  return stageStep(job.currentStage || 0, actionBy);
};

// Medicine requests by where they stand: to accept, being prepared.
const REQUEST_STEPS = {
  requested: { title: 'Accept the medicine request', order: 1 },
  in_process: { title: 'Prepare the medicine (being made)', order: 2 },
};
const requestStep = (status) => (REQUEST_STEPS[status]
  ? { key: status, title: REQUEST_STEPS[status].title, roles: [ROLES.MEDICINE_DEPARTMENT], order: REQUEST_STEPS[status].order, href: `${REQUESTS}?status=${status}` }
  : null);

// One list section of a step page ({ page, count, items, ... } whose items carry `step`) as one section per step:
// { ...section, step, title, pendingWith, href, count, items }. Any other section is returned as it is.
const splitSteps = (section) => {
  const items = section.items || [];
  if (!STEP_PAGES.has(section.page) || !items.length || !items.every((i) => i.step)) return [section];
  const groups = new Map();
  items.forEach((i) => {
    const group = groups.get(i.step.key) || { step: i.step, roles: new Set(), items: [] };
    group.items.push(i);
    (i.step.roles || []).forEach((r) => group.roles.add(r));
    groups.set(i.step.key, group);
  });
  return [...groups.values()].sort((a, b) => a.step.order - b.step.order).map((g) => ({
    ...section, step: g.step.key, title: g.step.title, pendingWith: withLabels([...g.roles]) || 'Admin', href: g.step.href, count: g.items.length, items: g.items,
    ...(section.byPerson ? { byPerson: section.byPerson.map((p) => ({ ...p, count: g.items.filter((i) => (i.people || []).includes(p.name)).length })).filter((p) => p.count) } : {}),
  }));
};
const cards = (page, items) => splitSteps({ page, items }).filter((s) => s.step)
  .map((s) => ({ page, key: s.step, title: s.title, pendingWith: s.pendingWith, count: s.count, href: s.href }));

const fulfilmentSteps = async (user) => {
  const finalPcc = user.role === ROLES.ASSISTANT_DOCTOR ? await require('./treatmentPaperController').getKindPcc('final') : null;
  const jobs = await MedicineJob.find(await require('../utils/closedPatients').withoutClosedPatients({ status: { $ne: 'cancelled' }, $or: [{ status: { $in: ['open', 'ready'] } }, { 'boxReceipt.requestedAt': { $ne: null }, 'boxReceipt.receivedAt': null }] }))
    .select('status currentStage hold returned requestId purchaseOrder poNumber boxReceipt releaseRequest stages.key stages.doneAt formulation.custom').lean();
  const handedOver = await handedOverRequestIds(jobs.map((j) => j.requestId));
  const items = [];
  jobs.forEach((job) => {
    const actionBy = jobActionBy(job, handedOver, { user, finalPcc });
    if (actionBy.includes(stepRole(user))) items.push({ step: jobStep(job, actionBy, user) });
  });
  return cards(JOBS, items);
};

const requestSteps = async () => {
  const statuses = Object.keys(REQUEST_STEPS);
  const patients = await Patient.find({ isActive: { $ne: false }, $or: [{ 'stages.medicineRequest.status': { $in: statuses } }, { 'stages.medicineRequests.status': { $in: statuses } }] })
    .select('stages.medicineRequest.status stages.medicineRequest.requestId stages.medicineRequests.status stages.medicineRequests.requestId').lean();
  const items = [];
  patients.forEach((p) => (p.stages || []).forEach((st) => {
    const seen = new Set();
    [...(st.medicineRequests || []), ...(st.medicineRequest?.status ? [st.medicineRequest] : [])].forEach((r) => {
      const key = r.requestId || 'legacy';
      if (seen.has(key) || !statuses.includes(r.status)) return;
      seen.add(key);
      items.push({ step: requestStep(r.status) });
    });
  }));
  return cards(REQUESTS, items);
};

// @route GET /api/tasks/steps  - the step cards for the pages this role works (fulfilment, medicine requests).
const getPendingSteps = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const steps = [];
  if (PAGES[JOBS]?.includes(role)) steps.push(...await shared('steps', JOBS, req.user, () => fulfilmentSteps(req.user)));
  if (PAGES[REQUESTS]?.includes(role)) steps.push(...await shared('steps', REQUESTS, req.user, requestSteps));
  res.json({ success: true, steps });
});

module.exports = { getPendingSteps, jobStep, stageStep, requestStep, splitSteps, fulfilmentSteps, requestSteps };
