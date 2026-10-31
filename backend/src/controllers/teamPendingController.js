const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, ROLE_LABELS } = require('../constants/roles');
const { PAGES, COUNTERS } = require('./taskCountController');
const { COLLECTORS } = require('./myDayController');

// Team pending work for the Admin / Manager: every role's open work (the same lists each person sees in their own
// "My day"), with who it is waiting on. Pages whose work belongs to one person (their patients, their enquiries)
// are worked out per person; the rest are shared by everyone in the role. Team Chat stays private.
const PERSONAL_PAGES = new Set(['/admin/medicine-explanations', '/admin/followups', '/admin/family-sessions', '/admin/post-counseling-patients', '/admin/enquiries']);
// The work each role itself has to do. The Admin, Manager and Doctor also see most lists, but only to oversee them,
// so those are not counted against them (the Admin and Manager are the ones looking at this view).
const E = '/admin/enquiries';
const TEAM_PAGES = {
  [ROLES.DOCTOR]: ['/admin/medicine-jobs', E],
  [ROLES.RECEPTIONIST]: ['/admin/accounts/consultations', E],
  [ROLES.POST_COUNSELOR]: ['/admin/post-counseling-patients', '/admin/package-not-bought', '/admin/purchase-orders', E],
  [ROLES.IN_TRANSIT]: ['/admin/purchase-orders', '/admin/patient-approvals', '/admin/payments', '/admin/accounts/refunds', '/admin/courier', E],
  [ROLES.MEDICINE_DEPARTMENT]: ['/admin/medicine-requests', '/admin/medicine-jobs', '/admin/medicine-made', '/admin/stocks', E],
  [ROLES.ASSISTANT_DOCTOR]: ['/admin/medicine-explanations', '/admin/followups', '/admin/family-sessions', E],
  [ROLES.SALES_TEAM]: [E],
  [ROLES.DIGITAL_MARKETING]: [E],
};
const ROLE_ORDER = Object.keys(TEAM_PAGES);

// The Doctor's own fulfilment steps (e.g. verify the formulation) - not the old requests the Doctor may also fill.
const doctorJobs = async () => {
  const MedicineJob = require('../models/MedicineJob');
  const { STAGES } = require('../utils/medicineJobFlow');
  const jobs = await MedicineJob.find({ status: { $in: ['open', 'ready'] }, 'hold.active': { $ne: true } }).select('patientName patientCode poNumber phase currentStage readyByDate formulation.custom').lean();
  const items = jobs.filter((j) => (STAGES[j.currentStage || 0]?.roles || []).includes(ROLES.DOCTOR))
    .map((j) => ({ page: '/admin/medicine-jobs', key: `/admin/medicine-jobs|${j._id}`, title: j.patientName, detail: `${j.poNumber || `Phase ${j.phase}`} · ${(j.currentStage || 0) + 1}. ${STAGES[j.currentStage || 0]?.label || ''}`, due: j.readyByDate ? new Date(j.readyByDate).toISOString() : null, href: `/admin/medicine-jobs/${j._id}` }));
  return { items, count: items.length };
};
const LIMIT = 25;
const CACHE_MS = 60 * 1000;
let cache = null;

const run = async (page, user) => {
  try {
    const [items, count] = await Promise.all([COLLECTORS[page](user), COUNTERS[page](user)]);
    return { items, count: Math.max(count, items.length) };
  } catch (error) {
    console.error(`Team pending ${page} (${user.name}): ${error.message}`);
    return { items: [], count: 0, error: true };
  }
};
const byDue = (a, b) => (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity);

const buildTeam = async () => {
  const users = await User.find({ isActive: { $ne: false }, role: { $in: ROLE_ORDER } }).select('name role').sort({ name: 1 }).lean();
  const roles = [];
  for (const role of ROLE_ORDER) {
    const people = users.filter((u) => u.role === role);
    if (!people.length) continue;
    const pages = TEAM_PAGES[role].filter((page) => PAGES[page]?.includes(role) && COLLECTORS[page]);
    const personTotals = new Map(people.map((u) => [String(u._id), 0]));
    const sections = [];
    for (const page of pages) {
      if (PERSONAL_PAGES.has(page)) {
        // One list per person; each item says whose it is.
        const results = await Promise.all(people.map(async (u) => ({ u, ...(await run(page, u)) })));
        const items = results.flatMap(({ u, items: list }) => list.map((i) => ({ ...i, key: `${i.key}|${u._id}`, people: [u.name] })));
        results.forEach(({ u, count }) => personTotals.set(String(u._id), personTotals.get(String(u._id)) + count));
        const count = results.reduce((s, r) => s + r.count, 0);
        if (count || items.length) sections.push({ page, shared: false, count, items: items.sort(byDue).slice(0, LIMIT), byPerson: results.filter((r) => r.count).map((r) => ({ id: String(r.u._id), name: r.u.name, count: r.count })) });
      } else {
        // Shared by the role: anyone in it can do it.
        const { items, count } = role === ROLES.DOCTOR && page === '/admin/medicine-jobs' ? await doctorJobs() : await run(page, people[0]);
        if (count || items.length) sections.push({ page, shared: true, count, items: items.sort(byDue).slice(0, LIMIT).map((i) => ({ ...i, people: [] })) });
      }
    }
    const total = sections.reduce((s, x) => s + x.count, 0);
    roles.push({
      role, label: ROLE_LABELS[role] || role, total, sections,
      people: people.map((u) => ({ id: String(u._id), name: u.name, personal: personTotals.get(String(u._id)) })),
    });
  }
  return { at: new Date().toISOString(), total: roles.reduce((s, r) => s + r.total, 0), roles };
};

// @route GET /api/tasks/team   (Admin, Manager)  ?fresh=1 skips the one-minute cache
const getTeamPending = asyncHandler(async (req, res) => {
  if (!cache || req.query.fresh || Date.now() - cache.time > CACHE_MS) cache = { time: Date.now(), data: await buildTeam() };
  res.json({ success: true, ...cache.data });
});

module.exports = { getTeamPending, buildTeam };
