const mongoose = require('mongoose');
const Management = require('../models/AppointmentManagementEntry');
const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { emptyRecord, cleanRecord, normalizeRecord, definitions, COMPONENTS } = require('../utils/postCounselingRecord');
const purchase = require('../utils/purchaseOrderRecord');
const { REGISTRATION_FIELDS, FIELD_GROUPS, CATEGORY_LABEL, RECEPTION_IDS, istDate } = require('../utils/receptionFlow');
const { PROFILE_KEYS } = require('../utils/patientProfile');
const { registrationView } = require('./receptionFlowController');
const { patientInputFromRegistration, assertPurchaseComplete, withBankName, createConvertedPatient, linkConsultationReceipts } = require('../utils/convertPatient');
const { postCounselingUserRoom, POST_COUNSELING_ALL_ROOM } = require('../realtime/salesSheetSocket');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const { NOT_GIVEN_KINDS, notGivenView } = require('../utils/postCounselingNotGiven');
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);

// The record belongs to a patient reception has sent to a Post Counselor. Only that counselor (or Admin) may fill it;
// Doctor and Manager can read it.
const loadAccessible = async (req) => {
  const id = String(req.params.id || '');
  if (!mongoose.Types.ObjectId.isValid(id) || id.length !== 24) throw fail('Invalid patient');
  const entry = await Management.findById(id);
  if (!entry || entry.registration?.status !== 'sent') throw fail('Patient not found', 404);
  const isOwner = req.user.role === ROLES.POST_COUNSELOR && String(entry.registration.postCounselor) === String(req.user._id);
  const canEdit = req.user.role === ROLES.ADMIN || isOwner;
  if (!canEdit && ![ROLES.DOCTOR, ROLES.MANAGER].includes(req.user.role)) throw fail('This patient was sent to another Post Counselor', 403);
  return { entry, canEdit };
};

const audit = async (req, entry, action, details = '') => {
  try {
    await SalesSheetAudit.create({ sheet: 'management', rowId: entry._id, appointmentCode: entry.appointmentCode || '', action, details, changedBy: req.user._id, changedByName: req.user.name });
  } catch (error) {
    console.error('Post counselling audit could not be saved:', error.message);
  }
};
const emitChanged = (req, entry) => req.app.get('io')?.to(postCounselingUserRoom(entry.registration.postCounselor)).to(POST_COUNSELING_ALL_ROOM).emit('post-counseling:changed', { id: String(entry._id) });

const outcomeView = (entry) => {
  const outcome = entry.postCounseling?.outcome;
  if (!outcome?.kind) return null;
  return { kind: outcome.kind, at: outcome.at || null, byName: outcome.byName || '', patientId: outcome.patient ? String(outcome.patient) : null, packageNotBoughtId: outcome.packageNotBought ? String(outcome.packageNotBought) : null };
};

const purchaseView = (entry, registration) => {
  const saved = entry.postCounseling?.purchase;
  const record = entry.postCounseling?.record;
  const fee = record?.totals?.approvedProgramFee || 0;
  const decided = Boolean(entry.postCounseling?.outcome?.kind);
  const values = saved?.values
    ? (decided ? saved.values : { ...saved.values, ...purchase.planFromRecord(record) })
    : purchase.defaults({ record, registration: registration.fields, counselorName: registration.postCounselorName, today: istDate() });
  return { values, totals: purchase.totals(values, fee), saved: Boolean(saved?.savedAt), savedAt: saved?.savedAt || null, savedByName: saved?.savedByName || '', definitions: purchase.definitions() };
};

const view = (entry, canEdit) => {
  const saved = entry.postCounseling?.record;
  const registration = registrationView(entry);
  return {
    record: saved ? normalizeRecord({ ...emptyRecord(), ...saved }) : emptyRecord(),
    saved: Boolean(entry.postCounseling?.savedAt),
    savedAt: entry.postCounseling?.savedAt || null,
    savedByName: entry.postCounseling?.savedByName || '',
    canEdit,
    definitions: definitions(),
    purchase: purchaseView(entry, registration),
    outcome: outcomeView(entry),
    notGiven: notGivenView(entry),
    registration: { fields: registration.fields, fieldDefs: REGISTRATION_FIELDS, groups: FIELD_GROUPS, meta: registration.meta, consultationDate: registration.consultationDate, postCounselorName: registration.postCounselorName, patientId: registration.patientId },
    patient: { patientId: registration.patientId, patientName: registration.fields.patientName },
  };
};

// @route GET /api/post-counseling/patients/:id/record
const getRecord = asyncHandler(async (req, res) => {
  const { entry, canEdit } = await loadAccessible(req);
  res.json({ success: true, ...view(entry, canEdit) });
});

// @route PUT /api/post-counseling/patients/:id/record
const saveRecord = asyncHandler(async (req, res) => {
  const { entry, canEdit } = await loadAccessible(req);
  if (!canEdit) throw fail('Only the assigned Post Counselor can fill this record', 403);
  if (entry.postCounseling?.outcome?.kind) throw fail('This patient has already been converted or marked package not purchased', 409);
  const record = cleanRecord(req.body.record);
  const now = new Date();
  const updated = await Management.findOneAndUpdate({ _id: entry._id }, {
    $set: { 'postCounseling.record': record, 'postCounseling.savedAt': now, 'postCounseling.savedByName': req.user.name, 'postCounseling.savedBy': req.user._id },
  }, { new: true });
  await audit(req, entry, 'Post counselling record saved', `Reference value Rs ${record.totals.referenceValue}`);
  emitChanged(req, entry);
  res.json({ success: true, ...view(updated, canEdit) });
});

// @route POST /api/post-counseling/upload   (payment screenshots for the purchase order step)
const uploadScreenshots = asyncHandler(async (req, res) => {
  const files = (req.files || []).map((file) => ({ url: `/uploads/payments/${file.filename}`, fileName: file.originalname }));
  if (!files.length) throw fail('Choose a screenshot first');
  res.status(201).json({ success: true, files });
});

// @route PUT /api/post-counseling/patients/:id/purchase
const savePurchase = asyncHandler(async (req, res) => {
  const { entry, canEdit } = await loadAccessible(req);
  if (!canEdit) throw fail('Only the assigned Post Counselor can fill this', 403);
  if (!entry.postCounseling?.savedAt) throw fail('Save the post-counselling record first');
  if (entry.postCounseling?.outcome?.kind) throw fail('This patient has already been converted or marked package not purchased', 409);
  const fromRecord = purchase.planFromRecord(entry.postCounseling.record);
  const cleaned = purchase.cleanPurchase({ ...(req.body.purchase || {}), ...fromRecord }, entry.postCounseling.record?.totals?.approvedProgramFee);
  cleaned.values = await withBankName(cleaned.values);
  const now = new Date();
  const updated = await Management.findOneAndUpdate({ _id: entry._id }, {
    $set: { 'postCounseling.purchase': { values: cleaned.values, totals: cleaned.totals, savedAt: now, savedByName: req.user.name } },
  }, { new: true });
  await audit(req, entry, 'Purchase order details saved', `Approved fee Rs ${cleaned.totals.approvedProgramFee}, received Rs ${cleaned.totals.partPayment}`);
  emitChanged(req, entry);
  res.json({ success: true, ...view(updated, canEdit) });
});

// Claims the decision so pressing a button twice (or two people at once) can only ever do it once.
const claimOutcome = async (entry, kind, user) => {
  if (entry.postCounseling?.notGiven?.active) throw fail('This patient is on the Treatment Not Given page. Restore them to Post Counseling first.', 409);
  const claimed = await Management.findOneAndUpdate(
    { _id: entry._id, 'postCounseling.outcome.kind': { $in: [null, ''] }, 'postCounseling.notGiven.active': { $ne: true } },
    { $set: { 'postCounseling.outcome.kind': kind, 'postCounseling.outcome.at': new Date(), 'postCounseling.outcome.byName': user.name } },
    { new: true },
  );
  if (!claimed) throw fail('This patient has already been converted or marked package not purchased', 409);
  return claimed;
};
const releaseOutcome = (entry) => Management.updateOne({ _id: entry._id }, { $set: { 'postCounseling.outcome.kind': null, 'postCounseling.outcome.byName': '', 'postCounseling.outcome.at': null } });

const requireReady = (entry, needPurchase) => {
  if (!entry.postCounseling?.savedAt) throw fail('Save the post-counselling record first');
  if (needPurchase && !entry.postCounseling?.purchase?.savedAt) throw fail('Save the purchase order details first');
};

// The package that was offered, kept with the record so it is on the Package Not Bought page too.
const packageSummary = (entry) => {
  const record = normalizeRecord(entry.postCounseling?.record || emptyRecord());
  const names = new Map(COMPONENTS.map((component) => [component.key, component.label]));
  const values = entry.postCounseling?.purchase?.values || {};
  return {
    referenceValue: record.totals?.referenceValue || 0, concession: Number(record.e?.concession || 0), approvedProgramFee: record.totals?.approvedProgramFee || 0,
    paymentPlan: values.plan || record.e?.paymentPlan || '', decision: record.b?.decision || '',
    components: (record.components?.selected || []).map((key) => ({ name: names.get(key), price: key === 'ayurvedicFormulations' ? Number(record.components.ayurvedicPrice || 0) : (COMPONENTS.find((c) => c.key === key)?.price || 0) })).filter((item) => item.name),
    amountReceivedNow: Number(values.amountReceivedNow || 0), mode: values.mode || '', outstandingBalance: entry.postCounseling?.purchase?.totals?.outstandingBalance ?? 0,
    poNo: values.poNo || '', consultationDate: entry.registration?.consultationDate || '',
  };
};

// @route POST /api/post-counseling/patients/:id/outcome/convert
// Creates the patient (pending accounts approval) with the registration details, and puts the package, purchase order
// and the payment received now into Phase 1. The PO paper has to be filled in first; a PO number starts In Transit.
const convertToPatient = asyncHandler(async (req, res) => {
  const { entry, canEdit } = await loadAccessible(req);
  if (!canEdit) throw fail('Only the assigned Post Counselor can do this', 403);
  requireReady(entry, true);
  const fee = Number(entry.postCounseling.record?.totals?.approvedProgramFee || 0);
  if (!(fee > 0)) throw fail('Select the treatment components first: the approved program fee is Rs 0');
  const values = entry.postCounseling.purchase.values || {};
  assertPurchaseComplete(values);
  const registration = registrationView(entry);
  const input = patientInputFromRegistration(registration, req.body);

  await claimOutcome(entry, 'converted', req.user);
  let created;
  try {
    created = await createConvertedPatient({
      input, fee, values, totals: entry.postCounseling.purchase.totals || {}, source: 'post_counseling', user: req.user,
      activityDetails: `Converted from Post Counseling (${entry.appointmentCode || 'appointment'}) by ${req.user.name} — pending accounts approval`,
    });
  } catch (error) {
    await releaseOutcome(entry);
    throw error;
  }
  await Management.updateOne({ _id: entry._id }, { $set: { 'postCounseling.outcome.patient': created.patient._id, 'postCounseling.purchase.values.poNo': created.poNumber } });
  await linkConsultationReceipts(entry, created.patient);
  await audit(req, entry, 'Converted to patient', `Patient ${registration.patientId} — purchase order ${created.poNumber} sent to In Transit`);
  emitChanged(req, entry);
  res.json({ success: true, patientId: String(created.patient._id), inTransit: created.inTransit, poNumber: created.poNumber });
});

// @route POST /api/post-counseling/patients/:id/outcome/not-purchased
// Moves the patient to Package Not Bought with the details and the package that was offered.
const markNotPurchased = asyncHandler(async (req, res) => {
  const { entry, canEdit } = await loadAccessible(req);
  if (!canEdit) throw fail('Only the assigned Post Counselor can do this', 403);
  requireReady(entry, false);
  const body = req.body || {};
  const reason = text(body.reason, 1000);
  if (!reason) throw fail('Enter why the package was not purchased');
  const followUpText = text(body.followUpDate, 10);
  if (followUpText && !/^\d{4}-\d{2}-\d{2}$/.test(followUpText)) throw fail('Enter a valid follow-up date');
  const followUp = followUpText ? new Date(`${followUpText}T00:00:00.000+05:30`) : null;
  const registration = registrationView(entry);
  const f = registration.fields;

  await claimOutcome(entry, 'not_purchased', req.user);
  let row = null;
  try {
    row = await PackageNotBoughtPatient.create({
      patientName: f.patientName, parentName: f.fatherName || f.motherName || f.primaryCaregiver || '', fatherNumber: f.fatherNumber || f.whatsappNumber || '', motherNumber: f.motherNumber || '',
      age: f.age, program: CATEGORY_LABEL[f.category] || '', reason, followUpDate: followUp, notes: text(body.notes, 2000),
      patientId: registration.patientId, category: f.category, sourceEntry: entry._id,
      packageDetails: packageSummary(entry), profile: Object.fromEntries(PROFILE_KEYS.map((key) => [key, f[key]])),
      createdBy: req.user._id, createdByName: req.user.name,
      followUps: followUp ? [{ dateTime: followUp, notes: 'Initial next follow-up', createdByName: req.user.name }] : [],
    });
  } catch (error) {
    await releaseOutcome(entry);
    throw error;
  }
  await Management.updateOne({ _id: entry._id }, { $set: { 'postCounseling.outcome.packageNotBought': row._id } });
  await audit(req, entry, 'Marked package not purchased', reason);
  emitChanged(req, entry);
  res.json({ success: true, packageNotBoughtId: String(row._id) });
});

// @route POST /api/post-counseling/patients/:id/not-given   { kind, reason }
// Post counselling did not happen, or treatment is not given: the patient moves to the Treatment Not Given page.
const markNotGiven = asyncHandler(async (req, res) => {
  const { entry, canEdit } = await loadAccessible(req);
  if (!canEdit) throw fail('Only the assigned Post Counselor can do this', 403);
  if (entry.postCounseling?.outcome?.kind) throw fail('This patient already has an outcome (converted or package not purchased)', 409);
  const body = req.body || {};
  const kind = Object.hasOwn(NOT_GIVEN_KINDS, body.kind) ? body.kind : '';
  if (!kind) throw fail('Choose: post counselling not done, or treatment not given');
  const reason = text(body.reason, 1000);
  if (!reason) throw fail('Enter the reason');
  const now = new Date();
  const updated = await Management.findOneAndUpdate(
    { _id: entry._id, 'postCounseling.outcome.kind': { $in: [null, ''] }, 'postCounseling.notGiven.active': { $ne: true } },
    {
      $set: { 'postCounseling.notGiven.active': true, 'postCounseling.notGiven.kind': kind, 'postCounseling.notGiven.reason': reason, 'postCounseling.notGiven.at': now, 'postCounseling.notGiven.byName': req.user.name },
      $push: { 'postCounseling.notGiven.history': { action: 'moved', kind, reason, at: now, byName: req.user.name } },
    },
    { new: true },
  );
  if (!updated) throw fail('This patient is already on the Treatment Not Given page or has an outcome', 409);
  await audit(req, entry, `Moved to Treatment Not Given: ${NOT_GIVEN_KINDS[kind]}`, reason);
  emitChanged(req, entry);
  res.json({ success: true, notGiven: notGivenView(updated) });
});

// @route POST /api/post-counseling/patients/:id/restore   { note }
// Brings a Treatment Not Given patient back to the Post Counseling Patients list.
const restoreNotGiven = asyncHandler(async (req, res) => {
  const { entry, canEdit } = await loadAccessible(req);
  if (!canEdit) throw fail('Only the assigned Post Counselor can do this', 403);
  const note = text(req.body?.note, 1000);
  const now = new Date();
  const updated = await Management.findOneAndUpdate(
    { _id: entry._id, 'postCounseling.notGiven.active': true },
    {
      $set: { 'postCounseling.notGiven.active': false, 'postCounseling.notGiven.restoredAt': now, 'postCounseling.notGiven.restoredByName': req.user.name },
      $push: { 'postCounseling.notGiven.history': { action: 'restored', kind: entry.postCounseling?.notGiven?.kind || '', reason: note, at: now, byName: req.user.name } },
    },
    { new: true },
  );
  if (!updated) throw fail('This patient is not on the Treatment Not Given page', 409);
  await audit(req, entry, 'Restored to Post Counseling', note);
  emitChanged(req, entry);
  res.json({ success: true, notGiven: notGivenView(updated) });
});

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

// @route GET /api/post-counseling/done?from=&to=&q=&counselor=
// Patients whose post-counselling record has been saved, by consultation date (the day reception sent them).
const listDone = asyncHandler(async (req, res) => {
  const filter = { 'registration.status': 'sent', 'postCounseling.savedAt': { $ne: null } };
  const range = {};
  if (validDate(req.query.from)) range.$gte = req.query.from;
  if (validDate(req.query.to)) range.$lte = req.query.to;
  if (Object.keys(range).length) filter['registration.consultationDate'] = range;
  if (req.user.role === ROLES.POST_COUNSELOR) filter['registration.postCounselor'] = req.user._id;
  else if (req.query.counselor && mongoose.Types.ObjectId.isValid(String(req.query.counselor))) filter['registration.postCounselor'] = req.query.counselor;
  const rows = await Management.find(filter).sort({ 'registration.consultationDate': -1, 'postCounseling.savedAt': -1 }).limit(1000);
  const query = String(req.query.q || '').trim().toLowerCase();
  const names = new Map(COMPONENTS.map((component) => [component.key, component.label]));
  const patients = rows.map((entry) => {
    const r = registrationView(entry);
    const record = normalizeRecord({ ...emptyRecord(), ...(entry.postCounseling?.record || {}) });
    const bought = entry.postCounseling?.purchase?.values || {};
    return {
      id: r.id, patientId: r.patientId, patientName: r.fields.patientName, age: r.fields.age, category: r.fields.category,
      fatherNumber: r.fields.fatherNumber, motherNumber: r.fields.motherNumber,
      consultationDate: r.consultationDate, postCounselor: r.postCounselor, postCounselorName: r.postCounselorName,
      savedAt: entry.postCounseling?.savedAt || null, savedByName: entry.postCounseling?.savedByName || '',
      decision: record.b?.decision || '', currentStage: record.b?.currentStage || '', paymentPlan: bought.plan || record.e?.paymentPlan || '',
      referenceValue: record.totals?.referenceValue || 0, approvedProgramFee: record.totals?.approvedProgramFee || 0, concession: Number(record.e?.concession || 0),
      amountReceivedNow: Number(bought.amountReceivedNow || 0), poNo: bought.poNo || '', purchaseSaved: Boolean(entry.postCounseling?.purchase?.savedAt),
      outcome: outcomeView(entry),
      components: (record.components?.selected || []).map((key) => names.get(key)).filter(Boolean),
    };
  }).filter((patient) => !query || [patient.patientName, patient.patientId, patient.fatherNumber, patient.motherNumber].some((value) => String(value || '').toLowerCase().includes(query)));
  res.json({ success: true, patients });
});

module.exports = { getRecord, saveRecord, savePurchase, uploadScreenshots, convertToPatient, markNotPurchased, markNotGiven, restoreNotGiven, listDone };
