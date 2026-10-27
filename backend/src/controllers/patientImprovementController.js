const Patient = require('../models/Patient');
const User = require('../models/User');
const DigitalMarketingReview = require('../models/DigitalMarketingReview');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { CATEGORY_LABELS } = require('../constants/patientCategories');
const {
  SCHEDULE_KINDS,
  MARKETING_MIN_IMPROVEMENTS,
  monthKeyOf,
  isMonthKey,
  collectSessions,
  countOutcomes,
  qualifiesForMarketing,
} = require('../utils/patientImprovement');
const { syncImprovementToMarketing } = require('./digitalMarketingController');

const IMPROVEMENT_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.DIGITAL_MARKETING];
const SHOW_FILTERS = ['all', 'improvement', 'problem', 'marketing'];
const MAX_PAGE_SIZE = 100;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// [start, end) of a "YYYY-MM" month in India time.
const monthRange = (key) => {
  const [year, month] = key.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS),
  };
};
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patientFilter = (user) => {
  const filter = {
    $or: Object.keys(SCHEDULE_KINDS).map((kind) => ({ [`stages.${kind}.status`]: 'completed' })),
  };
  // PCC sees only the patients assigned to them, like the follow-up pages.
  if (user.role === ROLES.ASSISTANT_DOCTOR) {
    filter.assignedDoctor = user._id;
    filter.approvalStatus = { $ne: 'pending' };
  }
  return filter;
};

// Done sessions of one schedule field across all phases, as flat rows (date = done date, else planned date).
const sessionsOf = (fieldKey) => ({
  $reduce: {
    input: { $ifNull: ['$stages', []] },
    initialValue: [],
    in: {
      $concatArrays: ['$$value', {
        $map: {
          input: { $filter: { input: { $ifNull: [`$$this.${fieldKey}`, []] }, as: 'e', cond: { $eq: ['$$e.status', 'completed'] } } },
          as: 'e',
          in: {
            id: '$$e._id',
            kind: fieldKey,
            stage: '$$this.number',
            date: { $ifNull: ['$$e.completedAt', '$$e.dateTime'] },
            outcome: { $ifNull: ['$$e.outcome', ''] },
            outcomeNote: { $ifNull: ['$$e.outcomeNote', ''] },
            outcomeByName: { $ifNull: ['$$e.outcomeByName', ''] },
          },
        },
      }],
    },
  },
});
const countWhere = (cond) => ({ $size: { $filter: { input: '$sessions', as: 's', cond } } });

// Everything is filtered, counted and paged in the database, so a filter change only moves one page of rows.
const buildPipeline = async ({ user, month, kind, show, q, page, limit }) => {
  const match = patientFilter(user);
  const range = month === 'all' ? null : monthRange(month);
  const kinds = kind === 'all' ? Object.keys(SCHEDULE_KINDS) : [kind];
  if (range) {
    // Cheap pre-filter on the indexed date; the exact "done in this month" check happens below.
    match.$and = [{
      $or: kinds.flatMap((field) => [
        { [`stages.${field}`]: { $elemMatch: { status: 'completed', completedAt: { $gte: range.start, $lt: range.end } } } },
        { [`stages.${field}`]: { $elemMatch: { status: 'completed', dateTime: { $gte: range.start, $lt: range.end } } } },
      ]),
    }];
  }
  const term = String(q || '').trim().slice(0, 80);
  if (term) {
    const regex = new RegExp(escapeRegex(term), 'i');
    const pccs = await User.find({ name: regex }).select('_id').limit(50).lean();
    const or = [{ patientName: regex }, { patientCode: regex }, { guardianName: regex }, { relativeName: regex }];
    if (pccs.length) or.push({ assignedDoctor: { $in: pccs.map((pcc) => pcc._id) } });
    match.$and = [...(match.$and || []), { $or: or }];
  }

  const sessionCond = [];
  if (range) sessionCond.push({ $gte: ['$$s.date', range.start] }, { $lt: ['$$s.date', range.end] });
  const showMatch = {
    all: {},
    improvement: { 'counts.improvements': { $gt: 0 } },
    problem: { 'counts.problems': { $gt: 0 } },
    marketing: { inMarketing: true },
  }[show];

  return [
    { $match: match },
    {
      $project: {
        patientName: 1, patientCode: 1, category: 1, guardianName: 1, relativeName: 1, assignedDoctor: 1, isActive: 1,
        sessions: { $concatArrays: kinds.map(sessionsOf) },
      },
    },
    { $set: { sessions: sessionCond.length ? { $filter: { input: '$sessions', as: 's', cond: { $and: sessionCond } } } : '$sessions' } },
    { $match: { 'sessions.0': { $exists: true } } },
    {
      $set: {
        counts: {
          sessions: { $size: '$sessions' },
          followUps: countWhere({ $eq: ['$$s.kind', 'followUps'] }),
          familySessions: countWhere({ $eq: ['$$s.kind', 'familySessions'] }),
          improvements: countWhere({ $eq: ['$$s.outcome', 'improvement'] }),
          problems: countWhere({ $eq: ['$$s.outcome', 'problem'] }),
        },
      },
    },
    {
      $lookup: {
        from: DigitalMarketingReview.collection.name,
        localField: '_id',
        foreignField: 'patient',
        pipeline: [{ $project: { improvementMonth: 1 } }],
        as: 'review',
      },
    },
    { $set: { inMarketing: { $gt: [{ $size: '$review' }, 0] }, marketingMonth: { $ifNull: [{ $first: '$review.improvementMonth' }, ''] } } },
    {
      $facet: {
        // Tiles stay the same whichever "show" chip is picked.
        totals: [{
          $group: {
            _id: null,
            patients: { $sum: 1 },
            sessions: { $sum: '$counts.sessions' },
            followUps: { $sum: '$counts.followUps' },
            familySessions: { $sum: '$counts.familySessions' },
            improvements: { $sum: '$counts.improvements' },
            problems: { $sum: '$counts.problems' },
            inMarketing: { $sum: { $cond: ['$inMarketing', 1, 0] } },
          },
        }],
        total: [{ $match: showMatch }, { $count: 'n' }],
        rows: [
          { $match: showMatch },
          { $sort: { 'counts.improvements': -1, 'counts.problems': 1, patientName: 1, _id: 1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: { from: User.collection.name, localField: 'assignedDoctor', foreignField: '_id', pipeline: [{ $project: { name: 1 } }], as: 'pcc' } },
          { $project: { review: 0 } },
        ],
      },
    },
  ];
};

const formatRow = (row, month) => {
  const sessions = row.sessions
    .map((session) => ({
      ...session,
      id: String(session.id),
      kindLabel: SCHEDULE_KINDS[session.kind],
      month: monthKeyOf(session.date),
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return {
    id: row._id,
    patientCode: row.patientCode || `PT-${String(row._id).slice(-6).toUpperCase()}`,
    patientName: row.patientName || '',
    parentName: row.guardianName || row.relativeName || '',
    program: CATEGORY_LABELS[row.category] || row.category || '',
    assignedDoctorName: row.pcc?.[0]?.name || '',
    isActive: row.isActive !== false,
    counts: row.counts,
    sessions,
    inMarketing: row.inMarketing,
    marketingMonth: row.marketingMonth || '',
    qualifies: month !== 'all' && qualifiesForMarketing(row.counts),
  };
};

// GET /api/patient-improvement?month=YYYY-MM|all&kind=all|followUps|familySessions&show=&q=&page=&limit=
const getImprovementBoard = asyncHandler(async (req, res) => {
  const month = req.query.month === 'all' ? 'all' : (isMonthKey(req.query.month) ? req.query.month : monthKeyOf(new Date()));
  const kind = Object.keys(SCHEDULE_KINDS).includes(req.query.kind) ? req.query.kind : 'all';
  const show = SHOW_FILTERS.includes(req.query.show) ? req.query.show : 'all';
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const pipeline = await buildPipeline({ user: req.user, month, kind, show, q: req.query.q, page, limit });
  const [result = {}] = await Patient.aggregate(pipeline).allowDiskUse(true);
  const { _id, ...totals } = result.totals?.[0] || {};
  const total = result.total?.[0]?.n || 0;

  res.status(200).json({
    success: true,
    month,
    kind,
    show,
    marketingRule: { minImprovements: MARKETING_MIN_IMPROVEMENTS },
    totals: { patients: 0, sessions: 0, followUps: 0, familySessions: 0, improvements: 0, problems: 0, inMarketing: 0, ...totals },
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
    rows: (result.rows || []).map((row) => formatRow(row, month)),
  });
});

// POST /api/patient-improvement/sync { month } — admin catch-up: send every patient who qualifies
// in that month to the Digital Marketing sheet (outcomes noted before this page existed, etc.).
const syncMonthToMarketing = asyncHandler(async (req, res) => {
  const month = req.body.month;
  if (!isMonthKey(month)) {
    return res.status(400).json({ success: false, message: 'Choose a month' });
  }
  // Only patients with an improvement noted in that month can qualify.
  const { start, end } = monthRange(month);
  const patients = await Patient.find({
    ...patientFilter(req.user),
    $and: [{
      $or: Object.keys(SCHEDULE_KINDS).map((kind) => ({
        [`stages.${kind}`]: { $elemMatch: { outcome: 'improvement', $or: [{ completedAt: { $gte: start, $lt: end } }, { dateTime: { $gte: start, $lt: end } }] } },
      })),
    }],
  });
  let sent = 0;
  for (const patient of patients) {
    const sessions = collectSessions(patient).filter((row) => row.month === month);
    if (!qualifiesForMarketing(countOutcomes(sessions))) continue;
    await syncImprovementToMarketing(patient, month, req.user);
    sent += 1;
  }
  res.status(200).json({ success: true, sent, message: `${sent} patient(s) sent to Digital Marketing for ${month}` });
});

// POST /api/patient-improvement/:patientId/marketing { month } — put one patient on the Digital Marketing
// sheet now, even if the month has not reached the automatic rule yet.
const addPatientToMarketing = asyncHandler(async (req, res) => {
  const month = isMonthKey(req.body.month) ? req.body.month : monthKeyOf(new Date());
  const patient = await Patient.findOne({ ...patientFilter(req.user), _id: req.params.patientId });
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  const sessions = collectSessions(patient).filter((row) => row.month === month);
  if (!sessions.some((row) => row.outcome === 'improvement')) {
    return res.status(400).json({ success: false, message: 'No improvement is noted for this patient in that month' });
  }
  await syncImprovementToMarketing(patient, month, req.user, { force: true });
  res.status(200).json({ success: true, message: `${patient.patientName} added to Digital Marketing` });
});

module.exports = { IMPROVEMENT_ACCESS_ROLES, getImprovementBoard, syncMonthToMarketing, addPatientToMarketing, buildPipeline, monthRange };
