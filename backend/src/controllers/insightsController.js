// Patient 360° (every patient on one line: phase, programme, medicine, sessions, next session, due, team, phase end)
// and the PCC report (how each PCC's follow-ups / family sessions / trackers went in a date range). The numbers are
// worked out in utils/insights.js.
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const CareSession = require('../models/CareSession');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { cached } = require('../utils/readCache');
const C = require('../utils/careSchedule');
const { patient360Row, pccReportRows, daysInRange } = require('../utils/insights');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FIELDS = 'patientName patientCode number category isActive currentStage assignedDoctor '
  + 'stages.number stages.totalAmount stages.packageName stages.medicineMonthsGiven stages.payments.amount stages.payments.approvalStatus stages.payments.refunds.amount stages.payments.refunds.status '
  + 'stages.postCounselor stages.carePlan stages.transit.medicineStartDate stages.medicineRequest.requestId stages.medicineRequest.status stages.medicineRequest.requestedAt stages.medicineRequest.supplyPlan '
  + 'stages.medicineRequest.courier.status stages.medicineRequest.medicineStartDate stages.medicineRequests.requestId stages.medicineRequests.status stages.medicineRequests.requestedAt '
  + 'stages.medicineRequests.supplyPlan stages.medicineRequests.courier.status stages.medicineRequests.medicineStartDate';
const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  next: (a, b) => (a.next ? a.next.day : '9999').localeCompare(b.next ? b.next.day : '9999') || a.name.localeCompare(b.name),
  due: (a, b) => b.due - a.due || a.name.localeCompare(b.name),
  ends: (a, b) => (a.phaseEnds || '9999').localeCompare(b.phaseEnds || '9999') || a.name.localeCompare(b.name),
};

// @route GET /api/insights/patient-360?status=active|inactive|all&category=&pcc=&q=&sort=name|next|due|ends&page=
const patient360 = asyncHandler(async (req, res) => {
  const status = ['active', 'inactive', 'all'].includes(req.query.status) ? req.query.status : 'active';
  const filter = {};
  if (status === 'active') filter.isActive = { $ne: false };
  if (status === 'inactive') filter.isActive = false;
  if (req.query.category) filter.category = String(req.query.category);
  if (mongoose.isValidObjectId(req.query.pcc)) filter.assignedDoctor = new mongoose.Types.ObjectId(String(req.query.pcc));
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q) filter.$or = [{ patientName: new RegExp(escape(q), 'i') }, { patientCode: new RegExp(escape(q), 'i') }, { number: new RegExp(escape(q.replace(/\D/g, '') || q), 'i') }];
  const key = `patient-360|${status}|${req.query.category || ''}|${req.query.pcc || ''}|${q}`;
  const rows = await cached(key, async () => {
    const patients = await Patient.find(filter).select(FIELDS).populate('assignedDoctor', 'name').populate('stages.postCounselor', 'name').lean();
    const sessions = patients.length ? await CareSession.find({ patient: { $in: patients.map((p) => p._id) } }).select('patient phase status code title kind day targetDate callAt').lean() : [];
    const byPatient = new Map();
    sessions.forEach((s) => { const k = String(s.patient); if (!byPatient.has(k)) byPatient.set(k, []); byPatient.get(k).push(s); });
    const now = new Date();
    return patients.map((p) => patient360Row(p, byPatient.get(String(p._id)) || [], now));
  });
  const sorted = [...rows].sort(SORTS[req.query.sort] || SORTS.name);
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const pccs = await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
  res.json({
    success: true, rows: sorted.slice((page - 1) * pageSize, page * pageSize), page, pages, total: sorted.length,
    summary: {
      patients: rows.length, onSchedule: rows.filter((r) => r.onSchedule).length,
      noNextSession: rows.filter((r) => r.active && r.onSchedule && !r.next).length, withOverdue: rows.filter((r) => r.overdue > 0).length,
      due: rows.reduce((n, r) => n + r.due, 0), withDue: rows.filter((r) => r.due > 0).length,
    },
    pccs: pccs.map((u) => ({ id: String(u._id), name: u.name })),
  });
});

// @route GET /api/insights/pcc-report?from=YYYY-MM-DD&to=YYYY-MM-DD  (default: the last 30 days)
// Admin, Manager, Doctor see every PCC; a PCC sees their own row.
const pccReport = asyncHandler(async (req, res) => {
  const today = C.dayOf(new Date());
  const to = C.validDay(req.query.to) ? req.query.to : today;
  const from = C.validDay(req.query.from) ? req.query.from : C.addDays(to, -29);
  if (from > to) fail('"From" cannot be after "To"');
  if (C.diffDays(to, from) > 370) fail('Choose at most a year');
  const all = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR].includes(req.user.role);
  const pccs = await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false }, ...(all ? {} : { _id: req.user._id }) }).select('name').sort({ name: 1 }).lean();
  const ids = pccs.map((u) => u._id);
  const data = await cached(`pcc-report|${from}|${to}|${ids.join(',')}`, async () => {
    const [sessions, patientCounts, explained, queried] = await Promise.all([
      CareSession.find({ assignee: { $in: ids }, $or: [{ targetDate: { $gte: C.addDays(from, -60), $lte: C.addDays(today, 7) } }, { callAt: { $gte: C.atTime(C.addDays(from, -60), '00:00'), $lte: C.atTime(C.addDays(today, 7), '23:59') } }] })
        .select('assignee owner status targetDate callAt completedAt reschedules attempts doctorRequests form.durationSec').lean(),
      Patient.aggregate([{ $match: { assignedDoctor: { $in: ids }, isActive: { $ne: false } } }, { $group: { _id: '$assignedDoctor', n: { $sum: 1 } } }]),
      Patient.aggregate([
        { $unwind: '$stages' },
        { $match: { 'stages.transit.explanationCompletedAt': { $gte: C.atTime(from, '00:00'), $lte: C.atTime(to, '23:59') } } },
        { $group: { _id: { $ifNull: ['$stages.transit.explanationDoctor', '$assignedDoctor'] }, n: { $sum: 1 } } },
      ]),
      require('../models/AdviceRequest').aggregate([
        { $match: { requestedBy: { $in: ids }, createdAt: { $gte: C.atTime(from, '00:00'), $lte: C.atTime(to, '23:59') } } },
        { $group: { _id: '$requestedBy', n: { $sum: 1 } } },
      ]),
    ]);
    const leaves = await require('../utils/careService').leavesOf(ids, from, to);
    const toMap = (list) => new Map(list.map((x) => [String(x._id), x.n]));
    return pccReportRows({
      pccs, sessions, patientsByPcc: toMap(patientCounts), explanations: toMap(explained), queries: toMap(queried),
      leaveDays: new Map(ids.map((id) => [String(id), daysInRange(leaves.get(String(id)) || [], from, to)])), from, to, now: new Date(),
    });
  });
  res.json({ success: true, from, to, ...data, seesAll: all });
});

module.exports = { patient360, pccReport };
