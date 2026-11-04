const mongoose = require('mongoose');
const IncomingCall = require('../models/IncomingCall');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { isAdminLike } = require('../constants/roles');

// In Transit's log of incoming calls from patients (see models/IncomingCall). The patient is found by name, Patient ID
// or phone; each entry keeps when the call came, who called, the question and the answer given.
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const text = (value, label, max, required = false) => {
  const clean = String(value ?? '').trim();
  if (required && !clean) fail(`${label} is required`);
  if (clean.length > max) fail(`${label} is too long (maximum ${max} characters)`);
  return clean;
};
const serialize = (row, user) => ({
  id: String(row._id), patientId: row.patient ? String(row.patient) : '', patientName: row.patientName, patientCode: row.patientCode,
  callerName: row.callerName, callerPhone: row.callerPhone, receivedAt: row.receivedAt, durationMinutes: row.durationMinutes,
  query: row.query, answer: row.answer, followUpNeeded: Boolean(row.followUpNeeded), source: row.source,
  followUpDone: row.followUpDoneAt ? { at: row.followUpDoneAt, byName: row.followUpDoneByName, note: row.followUpNote, onCall: row.followUpDoneOnCall ? String(row.followUpDoneOnCall) : '' } : null,
  createdByName: row.createdByName, createdAt: row.createdAt, editedAt: row.editedAt, editedByName: row.editedByName,
  canEdit: isAdminLike(user) || String(row.createdBy) === String(user._id),
});

// The fields of a call from the form; the patient is looked up so name / ID stay right.
const callFields = async (body) => {
  const receivedAt = new Date(body.receivedAt);
  if (!body.receivedAt || Number.isNaN(receivedAt.getTime())) fail('Enter when the call came');
  if (receivedAt > new Date(Date.now() + 60000)) fail('The call time cannot be in the future');
  let patient = null;
  if (body.patientId) {
    if (!mongoose.Types.ObjectId.isValid(String(body.patientId))) fail('Select a valid patient');
    patient = await Patient.findById(body.patientId).select('patientName patientCode number').lean();
    if (!patient) fail('Patient not found', 404);
  }
  const patientName = patient?.patientName || text(body.patientName, 'Patient / caller name', 200);
  if (!patientName && !String(body.callerName || '').trim()) fail('Select the patient or enter the caller name');
  const duration = body.durationMinutes === '' || body.durationMinutes == null ? null : Number(body.durationMinutes);
  if (duration != null && (!Number.isFinite(duration) || duration < 0 || duration > 600)) fail('Enter a valid call duration in minutes');
  return {
    patient: patient?._id || null, patientName, patientCode: patient?.patientCode || '',
    callerName: text(body.callerName, 'Caller name', 200), callerPhone: text(body.callerPhone, 'Caller phone', 20).replace(/[^\d+]/g, ''),
    receivedAt, durationMinutes: duration,
    query: text(body.query, 'What the caller asked', 2000, true), answer: text(body.answer, 'What was answered', 2000, true),
    followUpNeeded: body.followUpNeeded === true || body.followUpNeeded === 'true',
  };
};

// @route GET /api/incoming-calls/patients?q=   find a patient by name, Patient ID or phone
const searchPatients = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, patients: [] });
  const rx = new RegExp(escapeRegex(q), 'i');
  const digits = q.replace(/\D/g, '');
  const or = [{ patientName: rx }, { patientCode: rx }, { guardianName: rx }];
  if (digits.length >= 4) or.push({ $expr: { $regexMatch: { input: { $toString: '$number' }, regex: escapeRegex(digits) } } });
  const patients = await Patient.find({ $or: or }).select('patientName patientCode number guardianName').sort({ updatedAt: -1 }).limit(10).lean();
  res.json({ success: true, patients: patients.map((p) => ({ id: String(p._id), patientName: p.patientName, patientCode: p.patientCode || '', phone: p.number ? String(p.number) : '', guardianName: p.guardianName || '' })) });
});

// @route GET /api/incoming-calls?q=&from=&to=&patientId=&page=
const listIncomingCalls = asyncHandler(async (req, res) => {
  const filter = {};
  const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  if (day(req.query.from) || day(req.query.to)) {
    filter.receivedAt = {};
    if (day(req.query.from)) filter.receivedAt.$gte = new Date(`${req.query.from}T00:00:00+05:30`);
    if (day(req.query.to)) filter.receivedAt.$lte = new Date(`${req.query.to}T23:59:59.999+05:30`);
  }
  if (req.query.patientId && mongoose.Types.ObjectId.isValid(String(req.query.patientId))) filter.patient = req.query.patientId;
  // Calls whose follow-up is still open.
  if (req.query.followUp === 'open') Object.assign(filter, { followUpNeeded: true, followUpDoneAt: null });
  const q = String(req.query.q || '').trim();
  if (q) { const rx = new RegExp(escapeRegex(q), 'i'); filter.$or = [{ patientName: rx }, { patientCode: rx }, { callerName: rx }, { callerPhone: rx }, { query: rx }, { answer: rx }]; }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;
  const [rows, total] = await Promise.all([
    IncomingCall.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    IncomingCall.countDocuments(filter),
  ]);
  const openFollowUps = await IncomingCall.countDocuments({ followUpNeeded: true, followUpDoneAt: null });
  res.json({ success: true, calls: rows.map((r) => serialize(r, req.user)), total, page, pages: Math.max(1, Math.ceil(total / limit)), openFollowUps });
});

// @route POST /api/incoming-calls
const createIncomingCall = asyncHandler(async (req, res) => {
  const fields = await callFields(req.body);
  const row = await IncomingCall.create({ ...fields, source: 'manual', createdBy: req.user._id, createdByName: req.user.name });
  // This call also closes earlier follow-ups of the same patient that were ticked on the form.
  const closeIds = (Array.isArray(req.body.closeFollowUps) ? req.body.closeFollowUps : []).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  if (closeIds.length && fields.patient) {
    await IncomingCall.updateMany({ _id: { $in: closeIds }, patient: fields.patient, followUpNeeded: true, followUpDoneAt: null }, {
      $set: { followUpDoneAt: new Date(), followUpDoneByName: req.user.name, followUpNote: `Called / answered on the call of ${fields.receivedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}: ${fields.answer}`.slice(0, 1000), followUpDoneOnCall: row._id },
    });
  }
  res.status(201).json({ success: true, call: serialize(row.toObject(), req.user) });
});

// @route PATCH /api/incoming-calls/:id   (the person who logged it, or the admin)
const updateIncomingCall = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) fail('Invalid call');
  const row = await IncomingCall.findById(req.params.id);
  if (!row) fail('Call not found', 404);
  if (!isAdminLike(req.user) && String(row.createdBy) !== String(req.user._id)) fail('Only the person who logged this call can edit it', 403);
  Object.assign(row, await callFields(req.body), { editedAt: new Date(), editedByName: req.user.name });
  await row.save();
  res.json({ success: true, call: serialize(row.toObject(), req.user) });
});

// @route POST /api/incoming-calls/:id/follow-up-done  { note }  - anyone in In Transit closes a follow-up: called back,
// solution given. The note says what was done.
const markFollowUpDone = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) fail('Invalid call');
  const note = text(req.body.note, 'What was done', 1000, true);
  const row = await IncomingCall.findOneAndUpdate({ _id: req.params.id, followUpNeeded: true, followUpDoneAt: null },
    { $set: { followUpDoneAt: new Date(), followUpDoneByName: req.user.name, followUpNote: note } }, { new: true }).lean();
  if (!row) fail('This follow-up is already done or not needed', 409);
  res.json({ success: true, call: serialize(row, req.user) });
});

module.exports = { searchPatients, listIncomingCalls, createIncomingCall, updateIncomingCall, markFollowUpDone, callFields };
