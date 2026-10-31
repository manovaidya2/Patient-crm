const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');
const StockItem = require('../models/StockItem');
const Enquiry = require('../models/Enquiry');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
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
  '/admin/patient-approvals': [ADMIN, DOCTOR, IN_TRANSIT],
  '/admin/payments': [ADMIN, DOCTOR, IN_TRANSIT],
  '/admin/accounts/consultations': [ADMIN, DOCTOR, ROLES.RECEPTIONIST],
  '/admin/accounts/refunds': [ADMIN, DOCTOR, IN_TRANSIT],
  '/admin/courier': [ADMIN, IN_TRANSIT],
  '/admin/medicine-requests': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT],
  '/admin/medicine-jobs': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT],
  '/admin/medicine-made': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT],
  '/admin/stocks': [ADMIN, DOCTOR, MEDICINE_DEPARTMENT],
  '/admin/medicine-explanations': [ADMIN, ASSISTANT_DOCTOR],
  '/admin/followups': [MANAGER, ASSISTANT_DOCTOR],
  '/admin/family-sessions': [MANAGER, ASSISTANT_DOCTOR],
  '/admin/post-counseling-patients': [ADMIN, POST_COUNSELOR, DOCTOR, MANAGER],
  '/admin/package-not-bought': [ADMIN, POST_COUNSELOR],
  '/admin/enquiries': Object.values(ROLES).filter((role) => role !== ROLES.HR),
  '/admin/team-chat': Object.values(ROLES).filter((role) => role !== ROLES.HR),
};

const allRequests = (stage) => [...(stage.medicineRequests || []), ...(stage.medicineRequest?.status ? [stage.medicineRequest] : [])];

// Runs an existing list handler as this user and returns its JSON.
const callHandler = (handler, user, query = {}) => new Promise((resolve, reject) => {
  const res = { status() { return this; }, json: resolve };
  Promise.resolve(handler({ user, query, params: {}, body: {} }, res, reject)).catch(reject);
});

// Medicine requests of every phase whose status is one of `statuses`.
const countRequests = async (statuses, extra = () => true) => {
  const patients = await Patient.find({ $or: [{ 'stages.medicineRequest.status': { $in: statuses } }, { 'stages.medicineRequests.status': { $in: statuses } }] })
    .select('stages.medicineRequest stages.medicineRequests').lean();
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
    return (await loadPoViews()).filter((po) => po.actionBy.includes(user.role)).length;
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
  // Released medicine still to be dispatched or confirmed delivered.
  async '/admin/courier'() {
    const { courierHandovers } = require('./purchaseOrderController');
    return (await courierHandovers()).filter((r) => r.section === 'pending').length;
  },
  // Requests to accept or to make.
  async '/admin/medicine-requests'() { return countRequests(['requested', 'in_process']); },
  // Made, waiting for packaging / release.
  // Old-flow medicine (made without a fulfilment job, or already handed over) is complete, not pending.
  async '/admin/medicine-made'() { const active = await activeJobRequestIds(); return countRequests(['made'], (r) => madeStillPending(r, active)); },
  async '/admin/medicine-jobs'(user) {
    const jobs = await MedicineJob.find({ status: { $in: ['open', 'ready'] } }).select('status currentStage hold requestId purchaseOrder poNumber').lean();
    const handedOver = await handedOverRequestIds(jobs.map((j) => j.requestId));
    return jobs.filter((j) => jobActionBy(j, handedOver).includes(user.role)).length;
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
      if (!t.explanationScheduledAt || t.explanationCompletedAt || t.removedAt || !(t.assignedAt || t.explanationDoctor)) continue;
      if (user.role === ADMIN || explanationOwner(patient, stage) === String(user._id)) n += 1;
    }
    return n;
  },
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
  const values = await Promise.all(pages.map((page) => COUNTERS[page](req.user).catch((error) => { console.error(`Task count ${page}: ${error.message}`); return 0; })));
  res.json({ success: true, counts: Object.fromEntries(pages.map((page, i) => [page, values[i]])) });
});

module.exports = { getTaskCounts, PAGES, COUNTERS };
