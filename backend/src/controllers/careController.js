// Care Schedule: the follow-ups, family sessions and development trackers of every phase whose medicine start date
// was filled after the explanation (utils/careSchedule.js, utils/careService.js). The PCC sets the call time, can
// reschedule it twice (then the session is on red alert until it is completed, marked missed by the parents or
// cancelled), records calls that did not connect, and fills the session's form (careTemplates/) to mark it done.
// The Manager / Admin reassigns a session to another person (e.g. the PCC is on leave that day).
const mongoose = require('mongoose');
const CareSession = require('../models/CareSession');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const C = require('../utils/careSchedule');
const { leavesOf, leaveOn } = require('../utils/careService');
const { buildContext } = require('../utils/careContext');
const R = require('../careTemplates/rules');
const { basicTemplate } = require('../careTemplates/basic');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const SEES_ALL = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR];
const MANAGES = [ROLES.ADMIN, ROLES.MANAGER];
const seesAll = (user) => SEES_ALL.includes(user?.role);
const manages = (user) => MANAGES.includes(user?.role);
const mine = (user, s) => [s.assignee, s.owner].some((id) => id && String(id) === String(user._id));
const mayView = (user, s) => seesAll(user) || mine(user, s);
const mayAct = (user, s) => seesAll(user) || mine(user, s);

const templateFor = (session) => {
  let own = null;
  try { own = require('../careTemplates').templateOf(session.code); } catch (error) { own = null; }
  return own || basicTemplate(session);
};

const MISSED_REASONS = ['Parent did not answer the calls', 'Parent busy / travelling', 'Parent refused the session', 'Child unwell / hospitalised', 'Wrong / switched-off number', 'Other'];
const ATTEMPT_LABEL = { not_connected: 'Not connected', busy: 'Busy — call later', switched_off: 'Switched off', wrong_number: 'Wrong number', callback: 'Asked to call back' };

// One session for the lists and the patient page.
const viewOf = (s, { now = new Date(), leaves = new Map(), full = false } = {}) => {
  const state = C.stateOf(s, now);
  const day = C.dueDayOf(s);
  const leave = C.isOpen(s) ? leaveOn(leaves, s.assignee || s.owner, day) : null;
  return {
    id: String(s._id), patientId: String(s.patient), patientName: s.patientName, patientCode: s.patientCode, phase: s.phase,
    kind: s.kind, kindLabel: C.KIND_LABEL[s.kind], seq: s.seq, code: s.code, title: s.title, day: s.day, targetDate: s.targetDate,
    callAt: s.callAt, dueDay: day, status: s.status, state, stateLabel: C.STATE_LABEL[state] || state,
    owner: s.owner ? String(s.owner) : null, ownerName: s.ownerName || '', assignee: s.assignee ? String(s.assignee) : null, assigneeName: s.assigneeName || '',
    covered: Boolean(s.cover && String(s.assignee) !== String(s.owner)), cover: s.cover || null,
    reschedulesUsed: (s.reschedules || []).length, rescheduleLimit: C.RESCHEDULE_LIMIT, attempts: (s.attempts || []).length,
    lastAttempt: (s.attempts || []).slice(-1)[0] || null,
    leave: leave ? { ...leave, text: `${s.assigneeName || s.ownerName || 'The PCC'} is on leave${leave.source === 'hr' ? ` (HR, ${leave.status === 'approved' ? 'approved' : 'requested'})` : ''} ${leave.from === leave.to ? leave.from : `${leave.from} to ${leave.to}`}` } : null,
    final: s.form?.answers?.final || '', hasDraft: Boolean(s.form?.savedAt) && s.status !== 'completed',
    completedAt: s.completedAt, completedByName: s.completedByName || '', missedReason: s.missedReason || '', missedAt: s.missedAt, missedByName: s.missedByName || '',
    cancelReason: s.cancelReason || '', cancelledAt: s.cancelledAt, cancelledByName: s.cancelledByName || '',
    doctorRequests: (s.doctorRequests || []).map((d) => ({ advice: String(d.advice), level: d.level, at: d.at })),
    ...(full ? { reschedules: s.reschedules || [], attemptsList: (s.attempts || []).map((a) => ({ ...a, label: ATTEMPT_LABEL[a.outcome] || a.outcome })), log: s.log || [], form: s.form || null } : {}),
  };
};

const loadSession = async (req, { act = false } = {}) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Session not found', 404);
  const session = await CareSession.findById(req.params.id);
  if (!session) fail('Session not found', 404);
  if (!(act ? mayAct : mayView)(req.user, session)) fail('This session is not yours', 403);
  return session;
};
const note = (session, user, line) => session.log.push({ at: new Date(), byName: user?.name || '', text: line });
const leavesFor = async (sessions) => {
  const open = sessions.filter(C.isOpen);
  if (!open.length) return new Map();
  const days = open.map(C.dueDayOf).filter(Boolean).sort();
  return leavesOf(open.map((s) => s.assignee || s.owner), days[0], days[days.length - 1]);
};
const tell = (req, session) => req.app?.get?.('io')?.emit?.('care:changed', { id: String(session._id), patientId: String(session.patient) });
const respond = async (req, res, session, extra = {}) => {
  await session.save();
  tell(req, session);
  const leaves = await leavesFor([session]);
  res.json({ success: true, session: viewOf(session.toObject(), { leaves, full: true }), ...extra });
};

// @route GET /api/care/sessions?view=work|today|overdue|alert|needs_time|upcoming|done|missed|cancelled|all&kind=&person=&q=
// The worklist. A PCC sees the sessions assigned to them; Admin, Manager and Doctor see everyone's (person= filters).
const WORK = ['alert', 'overdue', 'today', 'needs_time'];
const listSessions = asyncHandler(async (req, res) => {
  const now = new Date();
  const filter = {};
  if (!seesAll(req.user)) filter.assignee = req.user._id;
  else if (mongoose.isValidObjectId(req.query.person)) filter.assignee = req.query.person;
  if (['followup', 'family', 'tracker'].includes(req.query.kind)) filter.kind = req.query.kind;
  const view = String(req.query.view || 'work');
  if (['done', 'missed', 'cancelled'].includes(view)) filter.status = { done: 'completed', missed: 'missed', cancelled: 'cancelled' }[view];
  else if (view !== 'all') filter.status = { $in: C.OPEN };
  const q = text(req.query.q, 80);
  if (q) filter.$or = [{ patientName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { patientCode: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  // Open work: everything due within the next 7 days or earlier; "upcoming" looks 60 days ahead.
  const horizon = C.addDays(C.dayOf(now), view === 'upcoming' ? 60 : view === 'all' ? 400 : 7);
  if (filter.status?.$in) filter.targetDate = { $lte: horizon };
  const rows = await CareSession.find(filter).select('-form.answers -log').sort({ targetDate: 1 }).limit(['done', 'missed', 'cancelled', 'all'].includes(view) ? 300 : 1000).lean();
  const leaves = await leavesFor(rows);
  let list = rows.map((s) => viewOf(s, { now, leaves }));
  const counts = { work: 0, alert: 0, overdue: 0, today: 0, needs_time: 0, upcoming: 0, leave: 0 };
  list.forEach((s) => {
    if (counts[s.state] != null) counts[s.state] += 1;
    if (WORK.includes(s.state)) counts.work += 1;
    if (s.leave) counts.leave += 1;
  });
  if (view === 'work') list = list.filter((s) => WORK.includes(s.state) || s.leave);
  else if (['alert', 'overdue', 'today', 'needs_time', 'upcoming'].includes(view)) list = list.filter((s) => s.state === view);
  else if (view === 'leave') list = list.filter((s) => s.leave);
  const rank = { alert: 0, overdue: 1, today: 2, needs_time: 3, upcoming: 4 };
  if (!['done', 'missed', 'cancelled', 'all'].includes(view)) list.sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9) || String(a.dueDay).localeCompare(String(b.dueDay)));
  else list.sort((a, b) => new Date(b.completedAt || b.missedAt || b.cancelledAt || 0) - new Date(a.completedAt || a.missedAt || a.cancelledAt || 0));
  const staff = seesAll(req.user) ? (await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean()).map((u) => ({ id: String(u._id), name: u.name })) : [];
  res.json({ success: true, sessions: list, counts, staff, canManage: manages(req.user), seesAll: seesAll(req.user) });
});

// @route GET /api/care/patients/:patientId  - every session of the patient, phase by phase, with each phase's supplies.
const patientSessions = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.patientId)) fail('Patient not found', 404);
  const Patient = require('../models/Patient');
  const patient = await Patient.findById(req.params.patientId).select('assignedDoctor stages.number stages.carePlan').lean();
  if (!patient) fail('Patient not found', 404);
  const rows = await CareSession.find({ patient: patient._id }).select('-form.answers -log').sort({ phase: 1, day: 1 }).lean();
  if (!seesAll(req.user) && String(patient.assignedDoctor || '') !== String(req.user._id) && !rows.some((s) => mine(req.user, s))) fail('This patient is not yours', 403);
  const leaves = await leavesFor(rows);
  const now = new Date();
  const phases = (patient.stages || []).filter((s) => s.carePlan?.parts?.length || rows.some((r) => r.phase === s.number)).map((s) => ({
    phase: s.number,
    plan: s.carePlan ? { startedAt: s.carePlan.startedAt, startedByName: s.carePlan.startedByName, parts: s.carePlan.parts || [], coveredDays: C.coveredDays(s.carePlan.parts || []), phaseDays: s.carePlan.phaseDays || C.PHASE_DAYS } : null,
    sessions: rows.filter((r) => r.phase === s.number).map((r) => viewOf(r, { now, leaves })),
  }));
  res.json({ success: true, phases, canManage: manages(req.user) });
});

// @route GET /api/care/sessions/:id  - the session with its form template and what the CRM fills in it.
const getSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req);
  const [context, leaves] = await Promise.all([buildContext(session.toObject(), req.user), leavesFor([session])]);
  res.json({
    success: true, session: viewOf(session.toObject(), { leaves, full: true }), template: templateFor(session), context,
    canAct: mayAct(req.user, session), canManage: manages(req.user), missedReasons: MISSED_REASONS, attemptOutcomes: ATTEMPT_LABEL,
  });
});

const openOnly = (session) => { if (!C.isOpen(session)) fail(`This session is already ${session.status === 'completed' ? 'done' : session.status}`); };
const callTime = (value) => {
  const problem = C.callTimeProblem(value);
  if (problem) fail(problem);
  return new Date(value);
};

// @route PATCH /api/care/sessions/:id/call  { callAt }  - the first call time (a set time moves only by rescheduling).
const setCallTime = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  if (session.callAt) fail('The call time is already set. Use Reschedule to change it.');
  session.callAt = callTime(req.body?.callAt);
  session.status = 'scheduled';
  note(session, req.user, `Call time set: ${session.callAt.toISOString()}`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/reschedule  { callAt, reason }  - at most twice; then complete, missed or cancel.
const reschedule = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  if (!session.callAt) fail('Set the call time first');
  if (session.reschedules.length >= C.RESCHEDULE_LIMIT) fail(`This session was already rescheduled ${C.RESCHEDULE_LIMIT} times. Complete it, mark it missed by the parents, or cancel it.`);
  const reason = text(req.body?.reason, 500);
  if (!reason) fail('Write why the call is rescheduled');
  const to = callTime(req.body?.callAt);
  session.reschedules.push({ at: new Date(), by: req.user._id, byName: req.user.name, from: session.callAt, to, reason });
  session.callAt = to;
  session.status = 'scheduled';
  note(session, req.user, `Rescheduled (${session.reschedules.length}/${C.RESCHEDULE_LIMIT}) to ${to.toISOString()}: ${reason}`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/attempt  { outcome, note }  - a call that did not connect.
const addAttempt = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const outcome = String(req.body?.outcome || '');
  if (!ATTEMPT_LABEL[outcome]) fail('Choose what happened on the call');
  session.attempts.push({ at: new Date(), by: req.user._id, byName: req.user.name, outcome, note: text(req.body?.note, 500) });
  note(session, req.user, `Call attempt ${session.attempts.length}: ${ATTEMPT_LABEL[outcome]}${req.body?.note ? ` — ${text(req.body.note, 200)}` : ''}`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/missed  { reason, note }  - the parents missed it (any time, with the reason).
const markMissed = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const picked = text(req.body?.reason, 200);
  if (!picked) fail('Choose why the parents missed it');
  const extra = text(req.body?.note, 500);
  if (picked === 'Other' && !extra) fail('Write the reason');
  Object.assign(session, { status: 'missed', missedAt: new Date(), missedReason: picked === 'Other' ? extra : [picked, extra].filter(Boolean).join(' — '), missedByName: req.user.name });
  note(session, req.user, `Missed by parents: ${session.missedReason}`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/cancel  { reason }
const cancelSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const reason = text(req.body?.reason, 500);
  if (!reason) fail('Write why the session is cancelled');
  Object.assign(session, { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, cancelledByName: req.user.name });
  note(session, req.user, `Cancelled: ${reason}`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/reopen  { reason }  - Admin / Manager: a session closed by mistake opens again.
const reopenSession = asyncHandler(async (req, res) => {
  if (!manages(req.user)) fail('Only the Admin or Manager reopens a session', 403);
  const session = await loadSession(req);
  if (C.isOpen(session)) fail('This session is open');
  const reason = text(req.body?.reason, 500);
  if (!reason) fail('Write why it is reopened');
  const was = session.status;
  Object.assign(session, { status: session.callAt ? 'scheduled' : 'pending', completedAt: null, completedBy: null, completedByName: '', missedAt: null, missedReason: '', missedByName: '', cancelledAt: null, cancelReason: '', cancelledByName: '' });
  note(session, req.user, `Reopened (was ${was}): ${reason}`);
  await respond(req, res, session);
});

// @route GET /api/care/staff?day=YYYY-MM-DD  - who a session can be given to (PCCs first), with their leave that day.
const STAFF_ROLES = [ROLES.ASSISTANT_DOCTOR, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ADMIN];
const listStaff = asyncHandler(async (req, res) => {
  if (!manages(req.user)) fail('Only the Admin or Manager assigns sessions', 403);
  const users = await User.find({ role: { $in: STAFF_ROLES }, isActive: { $ne: false } }).select('name role').sort({ name: 1 }).lean();
  const day = C.validDay(req.query.day) ? req.query.day : C.dayOf(new Date());
  const leaves = await leavesOf(users.map((u) => u._id), day, day);
  const order = (role) => STAFF_ROLES.indexOf(role);
  res.json({
    success: true,
    staff: users.sort((a, b) => order(a.role) - order(b.role) || a.name.localeCompare(b.name)).map((u) => ({ id: String(u._id), name: u.name, role: u.role, onLeave: Boolean(leaveOn(leaves, u._id, day)) })),
  });
});

// @route POST /api/care/sessions/:id/assign  { userId, reason }  - Admin / Manager give one session to another person
// (the case owner stays the PCC). Giving it back to the owner ends the cover.
const assignSession = asyncHandler(async (req, res) => {
  if (!manages(req.user)) fail('Only the Admin or Manager assigns sessions', 403);
  const session = await loadSession(req);
  openOnly(session);
  if (!mongoose.isValidObjectId(req.body?.userId)) fail('Choose who does this session');
  const to = await User.findById(req.body.userId).select('name role isActive').lean();
  if (!to || to.isActive === false) fail('That person was not found');
  if (String(session.assignee) === String(to._id)) fail(`${to.name} already has this session`);
  const back = String(to._id) === String(session.owner);
  const reason = text(req.body?.reason, 300);
  if (!back && !reason) fail('Write why (e.g. the PCC is on leave that day)');
  const fromName = session.assigneeName || session.ownerName || '';
  session.assignee = to._id;
  session.assigneeName = to.name;
  session.cover = back ? undefined : { at: new Date(), by: req.user._id, byName: req.user.name, reason, fromName };
  note(session, req.user, back ? `Given back to ${to.name} (the patient's PCC)` : `Assigned to ${to.name} (was ${fromName || 'nobody'}): ${reason}`);
  await respond(req, res, session);
});

// Emergency / Urgent Doctor Review answers go to the doctor as an advice request (once per triage block and level).
const escalate = async (req, session, template, answers) => {
  const AdviceRequest = require('../models/AdviceRequest');
  const made = [];
  for (const item of R.escalationsOf(template, answers)) {
    if (session.doctorRequests.some((d) => d.blockId === item.blockId && d.level === item.level)) continue;
    const now = new Date();
    const query = `${session.code} ${session.title} (day ${session.day}) — ${item.level}${item.section ? ` | ${item.section}` : ''}${item.text ? `\n${item.text}` : ''}`;
    const advice = await AdviceRequest.create({
      patient: session.patient, stage: session.phase, query: query.slice(0, 3000), askedAt: now, isUrgent: item.level === 'Emergency',
      requestedBy: req.user._id, requestedByName: req.user.name, requestedByRole: req.user.role,
      timeline: [{ at: now, action: item.level === 'Emergency' ? 'Query raised (emergency) from the follow-up form' : 'Query raised from the follow-up form', details: query.slice(0, 1000), byName: req.user.name, byRole: req.user.role }],
    });
    session.doctorRequests.push({ advice: advice._id, level: item.level, blockId: item.blockId, at: now });
    note(session, req.user, `${item.level}: sent to the doctor (advice request)`);
    made.push(item.level);
    const server = req.app?.get?.('io');
    if (server) { server.to('advice:doctors').emit('advice:changed', { id: String(advice._id) }); ['enquiry:admins', 'enquiry:managers'].forEach((room) => server.to(room).emit('advice:changed', { id: String(advice._id) })); }
  }
  return made;
};

const writeForm = (session, template, body, user) => {
  const answers = R.cleanAnswers(body?.answers);
  const startedAt = body?.startedAt && !Number.isNaN(new Date(body.startedAt).getTime()) ? new Date(body.startedAt) : null;
  const form = session.form?.toObject?.() || session.form || {};
  const first = form.startedAt || startedAt || new Date();
  session.form = {
    templateKey: template.key, version: template.version || 1, answers, startedAt: first, savedAt: new Date(), savedByName: user.name,
    durationSec: Math.max(0, Math.round((Date.now() - new Date(first).getTime()) / 1000)),
  };
  session.markModified('form');
  return answers;
};

// @route PUT /api/care/sessions/:id/form  { answers, startedAt }  - save the form as a draft.
const saveForm = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const template = templateFor(session);
  const answers = writeForm(session, template, req.body, req.user);
  const sent = await escalate(req, session, template, answers);
  await respond(req, res, session, { sentToDoctor: sent });
});

// @route POST /api/care/sessions/:id/complete  { answers, startedAt }  - every required answer filled, then done.
const completeSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const template = templateFor(session);
  const answers = writeForm(session, template, req.body, req.user);
  const missing = R.missingOf(template, answers);
  if (missing.length) {
    await session.save();
    fail(`Fill these before marking done: ${missing.slice(0, 6).join('; ')}${missing.length > 6 ? ` (+${missing.length - 6} more)` : ''}`);
  }
  const sent = await escalate(req, session, template, answers);
  Object.assign(session, { status: 'completed', completedAt: new Date(), completedBy: req.user._id, completedByName: req.user.name });
  if (!session.callAt) session.callAt = new Date();
  note(session, req.user, `Done — ${answers.final || 'form filled'}`);
  await respond(req, res, session, { sentToDoctor: sent });
});

// Open sessions waiting on a person (sidebar count / Your pending work): red alert, overdue, today, no call time
// within 3 days, or on a leave day (for the Manager / Admin).
const careWork = async (user, now = new Date()) => {
  if (mongoose.connection.readyState !== 1) return [];
  const filter = { status: { $in: C.OPEN }, targetDate: { $lte: C.addDays(C.dayOf(now), 3) } };
  if (!seesAll(user)) filter.assignee = user._id;
  const rows = await CareSession.find(filter).select('patient patientName patientCode phase kind seq code title day targetDate callAt status owner ownerName assignee assigneeName reschedules cover').lean();
  const leaves = manages(user) ? await leavesFor(rows) : new Map();
  return rows.map((s) => viewOf(s, { now, leaves })).filter((s) => WORK.includes(s.state) || s.leave)
    .sort((a, b) => ({ alert: 0, overdue: 1 }[a.state] ?? 2) - ({ alert: 0, overdue: 1 }[b.state] ?? 2) || String(a.dueDay).localeCompare(String(b.dueDay)));
};

// ---- The PCC's calendar ---------------------------------------------------------------------------------------------
// @route GET /api/care/calendar?user=&month=YYYY-MM  - one person's month: their sessions day by day and their leave.
// A PCC sees their own; Admin, Manager and Doctor any PCC's.
const PCC_ROLES = [ROLES.ASSISTANT_DOCTOR];
const calendar = asyncHandler(async (req, res) => {
  const userId = seesAll(req.user) && mongoose.isValidObjectId(req.query.user) ? req.query.user : String(req.user._id);
  const person = await User.findById(userId).select('name role').lean();
  if (!person) fail('Person not found', 404);
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : C.dayOf(new Date()).slice(0, 7);
  const from = `${month}-01`;
  const to = C.addDays(C.addDays(from, 32).slice(0, 7) + '-01', -1);
  const rows = await CareSession.find({ $or: [{ assignee: userId }, { owner: userId }], targetDate: { $gte: C.addDays(from, -7), $lte: C.addDays(to, 7) } })
    .select('-form.answers -log').lean();
  const leaves = await leavesOf([userId], from, to);
  const now = new Date();
  const sessions = rows.map((s) => viewOf(s, { now, leaves })).filter((s) => s.dueDay >= from && s.dueDay <= to)
    .filter((s) => s.assignee === String(userId) || (s.owner === String(userId) && s.assignee !== String(userId) && C.isOpen(s)));
  const days = [];
  for (let day = from; day <= to; day = C.addDays(day, 1)) {
    days.push({ day, weekday: C.weekdayOf(day), closed: C.isOffDay(day), leave: leaveOn(leaves, userId, day), sessions: sessions.filter((s) => s.dueDay === day) });
  }
  const staff = seesAll(req.user) ? (await User.find({ role: { $in: PCC_ROLES }, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean()).map((u) => ({ id: String(u._id), name: u.name })) : [];
  res.json({ success: true, user: { id: String(person._id), name: person.name, role: person.role }, month, days, leaves: leaves.get(String(userId)) || [], staff, canMark: manages(req.user) || String(userId) === String(req.user._id) });
});

// @route POST /api/care/leaves  { user, from, to, reason }  - mark leave on a calendar (own, or anyone's by the Manager / Admin).
const markLeave = asyncHandler(async (req, res) => {
  const userId = req.body?.user && String(req.body.user) !== String(req.user._id) ? String(req.body.user) : String(req.user._id);
  if (userId !== String(req.user._id) && !manages(req.user)) fail('Only the Manager or Admin marks leave for someone else', 403);
  if (!mongoose.isValidObjectId(userId)) fail('Choose the person');
  const person = await User.findById(userId).select('name').lean();
  if (!person) fail('Person not found', 404);
  const from = String(req.body?.from || '');
  const to = String(req.body?.to || from);
  if (!C.validDay(from) || !C.validDay(to)) fail('Choose the leave dates');
  if (to < from) fail('The last day cannot be before the first day');
  if (C.diffDays(to, from) > 60) fail('Mark at most 60 days at a time');
  const StaffLeave = require('../models/StaffLeave');
  const overlap = await StaffLeave.findOne({ user: userId, removedAt: null, from: { $lte: to }, to: { $gte: from } }).lean();
  if (overlap) fail(`Leave is already marked ${overlap.from === overlap.to ? overlap.from : `${overlap.from} to ${overlap.to}`}`);
  const leave = await StaffLeave.create({ user: userId, userName: person.name, from, to, reason: text(req.body?.reason, 300), createdBy: req.user._id, createdByName: req.user.name });
  const affected = await CareSession.countDocuments({ assignee: userId, status: { $in: C.OPEN }, $or: [{ callAt: { $gte: C.atTime(from, '00:00'), $lte: C.atTime(to, '23:59') } }, { callAt: null, targetDate: { $gte: from, $lte: to } }] });
  req.app?.get?.('io')?.emit?.('care:changed', { leave: String(leave._id) });
  res.status(201).json({ success: true, leave, affected });
});

// @route DELETE /api/care/leaves/:id  - remove a marked leave (the PCC their own, the Manager / Admin anyone's).
const removeLeave = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Leave not found', 404);
  const StaffLeave = require('../models/StaffLeave');
  const leave = await StaffLeave.findById(req.params.id);
  if (!leave || leave.removedAt) fail('Leave not found', 404);
  if (String(leave.user) !== String(req.user._id) && !manages(req.user)) fail('Only the Manager or Admin removes someone else\'s leave', 403);
  Object.assign(leave, { removedAt: new Date(), removedByName: req.user.name });
  await leave.save();
  req.app?.get?.('io')?.emit?.('care:changed', { leave: String(leave._id) });
  res.json({ success: true });
});

module.exports = {
  calendar, markLeave, removeLeave,
  listSessions, patientSessions, getSession, setCallTime, reschedule, addAttempt, markMissed, cancelSession, reopenSession, listStaff, assignSession,
  saveForm, completeSession, careWork, viewOf, MISSED_REASONS, ATTEMPT_LABEL,
};
