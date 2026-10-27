const mongoose = require('mongoose');
const Management = require('../models/AppointmentManagementEntry');
const PatientIdCounter = require('../models/PatientIdCounter');
const Patient = require('../models/Patient');
const User = require('../models/User');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
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
    fields: { ...defaultsFromSales(salesValues), ...saved },
    fieldDefs: REGISTRATION_FIELDS,
    groups: FIELD_GROUPS,
    meta: metaOf(entry),
    status: registration.status || 'draft',
    postCounselor: registration.postCounselor ? String(registration.postCounselor) : '',
    postCounselorName: registration.postCounselorName || '',
    sentAt: registration.sentAt || null,
    consultationDate: registration.consultationDate || '',
  };
};

// @route POST /api/sales-sheet/management/:id/arrival
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
  await audit(req, entry, status === 'Online' ? 'Online consultation marked' : 'Arrival marked', `${status}${time ? ` at ${time}` : ''}${generated ? `, Patient ID ${patientId}` : ''}${existing ? `, existing patient ${patientId} (no new ID)` : ''}`);
  emitChanged(req, entry);
  res.json({ success: true, arrivalStatus: status, arrivalTime: time, patientId, generated, existing });
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
  const updated = await Management.findOneAndUpdate({ _id: entry._id, 'registration.status': { $ne: 'sent' } }, {
    $set: {
      registration: {
        fields, status: 'sent', savedAt: now, savedByName: req.user.name, postCounselor: counselor._id, postCounselorName: counselor.name,
        sentAt: now, sentByName: req.user.name, consultationDate: istDate(now),
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

// @route GET /api/sales-sheet/post-counselors
const listPostCounselors = asyncHandler(async (req, res) => {
  const users = await User.find({ role: ROLES.POST_COUNSELOR, isActive: true }).select('name').sort({ name: 1 }).lean();
  res.json({ success: true, counselors: users.map((user) => ({ id: String(user._id), name: user.name })) });
});

// @route GET /api/post-counseling/patients
// A Post Counselor sees only the patients sent to them; Admin / Doctor / Manager see everyone's.
// Patients sent to post counselling, as cards. `notGiven`: list the Treatment Not Given page instead.
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
      recordSavedAt: entry.postCounseling?.savedAt || null,
      notGiven: notGivenView(entry),
      existingPatientCode: view.existingPatientCode,
    };
  }).filter((patient) => !query || [patient.patientName, patient.patientId, patient.fields.fatherNumber, patient.fields.motherNumber, patient.fields.whatsappNumber, patient.fields.fatherName, patient.fields.motherName].some((value) => String(value || '').toLowerCase().includes(query)));
  res.json({ success: true, patients, fieldDefs: REGISTRATION_FIELDS, groups: FIELD_GROUPS });
});
const listPostCounselingPatients = listSentPatients(false);
const listNotGivenPatients = listSentPatients(true);

module.exports = { markArrival, getRegistration, lookupExistingPatient, withExistingPatient, saveRegistration, sendRegistration, listPostCounselors, listPostCounselingPatients, listNotGivenPatients, registrationView };
