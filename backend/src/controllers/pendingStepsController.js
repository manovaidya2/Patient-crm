// Pending work step by step: instead of one "Medicine Requests" / "Fulfilment Queue" card with a total, one card
// (or list section) per step that has work waiting - the step's name, who it is pending with, and how many.
// Used by "Your pending work" (GET /tasks/steps), My day, the bell and Team pending / Control Room.
const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, ROLE_LABELS, isAdminLike } = require('../constants/roles');
const { PAGES, stepRole, shared } = require('./taskCountController');
const { jobActionBy } = require('./medicineJobController');
const { handedOverRequestIds } = require('../utils/legacyHandover');
const { releaseView } = require('../utils/medicineRelease');
const { STAGES } = require('../utils/medicineJobFlow');

const JOBS = '/admin/medicine-jobs';
const REQUESTS = '/admin/medicine-requests';
const MADE = '/admin/medicine-made';
const STEP_PAGES = new Set([JOBS, REQUESTS, MADE]);
// The Doctor, Admin and Manager see everyone's steps (each says whose it is); everyone else sees only their own.
const seesAll = (user) => isAdminLike(user) || user?.role === ROLES.DOCTOR;
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

// Medicine requests without a running fulfilment job (old flow): to accept, being prepared.
const REQUEST_STEPS = {
  requested: { title: 'Accept the medicine request', order: 1 },
  in_process: { title: 'Prepare the medicine (being made)', order: 2 },
};
const requestStep = (status) => (REQUEST_STEPS[status]
  ? { key: status, title: REQUEST_STEPS[status].title, roles: [ROLES.MEDICINE_DEPARTMENT], order: REQUEST_STEPS[status].order, href: `${REQUESTS}?status=${status}&mine=1` }
  : null);

const JOB_FIELDS = 'status currentStage hold returned requestId purchaseOrder poNumber boxReceipt releaseRequest stages.key stages.doneAt formulation.custom';
const finalPccOf = (user) => (user.role === ROLES.ASSISTANT_DOCTOR ? require('./treatmentPaperController').getKindPcc('final') : null);

// A medicine request (or a made medicine waiting for release) is worked in its fulfilment job, so it waits on that job's
// step - whose action it really is (a request "being made" may be waiting on the Doctor's formulation). Returns
// stepOf(request) -> the step, with `onFulfilment` when this person does that step: it is then counted once, under
// Fulfilment, not again here. A request without a running job keeps its own step (old flow).
const requestStepper = async (user) => {
  const jobs = await MedicineJob.find({ status: { $in: ['open', 'ready'] } }).select(JOB_FIELDS).lean();
  const handedOver = await handedOverRequestIds(jobs.map((j) => j.requestId));
  const finalPcc = await finalPccOf(user);
  const byRequest = new Map(jobs.map((j) => [String(j.requestId), j]));
  const role = stepRole(user);
  return (request) => {
    const job = request?.requestId ? byRequest.get(String(request.requestId)) : null;
    if (!job) return requestStep(request?.status);
    const actionBy = jobActionBy(job, handedOver, { user, finalPcc });
    return { ...jobStep(job, actionBy, user), onFulfilment: actionBy.includes(role), jobId: String(job._id) };
  };
};

// One list section of a step page ({ page, count, items, ... } whose items carry `step`) as one section per step:
// { ...section, step, title, pendingWith, mine, href, count, items }. `mine`: the step is this role's own action;
// otherwise it is shown as waiting on someone else (who is in `pendingWith`). Any other section is returned as it is.
const splitSteps = (section, role = '') => {
  const items = section.items || [];
  if (!STEP_PAGES.has(section.page)) return [section];
  // The items are the truth here (a request done in Fulfilment is not listed twice): none left, no section.
  if (!items.length) return [];
  if (!items.every((i) => i.step)) return [section];
  const groups = new Map();
  items.forEach((i) => {
    const group = groups.get(i.step.key) || { step: i.step, roles: new Set(), items: [] };
    group.items.push(i);
    (i.step.roles || []).forEach((r) => group.roles.add(r));
    groups.set(i.step.key, group);
  });
  return [...groups.values()].sort((a, b) => a.step.order - b.step.order).map((g) => {
    const mine = !role || role === ROLES.ADMIN || g.roles.has(role);
    return {
      ...section, step: g.step.key, title: g.step.title, pendingWith: withLabels([...g.roles]) || 'Admin', mine,
      // Someone else's step opens the whole list of that step, not only "mine".
      href: mine ? g.step.href : g.step.href.replace(/[?&]mine=1$/, ''), count: g.items.length, items: g.items,
      ...(section.byPerson ? { byPerson: section.byPerson.map((p) => ({ ...p, count: g.items.filter((i) => (i.people || []).includes(p.name)).length })).filter((p) => p.count) } : {}),
    };
  });
};
const cards = (page, items, role) => splitSteps({ page, items }, role).filter((s) => s.step)
  .map((s) => ({ page, key: s.step, title: s.title, pendingWith: s.pendingWith, mine: s.mine, count: s.count, href: s.href }));

const fulfilmentSteps = async (user) => {
  const finalPcc = await finalPccOf(user);
  const jobs = await MedicineJob.find(await require('../utils/closedPatients').withoutClosedPatients({ status: { $ne: 'cancelled' }, $or: [{ status: { $in: ['open', 'ready'] } }, { 'boxReceipt.requestedAt': { $ne: null }, 'boxReceipt.receivedAt': null }] }))
    .select(JOB_FIELDS).lean();
  const handedOver = await handedOverRequestIds(jobs.map((j) => j.requestId));
  const items = [];
  jobs.forEach((job) => {
    const actionBy = jobActionBy(job, handedOver, { user, finalPcc });
    if (actionBy.includes(stepRole(user))) items.push({ step: jobStep(job, actionBy, user) });
  });
  return cards(JOBS, items, stepRole(user));
};

// Every request in these statuses once (a phase may hold the same request in both request lists).
const openRequests = async (statuses) => {
  const patients = await Patient.find({ isActive: { $ne: false }, $or: [{ 'stages.medicineRequest.status': { $in: statuses } }, { 'stages.medicineRequests.status': { $in: statuses } }] })
    .select('stages.medicineRequest stages.medicineRequests').lean();
  const out = [];
  patients.forEach((p) => (p.stages || []).forEach((st) => {
    const seen = new Set();
    [...(st.medicineRequests || []), ...(st.medicineRequest?.status ? [st.medicineRequest] : [])].forEach((r) => {
      const key = r.requestId || 'legacy';
      if (seen.has(key) || !statuses.includes(r.status)) return;
      seen.add(key);
      out.push(r);
    });
  }));
  return out;
};

// Requests to accept / being made, by the step each waits on (the ones this person does in Fulfilment are left out).
const requestSteps = async (user) => {
  const [requests, stepOf] = await Promise.all([openRequests(Object.keys(REQUEST_STEPS)), requestStepper(user)]);
  const items = requests.map((r) => ({ step: stepOf(r) })).filter((i) => i.step && !i.step.onFulfilment);
  return cards(REQUESTS, items, stepRole(user));
};

// Made medicines waiting for release, by whose step the release is (In Transit to request it, the Medicine Department
// to accept and release it); the ones this person does in Fulfilment are left out.
const madeSteps = async (user) => {
  const { activeJobRequestIds, madeStillPending } = require('../utils/legacyHandover');
  const [requests, stepOf, active] = await Promise.all([openRequests(['made']), requestStepper(user), activeJobRequestIds()]);
  const items = requests.filter((r) => madeStillPending(r, active)).map((r) => ({ step: stepOf(r) })).filter((i) => i.step && !i.step.onFulfilment);
  return cards(MADE, items, stepRole(user));
};

// @route GET /api/tasks/steps  - the step cards for the pages this role works (fulfilment, medicine requests, made).
// Each card says whose step it is; `mine: false` cards are someone else's (shown apart, not counted as this person's).
const getPendingSteps = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const steps = [];
  if (PAGES[JOBS]?.includes(role)) steps.push(...await shared('steps', JOBS, req.user, () => fulfilmentSteps(req.user)));
  if (PAGES[REQUESTS]?.includes(role)) steps.push(...await shared('steps', REQUESTS, req.user, () => requestSteps(req.user)));
  if (PAGES[MADE]?.includes(role)) steps.push(...await shared('steps', MADE, req.user, () => madeSteps(req.user)));
  res.json({ success: true, steps: seesAll(req.user) ? steps : steps.filter((s) => s.mine) });
});

module.exports = { getPendingSteps, seesAll, jobStep, stageStep, requestStep, requestStepper, splitSteps, fulfilmentSteps, requestSteps, madeSteps, STEP_PAGES };
