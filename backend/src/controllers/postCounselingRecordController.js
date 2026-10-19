const mongoose = require('mongoose');
const Management = require('../models/AppointmentManagementEntry');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { emptyRecord, cleanRecord, definitions, COMPONENTS } = require('../utils/postCounselingRecord');
const { REGISTRATION_FIELDS, FIELD_GROUPS } = require('../utils/receptionFlow');
const { registrationView } = require('./receptionFlowController');
const { postCounselingUserRoom, POST_COUNSELING_ALL_ROOM } = require('../realtime/salesSheetSocket');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

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

const view = (entry, canEdit) => {
  const saved = entry.postCounseling?.record;
  return {
    record: saved ? { ...emptyRecord(), ...saved } : emptyRecord(),
    saved: Boolean(entry.postCounseling?.savedAt),
    savedAt: entry.postCounseling?.savedAt || null,
    savedByName: entry.postCounseling?.savedByName || '',
    canEdit,
    definitions: definitions(),
    registration: (() => { const r = registrationView(entry); return { fields: r.fields, fieldDefs: REGISTRATION_FIELDS, groups: FIELD_GROUPS, meta: r.meta, consultationDate: r.consultationDate, postCounselorName: r.postCounselorName, patientId: r.patientId }; })(),
    patient: {
      patientId: entry.values?.get?.('6abb6329297d3a5387593670') || '',
      patientName: entry.registration?.fields?.get?.('patientName') || '',
    },
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
  const record = cleanRecord(req.body.record);
  const now = new Date();
  const updated = await Management.findOneAndUpdate({ _id: entry._id }, {
    $set: { 'postCounseling.record': record, 'postCounseling.savedAt': now, 'postCounseling.savedByName': req.user.name, 'postCounseling.savedBy': req.user._id },
  }, { new: true });
  try {
    await SalesSheetAudit.create({ sheet: 'management', rowId: entry._id, appointmentCode: entry.appointmentCode || '', action: 'Post counselling record saved', details: `Reference value Rs ${record.totals.referenceValue}`, changedBy: req.user._id, changedByName: req.user.name });
  } catch (error) {
    console.error('Post counselling audit could not be saved:', error.message);
  }
  req.app.get('io')?.to(postCounselingUserRoom(entry.registration.postCounselor)).to(POST_COUNSELING_ALL_ROOM).emit('post-counseling:changed', { id: String(entry._id) });
  res.json({ success: true, ...view(updated, canEdit) });
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
    const record = { ...emptyRecord(), ...(entry.postCounseling?.record || {}) };
    return {
      id: r.id, patientId: r.patientId, patientName: r.fields.patientName, age: r.fields.age, category: r.fields.category,
      fatherNumber: r.fields.fatherNumber, motherNumber: r.fields.motherNumber,
      consultationDate: r.consultationDate, postCounselor: r.postCounselor, postCounselorName: r.postCounselorName,
      savedAt: entry.postCounseling?.savedAt || null, savedByName: entry.postCounseling?.savedByName || '',
      decision: record.b?.decision || '', currentStage: record.b?.currentStage || '', paymentPlan: record.e?.paymentPlan || '',
      referenceValue: record.totals?.referenceValue || 0, approvedProgramFee: record.totals?.approvedProgramFee || 0, concession: Number(record.e?.concession || 0),
      components: (record.components?.selected || []).map((key) => names.get(key)).filter(Boolean),
    };
  }).filter((patient) => !query || [patient.patientName, patient.patientId, patient.fatherNumber, patient.motherNumber].some((value) => String(value || '').toLowerCase().includes(query)));
  res.json({ success: true, patients });
});

module.exports = { getRecord, saveRecord, listDone };
