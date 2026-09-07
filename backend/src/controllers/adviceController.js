const AdviceRequest = require('../models/AdviceRequest');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const canAccessPatient = (user, patient) => {
  if (![ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user.role)) return true;
  const assignment = user.role === ROLES.ASSISTANT_DOCTOR ? patient.assignedDoctor : patient.assignedPsychologist;
  if (!assignment) return false;
  const assignedId = assignment._id || assignment;
  return String(assignedId) === String(user._id);
};

const canRequestAdvice = (user) => [ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user.role);
const canAnswerAdvice = (user) => [ROLES.ADMIN, ROLES.DOCTOR].includes(user.role);

const formatAdvice = (entry) => ({
  id: entry._id,
  patientId: entry.patient?._id || entry.patient,
  patientName: entry.patient?.patientName || '',
  patientCode: entry.patient?.patientCode || '',
  phoneNumber: entry.patient?.number || '',
  stage: entry.stage,
  query: entry.query,
  status: entry.status,
  isUrgent: Boolean(entry.isUrgent),
  requestedByName: entry.requestedByName,
  requestedByRole: entry.requestedByRole,
  requestedBy: entry.requestedBy,
  doctorReadAt: entry.doctorReadAt,
  advice: entry.advice || '',
  adviceGivenAt: entry.adviceGivenAt || null,
  adviceGivenBy: entry.adviceGivenBy || null,
  adviceGivenByName: entry.adviceGivenByName || '',
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const addPatientActivity = (patient, user, action, details = '') => {
  patient.activityLog.push({
    action,
    details,
    actorName: user?.name || 'System',
    actorRole: user?.role || '',
  });
};

const createAdviceRequest = asyncHandler(async (req, res) => {
  if (!canRequestAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to request advice' });
  }

  const { patientId } = req.params;
  const { query, stage, isUrgent } = req.body;
  const stageNumber = Number(stage);
  if (!String(query || '').trim()) {
    return res.status(400).json({ success: false, message: 'Query is required' });
  }
  if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 6) {
    return res.status(400).json({ success: false, message: 'Stage is required for doctor advice' });
  }

  const patient = await Patient.findById(patientId);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }
  if (!(patient.stages || []).some((item) => Number(item.number) === stageNumber)) {
    return res.status(400).json({ success: false, message: 'Selected stage was not found for this patient' });
  }

  const adviceRequest = await AdviceRequest.create({
    patient: patient._id,
    stage: stageNumber,
    query: String(query).trim(),
    isUrgent: Boolean(isUrgent),
    requestedBy: req.user._id,
    requestedByName: req.user.name,
    requestedByRole: req.user.role,
  });

  addPatientActivity(
    patient,
    req.user,
    Boolean(isUrgent) ? `Urgent advice requested from doctor for Stage ${stageNumber}` : `Advice requested from doctor for Stage ${stageNumber}`,
    String(query).trim()
  );
  await patient.save();
  await adviceRequest.populate('patient', 'patientName patientCode number');

  res.status(201).json({ success: true, advice: formatAdvice(adviceRequest) });
});

const listPatientAdvice = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  const query = { patient: patient._id };
  const stageNumber = Number(req.query.stage);
  if (Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= 6) {
    query.stage = stageNumber;
  }
  if ([ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(req.user.role)) {
    query.requestedBy = req.user._id;
  }

  const rows = await AdviceRequest.find(query)
    .populate('patient', 'patientName patientCode number')
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json({ success: true, rows: rows.map(formatAdvice) });
});

const listAdviceRequests = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Doctor or Admin can view advice requests' });
  }

  const rows = await AdviceRequest.find({ status: 'requested' })
    .populate('patient', 'patientName patientCode number')
    .sort({ isUrgent: -1, createdAt: -1 })
    .limit(200);

  await AdviceRequest.updateMany(
    { _id: { $in: rows.filter((row) => !row.doctorReadAt).map((row) => row._id) } },
    { $set: { doctorReadAt: new Date() } }
  );

  res.status(200).json({ success: true, rows: rows.map(formatAdvice) });
});

const listAdviceGiven = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Doctor or Admin can view advice records' });
  }

  const rows = await AdviceRequest.find({ status: 'advice_given' })
    .populate('patient', 'patientName patientCode number')
    .sort({ adviceGivenAt: -1, updatedAt: -1 })
    .limit(200);

  res.status(200).json({ success: true, rows: rows.map(formatAdvice) });
});

const getUnreadAdviceCount = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) {
    return res.status(200).json({ success: true, count: 0 });
  }

  const count = await AdviceRequest.countDocuments({ status: 'requested', doctorReadAt: null });
  const urgentCount = await AdviceRequest.countDocuments({ status: 'requested', isUrgent: true });
  const latestUrgent = await AdviceRequest.findOne({ status: 'requested', isUrgent: true })
    .populate('patient', 'patientName patientCode number')
    .sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    count,
    urgentCount,
    latestUrgent: latestUrgent ? formatAdvice(latestUrgent) : null,
  });
});

const respondToAdviceRequest = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Doctor or Admin can give advice' });
  }

  const { advice } = req.body;
  if (!String(advice || '').trim()) {
    return res.status(400).json({ success: false, message: 'Advice is required' });
  }

  const entry = await AdviceRequest.findById(req.params.id);
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Advice request not found' });
  }

  entry.status = 'advice_given';
  entry.advice = String(advice).trim();
  entry.adviceGivenAt = new Date();
  entry.adviceGivenBy = req.user._id;
  entry.adviceGivenByName = req.user.name;
  entry.doctorReadAt = entry.doctorReadAt || new Date();
  await entry.save();

  const patient = await Patient.findById(entry.patient);
  if (patient) {
    addPatientActivity(patient, req.user, `Doctor advice given for Stage ${entry.stage || '-'}`, entry.advice);
    await patient.save();
  }

  await entry.populate('patient', 'patientName patientCode number');
  res.status(200).json({ success: true, advice: formatAdvice(entry) });
});

const updateAdviceRequest = asyncHandler(async (req, res) => {
  if (!canRequestAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to edit advice requests' });
  }

  const { query, isUrgent } = req.body;
  if (!String(query || '').trim()) {
    return res.status(400).json({ success: false, message: 'Query is required' });
  }

  const entry = await AdviceRequest.findById(req.params.id);
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Advice request not found' });
  }
  if (entry.status !== 'requested') {
    return res.status(400).json({ success: false, message: 'Request cannot be edited after doctor advice is given' });
  }
  if (req.user.role !== ROLES.ADMIN && String(entry.requestedBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'You can only edit your own advice request' });
  }

  const patient = await Patient.findById(entry.patient);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  entry.query = String(query).trim();
  if (isUrgent !== undefined) entry.isUrgent = Boolean(isUrgent);
  await entry.save();

  addPatientActivity(
    patient,
    req.user,
    entry.isUrgent ? `Urgent advice request edited for Stage ${entry.stage || '-'}` : `Advice request edited for Stage ${entry.stage || '-'}`,
    entry.query
  );
  await patient.save();

  await entry.populate('patient', 'patientName patientCode number');
  res.status(200).json({ success: true, advice: formatAdvice(entry) });
});

const updateAdviceAnswer = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Doctor or Admin can edit advice' });
  }

  const { advice } = req.body;
  if (!String(advice || '').trim()) {
    return res.status(400).json({ success: false, message: 'Advice is required' });
  }

  const entry = await AdviceRequest.findById(req.params.id);
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Advice request not found' });
  }
  if (entry.status !== 'advice_given') {
    return res.status(400).json({ success: false, message: 'Advice has not been given yet' });
  }
  if (req.user.role !== ROLES.ADMIN && String(entry.adviceGivenBy || '') !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'You can only edit advice given by you' });
  }

  entry.advice = String(advice).trim();
  await entry.save();

  const patient = await Patient.findById(entry.patient);
  if (patient) {
    addPatientActivity(patient, req.user, `Doctor advice edited for Stage ${entry.stage || '-'}`, entry.advice);
    await patient.save();
  }

  await entry.populate('patient', 'patientName patientCode number');
  res.status(200).json({ success: true, advice: formatAdvice(entry) });
});

module.exports = {
  createAdviceRequest,
  listPatientAdvice,
  listAdviceRequests,
  listAdviceGiven,
  getUnreadAdviceCount,
  respondToAdviceRequest,
  updateAdviceRequest,
  updateAdviceAnswer,
};
