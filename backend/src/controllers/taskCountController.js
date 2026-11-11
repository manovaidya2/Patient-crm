const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');
const StockItem = require('../models/StockItem');
const Enquiry = require('../models/Enquiry');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { cached } = require('../utils/readCache');
const { loadPoViews } = require('./purchaseOrderController');
const { jobActionBy } = require('./medicineJobController');
const { handedOverRequestIds, activeJobRequestIds, madeStillPending } = require('../utils/legacyHandover');
const { explanationOwner } = require('./transitController');

// Open work per sidebar page for the signed-in role (the orange badges). Every number is derived from the current state
// of the records, so it drops by itself as soon as the work is done - nothing to "mark as read". Where a page already
// has a list endpoint, that same handler is run, so the badge always matches what the page lists.
const { ADMIN, DOCTOR, MANAGER, POST_COUNSELOR, IN_TRANSIT, MEDICINE_DEPARTMENT, ASSISTANT_DOCTOR } = ROLES;
const PAGES = {
  '/admin/purchase-orders': [ADMIN, DOCTOR, POST_COUNSELOR, IN_TRANSIT, MANAGER],
  '/admin/patient-approvals': [ADMIN, DOCTOR, IN_TRANSIT, MANAGER],
  '/admin/payments': [ADMIN, DOCTOR, IN_TRANSIT, MANAGER],
  '/admin/accounts/consultations': [ADMIN, DOCTOR, ROLES.RECEPTIONIST, MANAGER],
  '/admin/accounts/refunds': [ADMIN, DOCTOR, IN_TRANSIT, MANAGER],
  '/admin/courier': [ADMIN, IN_TRANSIT, MANAGER],
  '/admin/self-pickup-schedule': [ADMIN, IN_TRANSIT, MANAGER],
  '/admin/transit-follow-ups': [ADMIN, IN_TRANSIT, MANAGER],
  '/admin/ready-not-delivered': [ADMIN, IN_TRANSIT, MANAGER, DOCTOR],
  // Expenses & vouchers: what each one has to do (make a voucher / approve / settle).
  '/admin/all-expenses': [ADMIN, DOCTOR],
  '/admin/clinic-expenses': [ROLES.RECEPTIONIST, MANAGER],
  '/admin/medicine-purchases': [MEDICINE_DEPARTMENT, MANAGER],
  '/admin/treatment-papers': [ADMIN, ASSISTANT_DOCTOR, MANAGER],
  '/admin/final-check': [ADMIN, ASSISTANT_DOCTOR, MANAGER],
  '/admin/medicine-requests': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT, MANAGER],
  '/admin/medicine-jobs': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT, MANAGER],
  '/admin/medicine-made': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT, MANAGER],
  '/admin/stocks': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT, MANAGER],
  '/admin/medicine-explanations': [ADMIN, ASSISTANT_DOCTOR, MANAGER],
  '/admin/followups': [MANAGER, ASSISTANT_DOCTOR],
  // Patient queries the PCC raised that the doctor has not answered yet.
  '/admin/request-for-advice': [ADMIN, DOCTOR],
  // Patient queries: doctor's answers to send, follow-ups due, satisfied ones to mark solved.
  '/admin/patient-queries': [ASSISTANT_DOCTOR, MANAGER],
  '/admin/family-sessions': [MANAGER, ASSISTANT_DOCTOR],
  '/admin/post-counseling-patients': [ADMIN, POST_COUNSELOR, DOCTOR, MANAGER],
  '/admin/package-not-bought': [ADMIN, POST_COUNSELOR, MANAGER],
  '/admin/enquiries': Object.values(ROLES).filter((role) => role !== ROLES.HR),
  '/admin/team-chat': Object.values(ROLES).filter((role) => role !== ROLES.HR),
};

// Whose steps count as this person's: the Manager has the Admin's.
const stepRole = (user) => (isAdminLike(user) ? ROLES.ADMIN : user.role);

const allRequests = (stage) => [...(stage.medicineRequests || []), ...(stage.medicineRequest?.status ? [stage.medicineRequest] : [])];

// Runs an existing list handler as this user and returns its JSON.
const callHandler = (handler, user, query = {}) => new Promise((resolve, reject) => {
  const res = { status() { return this; }, json: resolve };
  Promise.resolve(handler({ user, query, params: {}, body: {} }, res, reject)).catch(reject);
});

// Medicine requests of every phase whose status is one of `statuses`.
const countRequests = async (statuses, extra = () => true) => {
  const patients = await Patient.find({ $or: [{ 'stages.medicineRequest.status': { $in: statuses } }, { 'stages.medicineRequests.status': { $in: statuses } }] })
    .select('stages.medicineRequest.status stages.medicineRequest.requestId stages.medicineRequest.courier.status stages.medicineRequests.status stages.medicineRequests.requestId stages.medicineRequests.courier.status').lean();
  return patients.reduce((sum, p) => sum + (p.stages || []).reduce((s, st) => s + allRequests(st).filter((r) => statuses.includes(r.status) && extra(r)).length, 0), 0);
};

// Late / due-today schedule reminders of the role (same rules as the reminder bell).
const scheduleReminders = async (user) => {
  const { getScheduleReminders } = require('./patientController');
  const data = await callHandler(getScheduleReminders, user, {});
  return data.reminders || [];
};

const COUNTERS = {
  // POs whose current step is this role's (verify, request, schedule, payment, handover, PCC, correction, release...).
  async '/admin/purchase-orders'(user) {
    return (await loadPoViews()).filter((po) => po.actionBy.includes(stepRole(user))).length;
  },
  async '/admin/patient-approvals'() {
    return Patient.countDocuments({ $or: [{ approvalStatus: 'pending' }, { 'stages.payments.approvalStatus': 'pending' }] });
  },
  // Payments waiting for verification (the Payments page opens on "pending").
  async '/admin/payments'() {
    const rows = await Patient.aggregate([
      { $match: { 'stages.payments.approvalStatus': 'pending' } },
      { $unwind: '$stages' }, { $unwind: '$stages.payments' },
      { $match: { 'stages.payments.approvalStatus': 'pending' } }, { $count: 'n' },
    ]);
    return rows[0]?.n || 0;
  },
  // Consultation receipts awaiting verification (the Consultation Ledger's "pending" filter).
  async '/admin/accounts/consultations'() { return ConsultationReceipt.countDocuments({ status: 'pending' }); },
  // Refunds initiated but not paid yet.
  async '/admin/accounts/refunds'() {
    const rows = await Patient.aggregate([
      { $match: { 'stages.payments.refunds.status': 'initiated' } },
      { $unwind: '$stages' }, { $unwind: '$stages.payments' }, { $unwind: '$stages.payments.refunds' },
      { $match: { 'stages.payments.refunds.status': 'initiated' } }, { $count: 'n' },
    ]);
    return rows[0]?.n || 0;
  },
  // In Transit's follow-up calls whose time has come (due today or late).
  async '/admin/transit-follow-ups'(user) {
    const { listFollowUps } = require('./transitController');
    const data = await callHandler(listFollowUps, user, { status: 'open' });
    return (data.rows || []).filter((r) => r.status !== 'upcoming').length;
  },
  // Expenses: Admin / Doctor - vouchers to approve and approved money still owed; Reception / Medicine Department (and
  // the Manager) - their entries without a voucher, or sent back.
  async '/admin/all-expenses'(user) { return (await require('./expenseController').openWorkFor(user)).length; },
  async '/admin/clinic-expenses'(user) { return (await require('./expenseController').openWorkFor(user)).filter((e) => e.kind === 'clinic').length; },
  async '/admin/medicine-purchases'(user) { return (await require('./expenseController').openWorkFor(user)).filter((e) => e.kind === 'medicine').length; },
  // Medicines made but not delivered yet.
  async '/admin/ready-not-delivered'() {
    const { readyNotDelivered } = require('./purchaseOrderController');
    return (await readyNotDelivered()).length;
  },
  // Porter / courier scheduled, still to be dispatched or confirmed delivered.
  async '/admin/courier'() {
    const { courierHandovers } = require('./purchaseOrderController');
    return (await courierHandovers()).filter((r) => r.section === 'pending' && r.mode !== 'pickup').length;
  },
  // Kits waiting for their treatment papers (fulfilment step 9), for the PCC the admin chose.
  async '/admin/treatment-papers'(user) { return require('./treatmentPaperController').pendingPaperCount(user); },
  // Parcels waiting for the final verification check (step 11), for the PCC the admin chose.
  async '/admin/final-check'(user) { return require('./treatmentPaperController').pendingPaperCount(user, 'final'); },
  // Self pickups scheduled, still to be collected.
  async '/admin/self-pickup-schedule'() {
    const { courierHandovers } = require('./purchaseOrderController');
    return (await courierHandovers()).filter((r) => r.section === 'pending' && r.mode === 'pickup').length;
  },
  // Requests to accept or to make.
  async '/admin/medicine-requests'() { return countRequests(['requested', 'in_process']); },
  // Made, waiting for packaging / release.
  // Old-flow medicine (made without a fulfilment job, or already handed over) is complete, not pending.
  async '/admin/medicine-made'() { const active = await activeJobRequestIds(); return countRequests(['made'], (r) => madeStillPending(r, active)); },
  async '/admin/medicine-jobs'(user) {
    const jobs = await MedicineJob.find({ status: { $in: ['open', 'ready'] } }).select('status currentStage hold requestId purchaseOrder poNumber').lean();
    const handedOver = await handedOverRequestIds(jobs.map((j) => j.requestId));
    return jobs.filter((j) => jobActionBy(j, handedOver).includes(stepRole(user))).length;
  },
  // Stock items at or below their minimum level (or expired).
  async '/admin/stocks'() {
    const items = await StockItem.find({ isActive: { $ne: false } }).select('currentStock minLevel expiryDate').lean();
    const now = new Date();
    return items.filter((i) => Number(i.currentStock || 0) <= Number(i.minLevel || 0) || (i.expiryDate && new Date(i.expiryDate) < now)).length;
  },
  // Explanations assigned (to this PCC) and not completed yet.
  async '/admin/medicine-explanations'(user) {
    // $type (not $ne: null): on an array path $ne would demand that *every* phase has the field.
    const patients = await Patient.find({ isActive: { $ne: false }, 'stages.transit.explanationScheduledAt': { $type: 'date' } })
      .select('assignedDoctor stages.transit').lean();
    let n = 0;
    for (const patient of patients) for (const stage of patient.stages || []) {
      const t = stage.transit || {};
      if (!t.explanationScheduledAt || t.activatedAt || t.removedAt || !(t.assignedAt || t.explanationDoctor)) continue;
      if (user.role === ADMIN || explanationOwner(patient, stage) === String(user._id)) n += 1;
    }
    return n;
  },
  async '/admin/request-for-advice'() {
    return require('../models/AdviceRequest').countDocuments({ status: 'requested', resolvedAt: null });
  },
  async '/admin/patient-queries'(user) { return (await require('./adviceController').pccQueryWork(user)).length; },
  // Reminder types are 'followup' and 'family_session' (see collectScheduleReminders).
  async '/admin/followups'(user) { return (await scheduleReminders(user)).filter((r) => r.type === 'followup').length; },
  async '/admin/family-sessions'(user) { return (await scheduleReminders(user)).filter((r) => r.type === 'family_session').length; },
  // Patients sent to post counselling whose outcome is not decided yet (scoped to the counselor, like the page).
  async '/admin/post-counseling-patients'(user) {
    const { listPostCounselingPatients } = require('./receptionFlowController');
    const data = await callHandler(listPostCounselingPatients, user, {});
    return (data.patients || []).length;
  },
  // "Package not bought" patients still open (not converted) - the same rows the page lists.
  async '/admin/package-not-bought'() {
    return PackageNotBoughtPatient.countDocuments({ status: { $nin: ['converted', 'closed'] } });
  },
  // Enquiries still open or in progress, exactly as the page lists them by default: admin sees all, everyone else
  // the ones assigned to them. Soft-deleted entries never count.
  // Team chat: threads with messages this person has not read yet (the admin: only threads the admin is in).
  async '/admin/team-chat'(user) {
    const TeamChat = require('../models/TeamChat');
    const { unreadFor } = require('./teamChatController');
    const chats = await TeamChat.find({ participants: user._id, status: { $ne: 'closed' } }).select('clearedBy messages.sender messages.readBy messages.createdAt').lean();
    return chats.filter((c) => unreadFor(c, user) > 0).length;
  },
  async '/admin/enquiries'(user) {
    const filter = { deletedAt: null, status: { $in: ['open', 'in_progress'] } };
    if (user.role !== ADMIN) Object.assign(filter, { participants: user._id, assignedTo: user._id });
    return Enquiry.countDocuments(filter);
  },
};

// @route GET /api/tasks/counts   -> { counts: { '/admin/purchase-orders': 3, ... } }
const getTaskCounts = asyncHandler(async (req, res) => {
  const pages = Object.keys(PAGES).filter((page) => PAGES[page].includes(req.user.role));
  // One failing counter must not hide the others.
  const values = await Promise.all(pages.map((page) => countOf(page, req.user).catch((error) => { console.error(`Task count ${page}: ${error.message}`); return 0; })));
  res.json({ success: true, counts: Object.fromEntries(pages.map((page, i) => [page, values[i]])) });
});

// Badges, My day, the reminder bell and Team pending all ask for the same lists; each is worked out once and shared
// (see utils/readCache: emptied by any save). A list is the same for everyone, for one role, or for one person.
// Team Chat and Enquiries are cheap and change when read, so they are always worked out fresh.
const PER_PERSON = new Set(['/admin/patient-queries', '/admin/final-check', '/admin/treatment-papers', '/admin/medicine-explanations', '/admin/followups', '/admin/family-sessions', '/admin/post-counseling-patients']);
const PER_ROLE = new Set(['/admin/purchase-orders', '/admin/medicine-jobs']);
const UNCACHED = new Set(['/admin/team-chat', '/admin/enquiries']);
const scopeOf = (page, user) => (PER_PERSON.has(page) ? `u:${user._id}:${user.role}` : PER_ROLE.has(page) ? `r:${stepRole(user)}` : 'all');
const shared = (kind, page, user, fn) => (UNCACHED.has(page) ? fn() : cached(`${kind}|${page}|${scopeOf(page, user)}`, fn));
const countOf = (page, user) => shared('count', page, user, () => COUNTERS[page](user));

module.exports = { getTaskCounts, PAGES, COUNTERS, stepRole, shared, countOf };
