// Care Schedule: the follow-ups, family sessions and development trackers of every phase whose medicine start date
// was filled after the explanation (utils/careSchedule.js, utils/careService.js). The PCC sets the call time, can
// reschedule it twice (then the session is on red alert until it is completed, marked missed by the parents or
// cancelled), records every call made (Call details), and fills the session's form (careTemplates/) to mark it done.
// The Manager / Admin reassigns a session to another person (e.g. the PCC is on leave that day).
const mongoose = require('mongoose');
const CareSession = require('../models/CareSession');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const C = require('../utils/careSchedule');
const { leavesOf, leaveOn, syncCallReminder } = require('../utils/careService');
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
// Every PCC reads any session (e.g. a colleague's patient's earlier follow-ups); acting is for its own people.
const mayView = (user, s) => seesAll(user) || mine(user, s) || user?.role === ROLES.ASSISTANT_DOCTOR;
const mayAct = (user, s) => seesAll(user) || mine(user, s);

// Nothing in the forms is required (asked 2026-11-21): the templates are served without their "required" marks.
const withoutRequired = (template) => ({ ...template, sections: (template.sections || []).map((section) => ({ ...section, blocks: (section.blocks || []).map(({ req, ...block }) => block) })) });
const templateFor = (session) => {
  let own = null;
  try { own = require('../careTemplates').templateOf(session.code); } catch (error) { own = null; }
  return withoutRequired(own || basicTemplate(session));
};

const MISSED_REASONS = ['Parent did not answer the calls', 'Parent busy / travelling', 'Parent refused the session', 'Child unwell / hospitalised', 'Wrong / switched-off number', 'Other'];
// "Close" on the session page: a follow-up / family session that will not happen (the parents do not pick up or reply,
// refused, ...). The first ones close it as missed by the patient, the rest as closed for that reason.
const CLOSE_REASONS = [
  { label: 'Missed by patient — no answer to calls', missed: true },
  { label: 'Missed by patient — no reply on WhatsApp / messages', missed: true },
  { label: 'Missed by patient — said they will call back, never did', missed: true },
  { label: 'Parent refused / not interested now', missed: true },
  { label: 'Parent busy / travelling', missed: true },
  { label: 'Child unwell / hospitalised', missed: false },
  { label: 'Wrong / switched-off number', missed: false },
  { label: 'Treatment stopped / patient inactive', missed: false },
  { label: 'Done another way (in clinic / other session)', missed: false },
  { label: 'Other', missed: false },
];
const ATTEMPT_LABEL = { not_connected: 'Not connected', busy: 'Busy — call later', switched_off: 'Switched off', wrong_number: 'Wrong number', callback: 'Asked to call back', connected: 'Picked up — talked' };
const durationText = (sec) => {
  if (sec == null) return '';
  const m = Math.floor(sec / 60); const s = sec % 60;
  return m ? `${m} min${s ? ` ${s} sec` : ''}` : `${s} sec`;
};

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
    // attempts: the calls that did not connect (as before); calls: every call recorded, talked: the ones that connected.
    reschedulesUsed: (s.reschedules || []).length, rescheduleLimit: C.RESCHEDULE_LIMIT, attempts: C.missedCalls(s).length,
    calls: (s.attempts || []).length, talked: (s.attempts || []).length - C.missedCalls(s).length,
    lastAttempt: C.missedCalls(s).slice(-1)[0] || null,
    leave: leave ? { ...leave, text: `${s.assigneeName || s.ownerName || 'The PCC'} is on leave${leave.source === 'hr' ? ` (HR, ${leave.status === 'approved' ? 'approved' : 'requested'})` : ''} ${leave.from === leave.to ? leave.from : `${leave.from} to ${leave.to}`}` } : null,
    final: s.form?.answers?.final || (s.status === 'completed' && s.tracker?.filledLink ? 'Tracker filled' : ''), hasDraft: Boolean(s.form?.savedAt) && s.status !== 'completed',
    tracker: s.tracker || null,
    completedAt: s.completedAt, completedByName: s.completedByName || '', missedReason: s.missedReason || '', missedAt: s.missedAt, missedByName: s.missedByName || '',
    cancelReason: s.cancelReason || '', cancelledAt: s.cancelledAt, cancelledByName: s.cancelledByName || '',
    closed: s.closed || null,
    reassignRequest: s.reassignRequest || null, reassignAsked: s.reassignRequest?.status === 'open',
    doctorRequests: (s.doctorRequests || []).map((d) => ({ advice: String(d.advice), level: d.level, at: d.at })),
    reminderDue: (s.reminders || []).some((r) => !r.doneAt && new Date(r.at) <= now),
    notesCount: (s.notes || []).length,
    ...(full ? { notes: s.notes || [], reminders: s.reminders || [], reschedules: s.reschedules || [], attemptsList: (s.attempts || []).map((a) => ({ ...a, label: ATTEMPT_LABEL[a.outcome] || a.outcome, connected: a.outcome === 'connected', calledAt: a.calledAt || a.at, duration: durationText(a.durationSec) })), log: s.log || [], form: s.form || null } : {}),
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
const WORK = ['alert', 'overdue', 'today', 'needs_time', 'tracker_sent'];
const listSessions = asyncHandler(async (req, res) => {
  const now = new Date();
  const filter = {};
  if (!seesAll(req.user)) filter.assignee = req.user._id;
  else if (mongoose.isValidObjectId(req.query.person)) filter.assignee = req.query.person;
  if (['followup', 'family', 'tracker'].includes(req.query.kind)) filter.kind = req.query.kind;
  const view = String(req.query.view || 'work');
  if (['done', 'missed', 'cancelled'].includes(view)) filter.status = { done: 'completed', missed: 'missed', cancelled: 'cancelled' }[view];
  else if (view === 'closed') filter.status = { $in: ['missed', 'cancelled'] };
  else if (view !== 'all') filter.status = { $in: C.OPEN };
  const q = text(req.query.q, 80);
  if (q) filter.$or = [{ patientName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { patientCode: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  // Open work: everything due within the next 7 days or earlier (plus reminders due and reassign requests, whatever
  // the day); "upcoming" looks 60 days ahead.
  const horizon = C.addDays(C.dayOf(now), view === 'upcoming' ? 60 : ['all', 'requests'].includes(view) ? 400 : 7);
  if (filter.status?.$in) {
    const near = [{ targetDate: { $lte: horizon } }];
    if (view === 'work' || view === 'leave') near.push({ reminders: { $elemMatch: { doneAt: null, at: { $lte: now } } } }, { 'reassignRequest.status': 'open' });
    filter.$and = [{ $or: near }];
  }
  const rows = await CareSession.find(filter).select('-form.answers -log').sort({ targetDate: 1 }).limit(['done', 'missed', 'cancelled', 'closed', 'all'].includes(view) ? 300 : 1000).lean();
  const leaves = await leavesFor(rows);
  let list = rows.map((s) => viewOf(s, { now, leaves }));
  const counts = { work: 0, alert: 0, overdue: 0, today: 0, needs_time: 0, tracker_sent: 0, upcoming: 0, leave: 0, requests: 0 };
  list.forEach((s) => {
    if (counts[s.state] != null) counts[s.state] += 1;
    if (WORK.includes(s.state)) counts.work += 1;
    if (s.leave) counts.leave += 1;
    if (s.reassignAsked) counts.requests += 1;
  });
  if (view === 'work') list = list.filter((s) => WORK.includes(s.state) || s.leave || s.reminderDue || (manages(req.user) && s.reassignAsked));
  else if (view === 'requests') list = list.filter((s) => s.reassignAsked);
  else if (['alert', 'overdue', 'today', 'needs_time', 'upcoming'].includes(view)) list = list.filter((s) => s.state === view);
  else if (view === 'leave') list = list.filter((s) => s.leave);
  const rank = { alert: 0, overdue: 1, today: 2, needs_time: 3, tracker_sent: 3, upcoming: 4 };
  if (!['done', 'missed', 'cancelled', 'closed', 'all'].includes(view)) list.sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9) || String(a.dueDay).localeCompare(String(b.dueDay)));
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
  if (!seesAll(req.user) && req.user.role !== ROLES.ASSISTANT_DOCTOR && String(patient.assignedDoctor || '') !== String(req.user._id) && !rows.some((s) => mine(req.user, s))) fail('This patient is not yours', 403);
  const leaves = await leavesFor(rows);
  const now = new Date();
  const phases = (patient.stages || []).filter((s) => s.carePlan?.parts?.length || rows.some((r) => r.phase === s.number)).map((s) => ({
    phase: s.number,
    plan: s.carePlan ? { startedAt: s.carePlan.startedAt, startedByName: s.carePlan.startedByName, parts: s.carePlan.parts || [], coveredDays: C.coveredDays(s.carePlan.parts || []), phaseDays: s.carePlan.phaseDays || C.PHASE_DAYS } : null,
    sessions: rows.filter((r) => r.phase === s.number).map((r) => viewOf(r, { now, leaves })),
  }));
  res.json({ success: true, phases, canManage: manages(req.user) });
});

// @route GET /api/care/sessions/:id  - the session with its form template, what the CRM fills in it and the
// parents' phone numbers (for the call).
const getSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req);
  const Patient = require('../models/Patient');
  const [context, leaves, contact] = await Promise.all([
    buildContext(session.toObject(), req.user), leavesFor([session]),
    Patient.findById(session.patient).select('patientName patientCode number alternateNumber guardianName relativeName age category').lean(),
  ]);
  res.json({
    success: true, session: viewOf(session.toObject(), { leaves, full: true }), template: templateFor(session), context,
    contact: contact ? { name: contact.patientName, code: contact.patientCode || '', phone: contact.number || '', alternate: contact.alternateNumber || '', parent: contact.guardianName || contact.relativeName || '', age: contact.age || '', category: contact.category || '' } : null,
    canAct: mayAct(req.user, session), canManage: manages(req.user), missedReasons: MISSED_REASONS, closeReasons: CLOSE_REASONS, attemptOutcomes: ATTEMPT_LABEL,
  });
});

const openOnly = (session) => { if (!C.isOpen(session)) fail(`This session is already ${session.status === 'completed' ? 'done' : session.status}`); };
// A development tracker is sent and filled (no call time, no form).
const NO_CALL_FOR_TRACKER = 'A development tracker has no call time or form: record when it was sent, then paste the link of the filled tracker';
const notTracker = (session) => { if (session.kind === 'tracker') fail(NO_CALL_FOR_TRACKER); };
const callTime = (value) => {
  const problem = C.callTimeProblem(value);
  if (problem) fail(problem);
  return new Date(value);
};

// @route PATCH /api/care/sessions/:id/call  { callAt }  - the first call time (a set time moves only by rescheduling).
// It makes the call's reminder: 10 minutes before the call it pops up for the person the session is given to.
const setCallTime = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  notTracker(session);
  if (session.callAt) fail('The call time is already set. Use Reschedule to change it.');
  session.callAt = callTime(req.body?.callAt);
  session.status = 'scheduled';
  syncCallReminder(session, req.user.name);
  note(session, req.user, `Call time set: ${C.istText(session.callAt)} (reminder 10 minutes before)`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/reschedule  { callAt, reason }  - at most twice; then complete, missed or cancel.
const reschedule = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  notTracker(session);
  if (!session.callAt) fail('Set the call time first');
  if (session.reschedules.length >= C.RESCHEDULE_LIMIT) fail(`This session was already rescheduled ${C.RESCHEDULE_LIMIT} times. Complete it, mark it missed by the parents, or cancel it.`);
  const reason = text(req.body?.reason, 500);
  if (!reason) fail('Write why the call is rescheduled');
  const to = callTime(req.body?.callAt);
  session.reschedules.push({ at: new Date(), by: req.user._id, byName: req.user.name, from: session.callAt, to, reason });
  session.callAt = to;
  session.status = 'scheduled';
  syncCallReminder(session, req.user.name);
  note(session, req.user, `Rescheduled (${session.reschedules.length}/${C.RESCHEDULE_LIMIT}) to ${C.istText(to)}: ${reason} (reminder moved)`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/attempt  { outcome, calledAt, minutes, note }  - Call details: a call made to the
// parents. When it was made (default now, not in the future); picked up ("connected": how many minutes, what was said)
// or not (why). Only the outcome is required.
const addAttempt = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const outcome = String(req.body?.outcome || '');
  if (!ATTEMPT_LABEL[outcome]) fail('Choose whether the parent picked up, and if not, what happened');
  const now = new Date();
  const calledAt = req.body?.calledAt ? new Date(req.body.calledAt) : now;
  if (Number.isNaN(calledAt.getTime())) fail('Choose when the call was made');
  if (calledAt - now > 5 * 60000) fail('The call time cannot be in the future');
  const connected = outcome === 'connected';
  const raw = req.body?.minutes;
  let durationSec = null;
  if (connected && raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 600) fail('Duration: enter the minutes (0 to 600)');
    durationSec = Math.round(minutes * 60);
  }
  const said = text(req.body?.note, connected ? 3000 : 500);
  session.attempts.push({ at: now, by: req.user._id, byName: req.user.name, outcome, note: said, calledAt, durationSec });
  // The call was made: the call time's reminder stops (once it has started, or whenever the parent picked up).
  const callReminder = session.reminders.find((r) => r.kind === 'call' && !r.doneAt);
  if (callReminder && (connected || callReminder.at <= now)) Object.assign(callReminder, { doneAt: now, doneByName: `${req.user.name} (call recorded)` });
  const how = [ATTEMPT_LABEL[outcome], durationText(durationSec)].filter(Boolean).join(', ');
  note(session, req.user, `Call ${session.attempts.length} (${C.istText(calledAt)}): ${how}${said ? ` — ${said.slice(0, 200)}` : ''}`);
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

// @route POST /api/care/sessions/:id/close  { reason, details }  - close a session that will not happen, with the reason
// and the details (both required). "Missed by patient" reasons close it as missed, the others as closed (cancelled).
const closeSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const picked = CLOSE_REASONS.find((r) => r.label === String(req.body?.reason || ''));
  if (!picked) fail('Choose why it is closed');
  const details = text(req.body?.details, 1000);
  if (details.length < 3) fail('Write the details: what happened (calls made, messages sent, what the parent said)');
  const now = new Date();
  const line = `${picked.label} — ${details}`;
  const notConnected = C.missedCalls(session).length;
  session.closed = { reason: picked.label, details, missed: picked.missed, at: now, byName: req.user.name, attempts: notConnected };
  if (picked.missed) Object.assign(session, { status: 'missed', missedAt: now, missedReason: line, missedByName: req.user.name });
  else Object.assign(session, { status: 'cancelled', cancelledAt: now, cancelReason: line, cancelledByName: req.user.name });
  note(session, req.user, `Closed: ${line} (${notConnected} call${notConnected === 1 ? '' : 's'} not connected)`);
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
  Object.assign(session, { status: session.callAt ? 'scheduled' : 'pending', completedAt: null, completedBy: null, completedByName: '', missedAt: null, missedReason: '', missedByName: '', cancelledAt: null, cancelReason: '', cancelledByName: '', closed: undefined });
  note(session, req.user, `Reopened (was ${was}): ${reason}`);
  await respond(req, res, session);
});

// @route GET /api/care/staff?day=YYYY-MM-DD  - who a session can be given to: the PCCs only, with their leave that day.
const STAFF_ROLES = [ROLES.ASSISTANT_DOCTOR];
const listStaff = asyncHandler(async (req, res) => {
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
  if (!STAFF_ROLES.includes(to.role)) fail('A session is given to a PCC only');
  if (String(session.assignee) === String(to._id)) fail(`${to.name} already has this session`);
  const back = String(to._id) === String(session.owner);
  const reason = text(req.body?.reason, 300);
  if (!back && !reason) fail('Write why (e.g. the PCC is on leave that day)');
  const fromName = session.assigneeName || session.ownerName || '';
  session.assignee = to._id;
  session.assigneeName = to.name;
  session.cover = back ? undefined : { at: new Date(), by: req.user._id, byName: req.user.name, reason, fromName };
  if (session.reassignRequest?.status === 'open') Object.assign(session.reassignRequest, { status: 'done', decidedAt: new Date(), decidedByName: req.user.name, note: `Assigned to ${to.name}` });
  note(session, req.user, back ? `Given back to ${to.name} (the patient's PCC)` : `Assigned to ${to.name} (was ${fromName || 'nobody'}): ${reason}`);
  await respond(req, res, session);
});

// @route POST /api/care/sessions/:id/reassign-request  { reason, suggestedUserId }  - the PCC asks the Manager / Admin
// to give this session to someone else.
const requestReassign = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  if (session.reassignRequest?.status === 'open') fail('A reassign request is already waiting for the Manager');
  const reason = text(req.body?.reason, 500);
  if (!reason) fail('Write why it should go to someone else');
  let suggested = null;
  if (req.body?.suggestedUserId) {
    if (!mongoose.isValidObjectId(req.body.suggestedUserId)) fail('Choose a valid person');
    suggested = await User.findById(req.body.suggestedUserId).select('name role').lean();
    if (!suggested) fail('That person was not found');
    if (!STAFF_ROLES.includes(suggested.role)) fail('Suggest a PCC');
  }
  session.reassignRequest = { at: new Date(), by: req.user._id, byName: req.user.name, reason, suggested: suggested?._id || null, suggestedName: suggested?.name || '', status: 'open' };
  note(session, req.user, `Reassign requested${suggested ? ` (suggested: ${suggested.name})` : ''}: ${reason}`);
  await respond(req, res, session);
});
// @route POST /api/care/sessions/:id/reassign-request/decline  { note }  - Admin / Manager.
const declineReassign = asyncHandler(async (req, res) => {
  if (!manages(req.user)) fail('Only the Admin or Manager answers a reassign request', 403);
  const session = await loadSession(req);
  if (session.reassignRequest?.status !== 'open') fail('No reassign request is waiting');
  const reply = text(req.body?.note, 500);
  if (!reply) fail('Write why it stays with the same person');
  Object.assign(session.reassignRequest, { status: 'declined', decidedAt: new Date(), decidedByName: req.user.name, note: reply });
  session.markModified('reassignRequest');
  note(session, req.user, `Reassign request declined: ${reply}`);
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
  notTracker(session);
  const template = templateFor(session);
  const answers = writeForm(session, template, req.body, req.user);
  const sent = await escalate(req, session, template, answers);
  await respond(req, res, session, { sentToDoctor: sent });
});

// @route POST /api/care/sessions/:id/complete  { answers, startedAt }  - saves the form as filled and marks it done
// (no answer is required).
const completeSession = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  notTracker(session);
  const template = templateFor(session);
  const answers = writeForm(session, template, req.body, req.user);
  const sent = await escalate(req, session, template, answers);
  Object.assign(session, { status: 'completed', completedAt: new Date(), completedBy: req.user._id, completedByName: req.user.name });
  if (!session.callAt) session.callAt = new Date();
  note(session, req.user, `Done — ${answers.final || 'form filled'}`);
  await respond(req, res, session, { sentToDoctor: sent });
});

// ---- Handwritten notes ----------------------------------------------------------------------------------------------
// @route POST /api/care/sessions/:id/notes  (multipart "files": photos from the camera / scans / PDFs)
// Each file is kept on the session and added at the end of the patient's Records Room PDF (their newest Records Room
// entry; one is made for the patient when they have none yet).
const uploadNotes = asyncHandler(async (req, res) => {
  const fs = require('fs');
  const files = req.files || [];
  const cleanup = () => Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
  let session;
  try { session = await loadSession(req, { act: true }); } catch (error) { await cleanup(); throw error; }
  if (!files.length) fail('Take a photo or choose the note to upload');
  if (files.some((file) => !String(file.mimetype).startsWith('image/') && file.mimetype !== 'application/pdf')) { await cleanup(); fail('Only photos / images or PDF files'); }
  const Patient = require('../models/Patient');
  const RecordRoom = require('../models/RecordRoom');
  const { recordRoomConditions, looseSource } = require('../utils/recordRoomMatch');
  const { rebuildPdf } = require('./recordRoomController');
  const patient = await Patient.findById(session.patient).select('patientName patientCode').lean();
  const code = String(patient?.patientCode || session.patientCode || '').trim();
  const source = looseSource(code);
  const entries = source ? await require('../models/AppointmentManagementEntry').find({ [`values.${require('../utils/receptionFlow').RECEPTION_IDS.patientId}`]: { $regex: source, $options: 'i' } }).select('appointmentCode').lean() : [];
  const records = await RecordRoom.find({ $or: recordRoomConditions({ patientRef: session.patient, patientCode: code, appointmentCodes: entries.map((e) => e.appointmentCode) }) });
  const rank = (r) => new Date(r.pdfUpdatedAt || r.updatedAt || 0).getTime() + (r.treatmentStatus === 'bought' ? 1e13 : 0);
  let record = records.sort((a, b) => rank(b) - rank(a))[0];
  const now = new Date();
  if (!record) record = new RecordRoom({ patient: session.patient, patientId: code, patientName: patient?.patientName || session.patientName, treatmentStatus: 'bought', firstReceivedAt: now, createdByName: req.user.name });
  const label = `Handwritten note - ${session.code} ${session.title} (${C.dayOf(now)})`;
  const first = record.documents.length;
  try {
    record.documents.push(...files.map((file, i) => ({ url: `/uploads/records/${file.filename}`, fileName: `${label}${files.length > 1 ? ` ${i + 1}` : ''}${require('path').extname(file.filename)}`, uploadedAt: now, uploadedByName: req.user.name })));
    await rebuildPdf(record);
    await record.save();
  } catch (error) {
    record.documents.splice(first);
    await cleanup();
    throw error;
  }
  files.forEach((file, i) => session.notes.push({ url: `/uploads/records/${file.filename}`, fileName: file.originalname || `${label} ${i + 1}`, mimeType: file.mimetype, at: now, byName: req.user.name, recordRoom: record._id, recordRoomPdf: record.pdfUrl, pdfPageCount: record.pdfPageCount }));
  note(session, req.user, `Handwritten note${files.length > 1 ? `s (${files.length})` : ''} uploaded and added to the Records Room PDF (${record.pdfPageCount} pages)`);
  await respond(req, res, session, { recordRoom: { id: String(record._id), pdfUrl: record.pdfUrl, pdfName: record.pdfName, pages: record.pdfPageCount } });
});

// ---- Development tracker --------------------------------------------------------------------------------------------
const trackerOnly = (session) => { if (session.kind !== 'tracker') fail('Only a development tracker is sent and filled'); };
const plainOf = (value) => (value?.toObject ? value.toObject() : value || {});
// @route POST /api/care/sessions/:id/tracker-sent  { sentAt }  - when the tracker was sent to the parents (it can be
// corrected until the filled tracker comes).
const trackerSent = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  trackerOnly(session);
  openOnly(session);
  const sentAt = req.body?.sentAt ? new Date(req.body.sentAt) : null;
  if (!sentAt || Number.isNaN(sentAt.getTime())) fail('Choose when the tracker was sent');
  if (sentAt - Date.now() > 5 * 60000) fail('The sent time cannot be in the future');
  const again = Boolean(session.tracker?.sentAt);
  session.tracker = { ...plainOf(session.tracker), sentAt, sentByName: req.user.name, sentRecordedAt: new Date() };
  note(session, req.user, `${again ? 'Tracker sent time changed' : 'Tracker sent'}: ${C.istText(sentAt)}`);
  await respond(req, res, session);
});
// @route POST /api/care/sessions/:id/tracker-filled  { link }  - the link of the parents' filled tracker; this completes
// the session.
const trackerFilled = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  trackerOnly(session);
  openOnly(session);
  if (!session.tracker?.sentAt) fail('First record when the tracker was sent');
  const link = text(req.body?.link, 1000);
  let web = false;
  try { web = ['http:', 'https:'].includes(new URL(link).protocol); } catch { web = false; }
  if (!web) fail('Paste the link of the filled tracker (it starts with https://)');
  const now = new Date();
  session.tracker = { ...plainOf(session.tracker), filledLink: link, filledAt: now, filledByName: req.user.name };
  Object.assign(session, { status: 'completed', completedAt: now, completedBy: req.user._id, completedByName: req.user.name });
  note(session, req.user, `Tracker filled — done: ${link}`);
  await respond(req, res, session);
});

// ---- Reminders ------------------------------------------------------------------------------------------------------
// @route POST /api/care/sessions/:id/reminders  { at, note }
const addReminder = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  openOnly(session);
  const at = new Date(req.body?.at);
  if (!req.body?.at || Number.isNaN(at.getTime())) fail('Choose when to be reminded');
  if (at.getTime() > Date.now() + 200 * 86400000) fail('The reminder is too far ahead');
  const noteText = text(req.body?.note, 300);
  if (!noteText) fail('Write what the reminder is for');
  session.reminders.push({ at, note: noteText, byName: req.user.name, createdAt: new Date() });
  note(session, req.user, `Reminder set for ${at.toISOString()}: ${noteText}`);
  await respond(req, res, session);
});
// @route PATCH /api/care/sessions/:id/reminders/:reminderId  { done: true | false }
const updateReminder = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  const reminder = session.reminders.id(req.params.reminderId);
  if (!reminder) fail('Reminder not found', 404);
  const done = req.body?.done !== false;
  Object.assign(reminder, done ? { doneAt: new Date(), doneByName: req.user.name } : { doneAt: null, doneByName: '' });
  note(session, req.user, `Reminder ${done ? 'done' : 'opened again'}: ${reminder.note}`);
  await respond(req, res, session);
});

// ---- Doctor advice --------------------------------------------------------------------------------------------------
// @route GET /api/care/sessions/:id/advice  - the patient's queries to the doctor (newest first), those from this session marked.
const sessionAdvice = asyncHandler(async (req, res) => {
  const session = await loadSession(req);
  const AdviceRequest = require('../models/AdviceRequest');
  const rows = await AdviceRequest.find({ patient: session.patient }).sort({ createdAt: -1 }).limit(50)
    .select('stage query askedAt createdAt status isUrgent requestedByName advice adviceGivenAt adviceGivenByName adviceVoice.url sentToPatientAt resolvedAt rounds alarms lastAlarmAt').lean();
  const mineIds = new Set((session.doctorRequests || []).map((d) => String(d.advice)));
  res.json({
    success: true,
    advice: rows.map((a) => ({
      id: String(a._id), phase: a.stage, query: a.query, askedAt: a.askedAt || a.createdAt, urgent: Boolean(a.isUrgent), by: a.requestedByName || '',
      status: a.resolvedAt ? 'solved' : a.status === 'advice_given' ? (a.sentToPatientAt ? 'sent to patient' : 'answered') : 'waiting for the doctor',
      advice: a.advice || '', adviceAt: a.adviceGivenAt, adviceBy: a.adviceGivenByName || '', voice: a.adviceVoice?.url || '', fromThisSession: mineIds.has(String(a._id)), rounds: (a.rounds || []).length,
      // Still with the doctor: the PCC can ring the doctor's alarm (POST /api/advice/:id/alarm).
      canRing: !a.resolvedAt && a.status === 'requested', rings: (a.alarms || []).length, lastAlarmAt: a.lastAlarmAt || null, lastAlarmBy: (a.alarms || []).slice(-1)[0]?.byName || '',
    })),
  });
});
// @route POST /api/care/sessions/:id/advice  { query, urgent }  - ask the doctor from this session.
const askDoctor = asyncHandler(async (req, res) => {
  const session = await loadSession(req, { act: true });
  const query = text(req.body?.query, 3000);
  if (!query) fail('Write the question for the doctor');
  const urgent = Boolean(req.body?.urgent);
  const now = new Date();
  const advice = await require('../models/AdviceRequest').create({
    patient: session.patient, stage: session.phase, query: `${session.code} ${session.title} (day ${session.day}): ${query}`, askedAt: now, isUrgent: urgent,
    requestedBy: req.user._id, requestedByName: req.user.name, requestedByRole: req.user.role,
    timeline: [{ at: now, action: urgent ? 'Query raised (emergency) from the follow-up' : 'Query raised from the follow-up', details: query.slice(0, 1000), byName: req.user.name, byRole: req.user.role }],
  });
  session.doctorRequests.push({ advice: advice._id, level: urgent ? 'Asked (urgent)' : 'Asked', blockId: '', at: now });
  note(session, req.user, `Asked the doctor${urgent ? ' (urgent)' : ''}: ${query.slice(0, 200)}`);
  const server = req.app?.get?.('io');
  if (server) { server.to('advice:doctors').emit('advice:changed', { id: String(advice._id) }); ['enquiry:admins', 'enquiry:managers'].forEach((room) => server.to(room).emit('advice:changed', { id: String(advice._id) })); }
  await respond(req, res, session);
});

// @route GET /api/care/reminders  - the reminders popping up now for the signed-in person: the call time's (from 10
// minutes before the call) and their own, of the open sessions given to them. A call time set before these reminders
// were kept gets the same reminder until a call is recorded.
const myReminders = asyncHandler(async (req, res) => {
  const now = new Date();
  const soon = new Date(now.getTime() + C.CALL_LEAD_MS);
  const rows = mongoose.connection.readyState !== 1 ? [] : await CareSession.find({ assignee: req.user._id, status: { $in: C.OPEN }, $or: [
    { reminders: { $elemMatch: { doneAt: null, at: { $lte: now } } } },
    { callAt: { $ne: null, $lte: soon }, 'reminders.kind': { $ne: 'call' } },
  ] }).select('patient patientName patientCode phase kind code title day callAt reminders attempts.at attempts.calledAt').lean();
  res.json({ success: true, reminders: remindersOf(rows, now) });
});
const remindersOf = (rows, now = new Date()) => {
  const items = [];
  rows.forEach((s) => {
    const base = { sessionId: String(s._id), patientId: String(s.patient), patientName: s.patientName, patientCode: s.patientCode || '', phase: s.phase, code: s.code, title: s.title, callAt: s.callAt || null };
    const tracker = s.kind === 'tracker';
    (s.reminders || []).filter((r) => !r.doneAt && new Date(r.at) <= now && !(tracker && r.kind === 'call'))
      .forEach((r) => items.push({ ...base, id: `care-${r._id}`, kind: r.kind === 'call' ? 'call' : 'note', at: r.at, note: r.note }));
    if (s.callAt && !tracker && !(s.reminders || []).some((r) => r.kind === 'call')) {
      const from = new Date(new Date(s.callAt).getTime() - C.CALL_LEAD_MS);
      const called = (s.attempts || []).some((a) => new Date(a.at) >= from);
      if (from <= now && !called) items.push({ ...base, id: `care-call-${s._id}-${from.getTime()}`, kind: 'call', at: from, note: `Call the parent — call time ${C.istText(s.callAt)}` });
    }
  });
  return items.sort((a, b) => new Date(a.at) - new Date(b.at));
};

// Open sessions waiting on a person (sidebar count / Your pending work): red alert, overdue, today, no call time
// within 3 days, a reminder due, or on a leave day (for the Manager / Admin).
const careWork = async (user, now = new Date()) => {
  if (mongoose.connection.readyState !== 1) return [];
  // Due within 3 days, or a reminder due, or (Manager / Admin) a reassign request waiting - whatever the day.
  const filter = { status: { $in: C.OPEN }, $or: [
    { targetDate: { $lte: C.addDays(C.dayOf(now), 3) } },
    { reminders: { $elemMatch: { doneAt: null, at: { $lte: now } } } },
    ...(manages(user) ? [{ 'reassignRequest.status': 'open' }] : []),
  ] };
  if (!seesAll(user)) filter.assignee = user._id;
  const rows = await CareSession.find(filter).select('patient patientName patientCode phase kind seq code title day targetDate callAt status owner ownerName assignee assigneeName reschedules cover reminders reassignRequest tracker').lean();
  const leaves = manages(user) ? await leavesFor(rows) : new Map();
  return rows.map((s) => viewOf(s, { now, leaves })).filter((s) => WORK.includes(s.state) || s.leave || s.reminderDue || (manages(user) && s.reassignAsked))
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
  // Only the sessions given to this person: one reassigned to a colleague (e.g. while on leave) leaves this calendar
  // and shows on the colleague's.
  const rows = await CareSession.find({ assignee: userId, targetDate: { $gte: C.addDays(from, -7), $lte: C.addDays(to, 7) } })
    .select('-form.answers -log').lean();
  const leaves = await leavesOf([userId], from, to);
  const now = new Date();
  const sessions = rows.map((s) => viewOf(s, { now, leaves })).filter((s) => s.dueDay >= from && s.dueDay <= to);
  // The old follow-ups / family sessions of this PCC's patients that month (done or still open; not the ones moved
  // to the Care Schedule), so the calendar shows everything.
  const Patient = require('../models/Patient');
  const oldOf = await Patient.find({ assignedDoctor: userId, isActive: { $ne: false }, $or: [{ 'stages.followUps.dateTime': { $gte: C.atTime(from, '00:00'), $lte: C.atTime(to, '23:59') } }, { 'stages.familySessions.dateTime': { $gte: C.atTime(from, '00:00'), $lte: C.atTime(to, '23:59') } }] })
    .select('patientName patientCode stages.number stages.followUps.dateTime stages.followUps.status stages.followUps.followUpType stages.followUps.convertedAt stages.familySessions.dateTime stages.familySessions.status stages.familySessions.convertedAt').lean();
  const old = [];
  oldOf.forEach((p) => (p.stages || []).forEach((stage) => {
    const add = (entry, type) => {
      if (!entry?.dateTime || entry.convertedAt) return;
      const day = C.dayOf(entry.dateTime);
      if (day < from || day > to) return;
      old.push({ patientId: String(p._id), patientName: p.patientName, patientCode: p.patientCode || '', phase: stage.number, at: entry.dateTime, day, type, status: entry.status });
    };
    (stage.followUps || []).forEach((e) => add(e, e.followUpType === 'tracker' ? 'tracker' : 'followup'));
    (stage.familySessions || []).forEach((e) => add(e, 'family'));
  }));
  const days = [];
  for (let day = from; day <= to; day = C.addDays(day, 1)) {
    days.push({ day, weekday: C.weekdayOf(day), closed: C.isOffDay(day), leave: leaveOn(leaves, userId, day), sessions: sessions.filter((s) => s.dueDay === day), old: old.filter((o) => o.day === day).sort((a, b) => new Date(a.at) - new Date(b.at)) });
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

// ---- Old patients onto the Care Schedule (utils/careConvert.js, utils/careMigration.js) -----------------------------
// @route GET /api/care/convert  (Admin / Manager) - what moving the old patients would do, phase by phase.
const convertPreview = asyncHandler(async (req, res) => {
  if (!manages(req.user)) fail('Only the Admin or Manager moves old patients to the Care Schedule', 403);
  const { oldPatients, previewRows } = require('../utils/careMigration');
  const rows = previewRows(await oldPatients(), new Date());
  const ready = rows.filter((r) => r.ok);
  res.json({
    success: true, rows,
    totals: { phases: rows.length, ready: ready.length, newSessions: ready.reduce((n, r) => n + r.items.length, 0), closed: ready.reduce((n, r) => n + r.close, 0) },
  });
});

// @route POST /api/care/convert  { items: [{ patientId, phase }] } or { all: true }  (Admin / Manager)
const convertRun = asyncHandler(async (req, res) => {
  if (!manages(req.user)) fail('Only the Admin or Manager moves old patients to the Care Schedule', 403);
  const wanted = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
  if (!req.body?.all && !wanted.length) fail('Choose the patients to move');
  const out = await require('../utils/careMigration').moveOldPatients({ user: req.user, all: Boolean(req.body?.all), wanted });
  req.app?.get?.('io')?.emit?.('care:changed', { converted: out.moved });
  res.json({ success: true, ...out });
});

module.exports = {
  uploadNotes,
  requestReassign, declineReassign,
  addReminder, updateReminder, sessionAdvice, askDoctor,
  convertPreview, convertRun,
  calendar, markLeave, removeLeave,
  listSessions, patientSessions, getSession, setCallTime, reschedule, addAttempt, markMissed, cancelSession, reopenSession, listStaff, assignSession,
  saveForm, completeSession, closeSession, careWork, viewOf, MISSED_REASONS, CLOSE_REASONS, ATTEMPT_LABEL, myReminders, remindersOf, trackerSent, trackerFilled,
};
