const mongoose = require('mongoose');
const Management = require('../models/AppointmentManagementEntry');
const PatientIdCounter = require('../models/PatientIdCounter');
const Patient = require('../models/Patient');
const User = require('../models/User');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { dateRoom, postCounselingUserRoom, POST_COUNSELING_ALL_ROOM } = require('../realtime/salesSheetSocket');
const { notGivenView } = require('../utils/postCounselingNotGiven');
const { PATIENT_TYPE_ID, EXISTING, existingCodeFrom, resolveExisting, findByCode, summaryOf } = require('../utils/existingPatient');
const {
  SALES_IDS, RECEPTION_IDS, FIRST_SERIAL, TIME_PATTERN, REGISTRATION_FIELDS, FIELD_GROUPS, istDate, patientIdFor, cleanRegistration, missingForSend, defaultsFromSales,
} = require('../utils/receptionFlow');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validId = (id) => mongoose.Types.ObjectId.isValid(String(id || '')) && String(id).length === 24;
const patientIdPath = `values.${RECEPTION_IDS.patientId}`;
const mapValue = (map, id) => String((map?.get ? map.get(id) : map?.[id]) ?? '');
const valueOf = (entry, id) => mapValue(entry.values, id);

const audit = async (req, entry, action, details = '') => {
  try {
    await SalesSheetAudit.create({ sheet: 'management', rowId: entry._id, appointmentCode: entry.appointmentCode || '', action, details, changedBy: req.user._id, changedByName: req.user.name });
  } catch (error) {
    console.error('Reception flow audit could not be saved:', error.message);
  }
};
const emitChanged = (req, entry) => req.app.get('io')?.to(dateRoom(entry.appointmentDate)).emit('sales-sheet:date-changed', { date: entry.appointmentDate });

const loadEntry = async (req) => {
  if (!validId(req.params.id)) throw fail('Invalid appointment');
  const entry = await Management.findById(req.params.id);
  if (!entry) throw fail('Appointment not found', 404);
  return entry;
};

// Serial numbers come from an atomic per-day counter; the check below only guards against an old manual ID.
const generatePatientId = async (patientName) => {
  const date = istDate();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const counter = await PatientIdCounter.findOneAndUpdate({ key: date }, { $inc: { seq: 1 } }, { upsert: true, new: true });
    const candidate = patientIdFor(patientName, date, FIRST_SERIAL + counter.seq - 1);
    const taken = await Patient.exists({ patientCode: candidate }) || await Management.exists({ [patientIdPath]: candidate });
    if (!taken) return candidate;
  }
  throw fail('Could not generate a unique Patient ID. Please try again.', 409);
};

// Read-only facts shown with the registration (taken from the arrival step and the appointment).
const metaOf = (entry) => ({
  appointmentCode: entry.appointmentCode || '',
  appointmentDate: entry.appointmentDate || '',
  arrivalTime: valueOf(entry, RECEPTION_IDS.arrivalTime),
  tokenNumber: valueOf(entry, RECEPTION_IDS.tokenNumber),
});

const registrationView = (entry) => {
  const salesValues = Object.fromEntries(entry.salesValues || []);
  const saved = entry.registration?.fields ? Object.fromEntries(entry.registration.fields) : {};
  const registration = entry.registration || {};
  return {
    id: String(entry._id),
    appointmentCode: entry.appointmentCode || '',
    patientId: valueOf(entry, RECEPTION_IDS.patientId),
    // The old Patient ID when Sales marked this as an existing patient's appointment.
    existingPatientCode: existingCodeFrom(entry.salesValues || {}),
    phaseChosen: Boolean(saved.phase),
    arrivalStatus: valueOf(entry, RECEPTION_IDS.arrivalStatus),
    arrivalTime: valueOf(entry, RECEPTION_IDS.arrivalTime),
    tokenNumber: entry.tokenNumber || null,
    fields: { ...defaultsFromSales(salesValues), ...saved },
    fieldDefs: REGISTRATION_FIELDS,
    groups: FIELD_GROUPS,
    meta: metaOf(entry),
    status: registration.status || 'draft',
    postCounselor: registration.postCounselor ? String(registration.postCounselor) : '',
    postCounselorName: registration.postCounselorName || '',
    sentAt: registration.sentAt || null,
    consultationDate: registration.consultationDate || '',
    // Sent back by the Post Counselor: the correction reception has to make before sending again.
    returned: registration.returned?.at ? { reason: registration.returned.reason, at: registration.returned.at, byName: registration.returned.byName } : null,
    returns: (registration.returns || []).map((r) => ({ reason: r.reason, at: r.at, byName: r.byName, resentAt: r.resentAt || null, resentByName: r.resentByName || '' })),
  };
};

// @route POST /api/sales-sheet/management/:id/arrival
const Counter = require('../models/Counter');
const TOKEN_START = 11;
const markArrival = asyncHandler(async (req, res) => {
  const entry = await loadEntry(req);
  const status = String(req.body.status || '');
  const time = String(req.body.time || '').trim();
  if (!['Arriving', 'Arrived', 'Online'].includes(status)) throw fail('Choose Arriving, Arrived or Online');
  // Online = the patient joins an online consultation: like Arrived, it needs the time and gets a Patient ID.
  const joined = status === 'Arrived' || status === 'Online';
  if (joined && !TIME_PATTERN.test(time)) throw fail(status === 'Online' ? 'Enter the online consultation time' : 'Enter the arrival time');
  if (time && !TIME_PATTERN.test(time)) throw fail('Enter a valid arrival time');
  await Management.updateOne({ _id: entry._id }, {
    $set: { [`values.${RECEPTION_IDS.arrivalStatus}`]: status, [`values.${RECEPTION_IDS.arrivalTime}`]: time, updatedByName: req.user.name, lastEditedAt: new Date() },
  });
  let patientId = valueOf(entry, RECEPTION_IDS.patientId);
  let generated = false;
  let existing = false;
  // An existing patient keeps their old Patient ID: no new one is generated.
  const isExisting = mapValue(entry.salesValues, PATIENT_TYPE_ID) === EXISTING;
  let existingCode = '';
  if (joined && !patientId && isExisting) {
    const code = existingCodeFrom(entry.salesValues);
    if (!code) throw fail('This appointment is for an existing patient. Enter the Old Patient ID in Sales details first.');
    const found = await findByCode(code, 'patientCode');
    if (!found) throw fail(`This appointment is for an existing patient, but no patient has Patient ID ${code}. Correct the Old Patient ID in Sales details first.`);
    existingCode = found.patientCode;
  }
  if (joined && !patientId) {
    const candidate = existingCode || await generatePatientId(mapValue(entry.salesValues, SALES_IDS.patientName));
    const result = await Management.updateOne({ _id: entry._id, $or: [{ [patientIdPath]: { $exists: false } }, { [patientIdPath]: '' }] }, { $set: { [patientIdPath]: candidate } });
    if (result.modifiedCount) { patientId = candidate; generated = !existingCode; existing = Boolean(existingCode); }
    else patientId = valueOf(await Management.findById(entry._id), RECEPTION_IDS.patientId);
  }
  // The token of the day, in the order patients are marked Arrived / Online: the first is 11, then 12, 13 ...
  // New and existing patients both get one; it is given once and kept when the arrival is edited.
  let tokenNumber = entry.tokenNumber || null;
  if (joined && !tokenNumber) {
    const day = entry.appointmentDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const candidate = TOKEN_START - 1 + await Counter.next(`arrivalToken:${day}`);
    const result = await Management.updateOne({ _id: entry._id, tokenNumber: null }, { $set: { tokenNumber: candidate, tokenDate: day } });
    tokenNumber = result.modifiedCount ? candidate : (await Management.findById(entry._id).select('tokenNumber').lean())?.tokenNumber || null;
  }
  await audit(req, entry, status === 'Online' ? 'Online consultation marked' : 'Arrival marked', `${status}${time ? ` at ${time}` : ''}${generated ? `, Patient ID ${patientId}` : ''}${existing ? `, existing patient ${patientId} (no new ID)` : ''}${tokenNumber && !entry.tokenNumber ? `, token ${tokenNumber}` : ''}`);
  emitChanged(req, entry);
  res.json({ success: true, arrivalStatus: status, arrivalTime: time, patientId, generated, existing, tokenNumber });
});

// An existing patient's registration starts from what the CRM already has about them (only empty fields are filled),
// and says which phase this visit's purchase will go into.
const PATIENT_FIELD_FOR = { fatherNumber: 'number', motherNumber: 'alternateNumber' };
const CHANGES_WITH_TIME = new Set(['age', 'weight', 'height', 'headCircumference']);
const withExistingPatient = async (view) => {
  // Only a visit Sales marked Existing is looked up; its Patient ID is the patient's old one.
  if (!view.existingPatientCode || !view.patientId) return view;
  const patient = await findByCode(view.patientId);
  if (!patient) return view;
  const fields = { ...view.fields };
  REGISTRATION_FIELDS.forEach(({ key }) => {
    // These change as the child grows, so they are asked again at every visit, never copied from the old record.
    if (CHANGES_WITH_TIME.has(key)) return;
    const known = patient[PATIENT_FIELD_FOR[key] || key];
    if (!String(fields[key] ?? '').trim() && known !== undefined && known !== null && String(known).trim()) fields[key] = String(known);
  });
  const existingPatient = await summaryOf(patient);
  // Until someone picks it, an existing patient's visit is for their next phase.
  if (!view.phaseChosen && existingPatient.nextPhase) fields.phase = String(existingPatient.nextPhase);
  return { ...view, fields, existingPatient };
};

// @route GET /api/sales-sheet/management/:id/registration
const getRegistration = asyncHandler(async (req, res) => {
  res.json({ success: true, registration: await withExistingPatient(registrationView(await loadEntry(req))) });
});

// @route GET /api/sales-sheet/existing-patient?code=   (Sales / Reception: check an old Patient ID)
const lookupExistingPatient = asyncHandler(async (req, res) => {
  const found = await resolveExisting(req.query.code);
  if (found.error) throw fail(found.error, 404);
  res.json({ success: true, patient: found.summary });
});

// @route PUT /api/sales-sheet/management/:id/registration   (save without sending)
const saveRegistration = asyncHandler(async (req, res) => {
  const entry = await loadEntry(req);
  if (!valueOf(entry, RECEPTION_IDS.patientId)) throw fail('Mark the patient as arrived first');
  if (entry.registration?.status === 'sent') throw fail('This registration was already sent to a Post Counselor', 409);
  const fields = cleanRegistration(req.body.fields);
  await Management.updateOne({ _id: entry._id, 'registration.status': { $ne: 'sent' } }, {
    $set: { 'registration.fields': fields, 'registration.status': 'draft', 'registration.savedAt': new Date(), 'registration.savedByName': req.user.name },
  });
  await audit(req, entry, 'Registration saved', 'Registration details saved (not sent yet)');
  res.json({ success: true, registration: registrationView(await Management.findById(entry._id)) });
});

// @route POST /api/sales-sheet/management/:id/registration/send   (Registration complete -> Post Counselor)
const sendRegistration = asyncHandler(async (req, res) => {
  const entry = await loadEntry(req);
  const patientId = valueOf(entry, RECEPTION_IDS.patientId);
  if (!patientId) throw fail('Mark the patient as arrived first');
  if (entry.registration?.status === 'sent') throw fail('This registration was already sent to a Post Counselor', 409);
  const fields = cleanRegistration(req.body.fields ?? registrationView(entry).fields);
  // A form opened before the Phase field existed: use Phase 1, or an existing patient's next phase.
  if (!fields.phase) fields.phase = (await withExistingPatient(registrationView(entry))).fields.phase || '1';
  const missing = missingForSend(fields);
  if (missing.length) throw fail(`Fill these before sending: ${missing.join(', ')}`);
  if (!validId(req.body.postCounselorId)) throw fail('Choose a Post Counselor');
  const counselor = await User.findOne({ _id: req.body.postCounselorId, role: ROLES.POST_COUNSELOR, isActive: true }).select('name').lean();
  if (!counselor) throw fail('Choose an active Post Counselor');
  const now = new Date();
  // A registration sent back for a correction goes again: the return is answered, the history stays.
  const previous = entry.registration || {};
  const returns = (previous.returns || []).map((r) => (r.resentAt ? r : { reason: r.reason, at: r.at, byName: r.byName, resentAt: now, resentByName: req.user.name }));
  const updated = await Management.findOneAndUpdate({ _id: entry._id, 'registration.status': { $ne: 'sent' } }, {
    $set: {
      registration: {
        fields, status: 'sent', savedAt: now, savedByName: req.user.name, postCounselor: counselor._id, postCounselorName: counselor.name,
        sentAt: now, sentByName: req.user.name, consultationDate: previous.consultationDate || istDate(now),
        returned: null, ...(returns.length ? { returns } : {}), ...(previous.reassignments?.length ? { reassignments: previous.reassignments } : {}),
      },
      updatedByName: req.user.name, lastEditedAt: now,
    },
  }, { new: true });
  if (!updated) throw fail('This registration was already sent to a Post Counselor', 409);
  await audit(req, entry, 'Registration sent', `Patient ${patientId} sent to Post Counselor ${counselor.name}`);
  emitChanged(req, entry);
  req.app.get('io')?.to(postCounselingUserRoom(counselor._id)).to(POST_COUNSELING_ALL_ROOM).emit('post-counseling:changed', { id: String(entry._id) });
  res.json({ success: true, registration: registrationView(updated) });
});

// @route POST /api/post-counseling/patients/:id/return   { reason }   (the assigned Post Counselor, Admin / Manager)
// Something reception filled is wrong: the registration goes back to reception with the note, leaves the Post
// Counselor's list, and comes back when reception corrects it and sends it again.
const returnToReception = asyncHandler(async (req, res) => {
  const entry = await loadEntry(req);
  if (entry.registration?.status !== 'sent') throw fail('This registration is not with a Post Counselor right now');
  if (entry.postCounseling?.outcome?.kind) throw fail('This patient has already been converted or marked package not purchased', 409);
  const mine = String(entry.registration.postCounselor || '') === String(req.user._id);
  if (!mine && !isAdminLike(req.user)) throw fail('Only the assigned Post Counselor can send this back', 403);
  const reason = String(req.body.reason || '').trim().slice(0, 1000);
  if (reason.length < 3) throw fail('Write what reception has to correct');
  const now = new Date();
  const updated = await Management.findOneAndUpdate({ _id: entry._id, 'registration.status': 'sent' }, {
    $set: { 'registration.status': 'draft', 'registration.returned': { reason, at: now, by: req.user._id, byName: req.user.name }, updatedByName: req.user.name, lastEditedAt: now },
    $push: { 'registration.returns': { reason, at: now, byName: req.user.name } },
  }, { new: true });
  if (!updated) throw fail('This registration could not be sent back', 409);
  await audit(req, entry, 'Registration returned to reception', `Patient ${valueOf(entry, RECEPTION_IDS.patientId)}: ${reason}`);
  emitChanged(req, entry);
  req.app.get('io')?.to(POST_COUNSELING_ALL_ROOM).to(postCounselingUserRoom(entry.registration.postCounselor)).emit('post-counseling:changed', { id: String(entry._id) });
  res.json({ success: true, registration: registrationView(updated) });
});

// @route PUT /api/post-counseling/patients/:id/counselor   { postCounselorId, reason }   (Admin / Manager)
// A registration sent to the wrong Post Counselor moves to another one. Whatever was filled so far stays with the
// patient; the lists of both counselors update at once.
const reassignPostCounselor = asyncHandler(async (req, res) => {
  const entry = await loadEntry(req);
  if (entry.registration?.status !== 'sent') throw fail('This registration has not been sent to a Post Counselor yet');
  if (entry.postCounseling?.outcome?.kind) throw fail('This patient has already been converted or marked package not purchased', 409);
  if (!validId(req.body.postCounselorId)) throw fail('Choose a Post Counselor');
  const counselor = await User.findOne({ _id: req.body.postCounselorId, role: ROLES.POST_COUNSELOR, isActive: true }).select('name').lean();
  if (!counselor) throw fail('Choose an active Post Counselor');
  const previous = { id: entry.registration.postCounselor, name: entry.registration.postCounselorName || '' };
  if (String(previous.id) === String(counselor._id)) throw fail(`${counselor.name} already has this patient`);
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  const now = new Date();
  const updated = await Management.findOneAndUpdate({ _id: entry._id, 'registration.status': 'sent' }, {
    $set: { 'registration.postCounselor': counselor._id, 'registration.postCounselorName': counselor.name, updatedByName: req.user.name, lastEditedAt: now },
    $push: { 'registration.reassignments': { from: previous.id, fromName: previous.name, to: counselor._id, toName: counselor.name, reason, at: now, byName: req.user.name } },
  }, { new: true });
  if (!updated) throw fail('This registration could not be moved', 409);
  await audit(req, entry, 'Post Counselor changed', `Patient ${valueOf(entry, RECEPTION_IDS.patientId)}: ${previous.name || '-'} -> ${counselor.name}${reason ? ` (${reason})` : ''}`);
  emitChanged(req, entry);
  const io = req.app.get('io');
  if (io) {
    let rooms = io.to(POST_COUNSELING_ALL_ROOM).to(postCounselingUserRoom(counselor._id));
    if (previous.id) rooms = rooms.to(postCounselingUserRoom(previous.id));
    rooms.emit('post-counseling:changed', { id: String(entry._id) });
  }
  res.json({ success: true, registration: registrationView(updated) });
});

// @route GET /api/sales-sheet/post-counselors
const listPostCounselors = asyncHandler(async (req, res) => {
  const users = await User.find({ role: ROLES.POST_COUNSELOR, isActive: true }).select('name').sort({ name: 1 }).lean();
  res.json({ success: true, counselors: users.map((user) => ({ id: String(user._id), name: user.name })) });
});

// @route GET /api/post-counseling/patients
// A Post Counselor sees only the patients sent to them; Admin / Doctor / Manager see everyone's.
// Patients sent to post counselling, as cards. `notGiven`: list the Treatment Not Given page instead.
// The latest move between Post Counselors, for the card.
const lastMove = (entry) => {
  const moves = entry.registration?.reassignments || [];
  const m = moves[moves.length - 1];
  return m ? { fromName: m.fromName, toName: m.toName, reason: m.reason, at: m.at, byName: m.byName } : null;
};
const listSentPatients = (notGiven) => asyncHandler(async (req, res) => {
  // Once the outcome is decided (converted / package not purchased) the patient leaves this list; they stay in Post Counseling Done.
  // Patients moved to Treatment Not Given leave it too, until they are restored.
  const filter = { 'registration.status': 'sent', 'postCounseling.outcome.kind': { $in: [null, ''] } };
  filter['postCounseling.notGiven.active'] = notGiven ? true : { $ne: true };
  if (req.user.role === ROLES.POST_COUNSELOR) filter['registration.postCounselor'] = req.user._id;
  else if (validId(req.query.counselor)) filter['registration.postCounselor'] = req.query.counselor;
  const rows = await Management.find(filter).sort({ 'registration.sentAt': -1 }).limit(500);
  const query = String(req.query.q || '').trim().toLowerCase();
  const patients = rows.map((entry) => {
    const view = registrationView(entry);
    const f = view.fields;
    return {
      id: view.id, patientId: view.patientId, appointmentCode: view.appointmentCode,
      patientName: f.patientName, age: f.age, category: f.category,
      fields: f, meta: view.meta,
      primaryConcern: valueOf(entry, RECEPTION_IDS.primaryConcern),
      consultationDate: view.consultationDate, sentAt: view.sentAt, sentByName: entry.registration?.sentByName || '',
      postCounselor: view.postCounselor, postCounselorName: view.postCounselorName,
      reassignedFrom: lastMove(entry),
      // Returned to reception earlier and sent again: the Post Counselor sees what was corrected.
      lastReturn: (entry.registration?.returns || []).slice(-1).map((r) => ({ reason: r.reason, at: r.at, byName: r.byName, resentAt: r.resentAt || null, resentByName: r.resentByName || '' }))[0] || null,
      recordSavedAt: entry.postCounseling?.savedAt || null,
      notGiven: notGivenView(entry),
      existingPatientCode: view.existingPatientCode,
    };
  }).filter((patient) => !query || [patient.patientName, patient.patientId, patient.fields.fatherNumber, patient.fields.motherNumber, patient.fields.whatsappNumber, patient.fields.fatherName, patient.fields.motherName].some((value) => String(value || '').toLowerCase().includes(query)));
  res.json({ success: true, patients, fieldDefs: REGISTRATION_FIELDS, groups: FIELD_GROUPS });
});
const listPostCounselingPatients = listSentPatients(false);
const listNotGivenPatients = listSentPatients(true);

module.exports = { markArrival, getRegistration, lookupExistingPatient, withExistingPatient, saveRegistration, sendRegistration, reassignPostCounselor, returnToReception, listPostCounselors, listPostCounselingPatients, listNotGivenPatients, registrationView };
