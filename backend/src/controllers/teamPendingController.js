const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, ROLE_LABELS } = require('../constants/roles');
const { PAGES, countOf } = require('./taskCountController');
const { COLLECTORS, itemsOf } = require('./myDayController');

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
// Built in the background, never inside a page request: requests get the last snapshot at once. It is rebuilt every
// 2 minutes while someone (Admin / Manager) is looking, and stops when nobody has asked for 10 minutes.
const REFRESH_MS = 2 * 60 * 1000;
const IDLE_MS = 10 * 60 * 1000;
let snapshot = null;
let building = null;
let lastAsked = 0;
let timer = null;
// Lets other requests run between the steps of a build, so pages stay fast while it works.
const breathe = () => new Promise((resolve) => setImmediate(resolve));
const DAY = 86400000;
// Same "overdue" rule as My day: waiting 2+ days, or due before today.
const isOverdue = (i) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (i.waitingSince) return i.due ? Math.floor((today - new Date(i.due)) / DAY) >= 2 : false;
  return Boolean(i.due) && new Date(i.due) < today;
};

const run = async (page, user) => {
  try {
    const [items, count] = await Promise.all([itemsOf(page, user), countOf(page, user)]);
    return { items: [...items], count: Math.max(count, items.length) };
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
        const results = [];
        for (const u of people) { results.push({ u, ...(await run(page, u)) }); await breathe(); }
        const items = results.flatMap(({ u, items: list }) => list.map((i) => ({ ...i, key: `${i.key}|${u._id}`, people: [u.name] })));
        results.forEach(({ u, count }) => personTotals.set(String(u._id), personTotals.get(String(u._id)) + count));
        const count = results.reduce((s, r) => s + r.count, 0);
        if (count || items.length) sections.push({ page, shared: false, count, items: items.sort(byDue).slice(0, LIMIT), byPerson: results.filter((r) => r.count).map((r) => ({ id: String(r.u._id), name: r.u.name, count: r.count })) });
      } else {
        // Shared by the role: anyone in it can do it.
        const { items, count } = role === ROLES.DOCTOR && page === '/admin/medicine-jobs' ? await doctorJobs() : await run(page, people[0]);
        if (count || items.length) sections.push({ page, shared: true, count, items: items.sort(byDue).slice(0, LIMIT).map((i) => ({ ...i, people: [] })) });
        await breathe();
      }
    }
    const total = sections.reduce((s, x) => s + x.count, 0);
    roles.push({
      role, label: ROLE_LABELS[role] || role, total, sections, overdue: sections.reduce((n, x) => n + x.items.filter(isOverdue).length, 0),
      people: people.map((u) => ({ id: String(u._id), name: u.name, personal: personTotals.get(String(u._id)) })),
    });
  }
  return { at: new Date().toISOString(), total: roles.reduce((s, r) => s + r.total, 0), roles };
};

// One build at a time; callers share it.
const rebuild = () => {
  if (!building) {
    building = buildTeam()
      .then((data) => { snapshot = { time: Date.now(), data }; })
      .catch((error) => console.error(`Team pending could not be built: ${error.message}`))
      .finally(() => { building = null; });
  }
  return building;
};
const keepFresh = () => {
  if (timer) return;
  timer = setInterval(() => {
    if (Date.now() - lastAsked > IDLE_MS) { clearInterval(timer); timer = null; return; }
    rebuild();
  }, REFRESH_MS);
  timer.unref?.();
};

// The small version for the top button and My day: totals per role and page, no item lists.
const summaryOf = (data) => ({
  ...data,
  roles: data.roles.map((r) => ({ ...r, sections: r.sections.map(({ page, shared, count }) => ({ page, shared, count })) })),
});

// @route GET /api/tasks/team   (Admin, Manager)   ?summary=1 small version · ?fresh=1 rebuild now
// Answers at once from the last snapshot ("building": true while the first one is being made).
const getTeamPending = asyncHandler(async (req, res) => {
  lastAsked = Date.now();
  keepFresh();
  if (req.query.fresh) await rebuild();
  else if (!snapshot || Date.now() - snapshot.time > REFRESH_MS) rebuild();
  if (!snapshot) return res.json({ success: true, building: true, total: 0, roles: [] });
  const data = req.query.summary ? summaryOf(snapshot.data) : snapshot.data;
  res.json({ success: true, building: Boolean(building), ...data });
});

// On server start: make the first copy in the background, so the first look does not wait.
const warmTeamPending = () => rebuild();

module.exports = { getTeamPending, buildTeam, warmTeamPending };
