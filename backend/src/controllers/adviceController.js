const AdviceRequest = require('../models/AdviceRequest');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');

const canAccessPatient = (user, patient) => {
  if (![ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user.role)) return true;
  if ((patient.approvalStatus || 'approved') !== 'approved') return false;
  const assignment = user.role === ROLES.ASSISTANT_DOCTOR ? patient.assignedDoctor : patient.assignedPsychologist;
  if (!assignment) return false;
  const assignedId = assignment._id || assignment;
  return String(assignedId) === String(user._id);
};

const canRequestAdvice = (user) => isAdminLike(user) || [ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user.role);
const canAnswerAdvice = (user) => isAdminLike(user) || user.role === ROLES.DOCTOR;
// The voice advice sent with the reply (multipart "voice"): stored with the advice; "removeVoice" drops the old one.
const fsp = require('fs/promises');
const pathLib = require('path');
const dropFile = (url) => (url && /^\/uploads\/advice-voice\/[\w.-]+$/.test(url) ? fsp.unlink(pathLib.join(__dirname, '../..', url)).catch(() => {}) : null);
const { compressVoice } = require('../utils/audioCompress');
const applyVoice = async (entry, req) => {
  const oldUrl = entry.adviceVoice?.url || '';
  if (req.file) {
    const seconds = Number(req.body.voiceSeconds);
    // Stored compressed (Opus, mono, low bitrate): a fraction of the recorded size.
    const kept = await compressVoice(req.file);
    entry.adviceVoice = { url: `/uploads/advice-voice/${kept.filename}`, fileName: req.file.originalname || 'voice-advice', mimeType: kept.mimetype, durationSec: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null, at: new Date() };
    if (oldUrl) await dropFile(oldUrl);
  } else if (req.body.removeVoice === 'true' || req.body.removeVoice === true) {
    entry.adviceVoice = undefined;
    if (oldUrl) await dropFile(oldUrl);
  }
};
const adviceSummary = (entry) => [entry.advice, entry.adviceVoice?.url ? 'Voice advice recorded' : ''].filter(Boolean).join(' | ');
// A rejected request should not leave its recording behind.
const discardUpload = (req) => (req.file ? fsp.unlink(req.file.path).catch(() => {}) : null);

const ADVICE_PATIENT_SELECT = 'patientName patientCode number stages.number stages.recordFileUrl stages.recordFileName stages.recordFiles';
// The PCC's query list only needs who the patient is.
const QUERY_PATIENT_SELECT = 'patientName patientCode number';
const { FOLLOW_UP_OUTCOMES, SENT_VIA } = AdviceRequest;
const SENT_VIA_LABEL = { whatsapp: 'WhatsApp', call: 'On call', in_person: 'In person', other: 'Other' };
const OUTCOME_LABEL = { satisfied: 'Patient satisfied', not_satisfied: 'Patient not satisfied', not_reachable: 'Not reachable', call_back: 'Asked to call back' };
const DAY_MS = 24 * 60 * 60 * 1000;
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const clean = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const plain = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : x);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const istTime = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dateOf = (v, label) => { const d = new Date(v); if (Number.isNaN(d.getTime())) fail(`Enter a valid ${label}`); return d; };
const voiceView = (v) => (v?.url ? { url: v.url, durationSec: v.durationSec ?? null, at: v.at || null } : null);

// Where the query is: with the doctor -> answer to send -> follow-up -> solved.
const progressOf = (e) => (e.resolvedAt ? 'solved' : e.status === 'requested' ? 'with_doctor' : !e.sentToPatientAt ? 'to_send' : 'follow_up');
// Every step with its time. Queries made before the timeline existed get theirs from the saved fields.
const timelineOf = (e) => {
  if (e.timeline?.length) return e.timeline.map((t) => ({ at: t.at, action: t.action, details: t.details || '', byName: t.byName || '', byRole: t.byRole || '' }));
  const out = [{ at: e.createdAt || new Date(), action: 'Query raised', details: e.query || '', byName: e.requestedByName || '', byRole: e.requestedByRole || '' }];
  if (e.adviceGivenAt) out.push({ at: e.adviceGivenAt, action: 'Doctor answered', details: adviceSummary(e), byName: e.adviceGivenByName || '', byRole: 'doctor' });
  return out;
};
// Writes one step (with its time) on the query.
const track = (entry, user, action, details = '') => {
  if (!entry.timeline?.length) entry.timeline = timelineOf(entry);
  entry.timeline.push({ at: new Date(), action, details: clean(details, 1000), byName: user?.name || 'System', byRole: user?.role || '' });
};
const followUpView = (f) => ({ id: f._id ? String(f._id) : '', at: f.at, outcome: f.outcome, outcomeLabel: OUTCOME_LABEL[f.outcome] || f.outcome, note: f.note || '', nextAt: f.nextAt || null, byName: f.byName || '' });
const io = (req) => req.app?.get?.('io');
// The doctors' lists, the PCC who raised it and the admins / managers refresh at once.
const notify = (req, entry, event = 'advice:changed') => {
  const payload = { id: String(entry._id) };
  const server = io(req);
  if (!server) return;
  server.to('advice:doctors').emit(event, payload);
  if (event !== 'advice:changed') server.to('advice:doctors').emit('advice:changed', payload);
  server.to(`enquiry:user:${entry.requestedBy}`).emit('advice:changed', payload);
  ['enquiry:admins', 'enquiry:managers'].forEach((room) => server.to(room).emit('advice:changed', payload));
};

const getStageRecordAttachments = (entry) => {
  const stages = Array.isArray(entry.patient?.stages) ? entry.patient.stages : [];
  const matchingStage = stages.find((stage) => Number(stage.number) === Number(entry.stage));
  const sourceStages = matchingStage ? [matchingStage] : stages;
  const files = [];

  sourceStages.forEach((stage) => {
    if (Array.isArray(stage.recordFiles)) {
      stage.recordFiles.forEach((file) => {
        if (file?.url) files.push({ url: file.url, fileName: file.fileName || `Phase ${stage.number} record` });
      });
    }
    if (stage.recordFileUrl && !files.some((file) => file.url === stage.recordFileUrl)) {
      files.push({ url: stage.recordFileUrl, fileName: stage.recordFileName || `Phase ${stage.number} record` });
    }
  });

  return files;
};

const formatAdvice = (entry) => ({
  id: entry._id,
  patientId: entry.patient?._id || entry.patient,
  patientName: entry.patient?.patientName || '',
  patientCode: entry.patient?.patientCode || '',
  phoneNumber: entry.patient?.number || '',
  patientRecordFiles: getStageRecordAttachments(entry),
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
  adviceVoice: entry.adviceVoice?.url ? { url: entry.adviceVoice.url, durationSec: entry.adviceVoice.durationSec ?? null, at: entry.adviceVoice.at || null } : null,
  askedAt: entry.askedAt || entry.createdAt,
  progress: progressOf(entry),
  sentToPatientAt: entry.sentToPatientAt || null,
  sentToPatientByName: entry.sentToPatientByName || '',
  sentVia: entry.sentVia || '',
  sentViaLabel: SENT_VIA_LABEL[entry.sentVia] || '',
  sentNote: entry.sentNote || '',
  followUps: (entry.followUps || []).map(followUpView),
  nextFollowUpAt: entry.nextFollowUpAt || null,
  followUpDue: Boolean(entry.nextFollowUpAt && new Date(entry.nextFollowUpAt) <= new Date()),
  resolvedAt: entry.resolvedAt || null,
  resolvedByName: entry.resolvedByName || '',
  resolvedNote: entry.resolvedNote || '',
  alarms: (entry.alarms || []).map((a) => ({ at: a.at, note: a.note || '', byName: a.byName || '' })),
  lastAlarmAt: entry.lastAlarmAt || null,
  // Earlier questions and answers (the PCC asked the doctor again).
  rounds: (entry.rounds || []).map((r) => { const x = plain(r); return { query: x.query, askedAt: x.askedAt, askedByName: x.askedByName, isUrgent: Boolean(x.isUrgent), advice: x.advice || '', adviceVoice: voiceView(x.adviceVoice), adviceGivenAt: x.adviceGivenAt, adviceGivenByName: x.adviceGivenByName || '', sentToPatientAt: x.sentToPatientAt, sentToPatientByName: x.sentToPatientByName || '', sentViaLabel: SENT_VIA_LABEL[x.sentVia] || '', sentNote: x.sentNote || '', followUps: (x.followUps || []).map(followUpView) }; }),
  timeline: timelineOf(entry),
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
    return res.status(400).json({ success: false, message: 'Phase is required for doctor advice' });
  }

  const patient = await Patient.findById(patientId);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }
  if (!(patient.stages || []).some((item) => Number(item.number) === stageNumber)) {
    return res.status(400).json({ success: false, message: 'Selected phase was not found for this patient' });
  }

  const now = new Date();
  const adviceRequest = await AdviceRequest.create({
    patient: patient._id,
    stage: stageNumber,
    query: String(query).trim(),
    askedAt: now,
    isUrgent: Boolean(isUrgent),
    requestedBy: req.user._id,
    requestedByName: req.user.name,
    requestedByRole: req.user.role,
    timeline: [{ at: now, action: Boolean(isUrgent) ? 'Query raised (emergency)' : 'Query raised', details: String(query).trim().slice(0, 1000), byName: req.user.name, byRole: req.user.role }],
  });
  notify(req, adviceRequest);

  addPatientActivity(
    patient,
    req.user,
    Boolean(isUrgent) ? `Urgent advice requested from doctor for Phase ${stageNumber}` : `Advice requested from doctor for Phase ${stageNumber}`,
    String(query).trim()
  );
  await patient.save();
  await adviceRequest.populate('patient', ADVICE_PATIENT_SELECT);

  res.status(201).json({ success: true, advice: formatAdvice(adviceRequest) });
});

const listPatientAdvice = asyncHandler(async (req, res) => {
  // Only the access-check fields are needed here — not the patient's whole record.
  const patient = await Patient.findById(req.params.patientId)
    .select('assignedDoctor assignedPsychologist approvalStatus')
    .lean();
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
    .populate('patient', ADVICE_PATIENT_SELECT)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json({ success: true, rows: rows.map(formatAdvice) });
});

const listAdviceRequests = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Doctor or Admin can view advice requests' });
  }

  const rows = await AdviceRequest.find({ status: 'requested' })
    .populate('patient', ADVICE_PATIENT_SELECT)
    .sort({ isUrgent: -1, lastAlarmAt: -1, createdAt: -1 })
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
    .populate('patient', ADVICE_PATIENT_SELECT)
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
    .populate('patient', ADVICE_PATIENT_SELECT)
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
    await discardUpload(req);
    return res.status(403).json({ success: false, message: 'Only Doctor or Admin can give advice' });
  }

  const { advice } = req.body;
  // Written advice, a voice recording, or both.
  if (!String(advice || '').trim() && !req.file) {
    return res.status(400).json({ success: false, message: 'Write the advice or record it' });
  }

  const entry = await AdviceRequest.findById(req.params.id);
  if (!entry) {
    await discardUpload(req);
    return res.status(404).json({ success: false, message: 'Advice request not found' });
  }

  if (entry.status === 'advice_given') {
    await discardUpload(req);
    return res.status(400).json({ success: false, message: 'This query is already answered' });
  }
  entry.status = 'advice_given';
  entry.advice = String(advice || '').trim();
  await applyVoice(entry, req);
  entry.adviceGivenAt = new Date();
  entry.adviceGivenBy = req.user._id;
  entry.adviceGivenByName = req.user.name;
  entry.doctorReadAt = entry.doctorReadAt || new Date();
  track(entry, req.user, 'Doctor answered', [entry.advice ? 'Written' : '', entry.adviceVoice?.url ? 'Voice recording' : ''].filter(Boolean).join(' + '));
  await entry.save();
  notify(req, entry);

  const patient = await Patient.findById(entry.patient);
  if (patient) {
    addPatientActivity(patient, req.user, `Doctor advice given for Phase ${entry.stage || '-'}`, adviceSummary(entry));
    await patient.save();
  }

  await entry.populate('patient', ADVICE_PATIENT_SELECT);
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
  if (!isAdminLike(req.user) && String(entry.requestedBy) !== String(req.user._id)) {
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
  track(entry, req.user, 'Query edited', entry.query);
  await entry.save();
  notify(req, entry);

  addPatientActivity(
    patient,
    req.user,
    entry.isUrgent ? `Urgent advice request edited for Phase ${entry.stage || '-'}` : `Advice request edited for Phase ${entry.stage || '-'}`,
    entry.query
  );
  await patient.save();

  await entry.populate('patient', ADVICE_PATIENT_SELECT);
  res.status(200).json({ success: true, advice: formatAdvice(entry) });
});

const updateAdviceAnswer = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Doctor or Admin can edit advice' });
  }

  const { advice } = req.body;
  const entry = await AdviceRequest.findById(req.params.id);
  if (!entry) {
    await discardUpload(req);
    return res.status(404).json({ success: false, message: 'Advice request not found' });
  }
  const keepsVoice = req.file || (entry.adviceVoice?.url && !(req.body.removeVoice === 'true' || req.body.removeVoice === true));
  if (!String(advice || '').trim() && !keepsVoice) {
    await discardUpload(req);
    return res.status(400).json({ success: false, message: 'Write the advice or record it' });
  }
  if (entry.status !== 'advice_given') {
    return res.status(400).json({ success: false, message: 'Advice has not been given yet' });
  }
  if (!isAdminLike(req.user) && String(entry.adviceGivenBy || '') !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'You can only edit advice given by you' });
  }

  entry.advice = String(advice || '').trim();
  await applyVoice(entry, req);
  track(entry, req.user, 'Doctor edited the answer', entry.sentToPatientAt ? 'after it was sent to the patient' : '');
  await entry.save();
  notify(req, entry);

  const patient = await Patient.findById(entry.patient);
  if (patient) {
    addPatientActivity(patient, req.user, `Doctor advice edited for Phase ${entry.stage || '-'}`, adviceSummary(entry));
    await patient.save();
  }

  await entry.populate('patient', ADVICE_PATIENT_SELECT);
  res.status(200).json({ success: true, advice: formatAdvice(entry) });
});

// ---- The PCC's side: send the answer, follow up, solve, ask again, ring the doctor ----

// The PCC who raised it, the PCC the patient is assigned to, or the admin / manager.
const canWorkOn = (user, entry, patient) => isAdminLike(user)
  || String(entry.requestedBy) === String(user._id)
  || (user.role === ROLES.ASSISTANT_DOCTOR && canAccessPatient(user, patient));

const loadForPcc = async (req) => {
  if (!canRequestAdvice(req.user)) fail('Only the PCC or the admin works on patient queries', 403);
  const entry = await AdviceRequest.findById(req.params.id);
  if (!entry) fail('Query not found', 404);
  const patient = await Patient.findById(entry.patient);
  if (!patient) fail('Patient not found', 404);
  if (!canWorkOn(req.user, entry, patient)) fail('This query belongs to another PCC', 403);
  return { entry, patient };
};

const saveAndSend = async (req, res, entry, patient, activity, details = '') => {
  await entry.save();
  if (activity) {
    addPatientActivity(patient, req.user, `${activity} (Phase ${entry.stage || '-'})`, details);
    await patient.save();
  }
  notify(req, entry);
  await entry.populate('patient', ADVICE_PATIENT_SELECT);
  res.status(200).json({ success: true, advice: formatAdvice(entry) });
};

const solve = (entry, user, note, now) => {
  Object.assign(entry, { resolvedAt: now, resolvedBy: user._id, resolvedByName: user.name, resolvedNote: note, nextFollowUpAt: null });
  track(entry, user, 'Query solved', note || 'Patient satisfied');
};

// @route POST /api/advice/:id/sent   { via: whatsapp|call|in_person|other, note, followUpAt }
// The PCC sent the doctor's answer to the patient; the follow-up is due at followUpAt (default: a day later).
const markSentToPatient = asyncHandler(async (req, res) => {
  const { entry, patient } = await loadForPcc(req);
  if (entry.resolvedAt) fail('This query is already solved');
  if (entry.status !== 'advice_given') fail('The doctor has not answered yet');
  if (entry.sentToPatientAt) fail('Already marked as sent to the patient');
  const via = String(req.body?.via || '');
  if (!SENT_VIA.includes(via)) fail('Select how the answer was sent to the patient');
  const now = new Date();
  const note = clean(req.body?.note, 1000);
  const followUpAt = req.body?.followUpAt ? dateOf(req.body.followUpAt, 'follow-up time') : new Date(now.getTime() + DAY_MS);
  if (followUpAt.getTime() < now.getTime() - 5 * 60 * 1000) fail('The follow-up time is in the past');
  Object.assign(entry, { sentToPatientAt: now, sentToPatientBy: req.user._id, sentToPatientByName: req.user.name, sentVia: via, sentNote: note, nextFollowUpAt: followUpAt });
  track(entry, req.user, 'Sent to the patient', `${SENT_VIA_LABEL[via]}${note ? ` - ${note}` : ''} · follow-up ${istTime(followUpAt)}`);
  await saveAndSend(req, res, entry, patient, "Doctor's answer sent to the patient", `${SENT_VIA_LABEL[via]}${note ? ` - ${note}` : ''}`);
});

// @route POST /api/advice/:id/follow-up   { outcome, note, nextAt, solve }
// After sending: how the patient is. Satisfied -> it can be solved at once; otherwise the next call is set (or the
// PCC asks the doctor again).
const addQueryFollowUp = asyncHandler(async (req, res) => {
  const { entry, patient } = await loadForPcc(req);
  if (entry.resolvedAt) fail('This query is already solved');
  if (!entry.sentToPatientAt) fail("Send the doctor's answer to the patient first");
  const outcome = String(req.body?.outcome || '');
  if (!FOLLOW_UP_OUTCOMES.includes(outcome)) fail('Select how the follow-up went');
  const now = new Date();
  const note = clean(req.body?.note, 1000);
  let nextAt = req.body?.nextAt ? dateOf(req.body.nextAt, 'next follow-up time') : null;
  if (['not_reachable', 'call_back'].includes(outcome) && !nextAt) fail('Set when to call the patient again');
  if (outcome === 'not_satisfied' && !note) fail('Write what the patient is still not satisfied with');
  if (nextAt && nextAt.getTime() < now.getTime() - 5 * 60 * 1000) fail('The next follow-up time is in the past');
  if (outcome === 'satisfied') nextAt = null;
  entry.followUps.push({ at: now, outcome, note, nextAt, byName: req.user.name, byRole: req.user.role });
  entry.nextFollowUpAt = nextAt;
  track(entry, req.user, 'Follow-up', `${OUTCOME_LABEL[outcome]}${note ? ` - ${note}` : ''}${nextAt ? ` · next call ${istTime(nextAt)}` : ''}`);
  const solveNow = outcome === 'satisfied' && (req.body?.solve === true || req.body?.solve === 'true');
  if (solveNow) solve(entry, req.user, clean(req.body?.solveNote, 1000), now);
  await saveAndSend(req, res, entry, patient, solveNow ? 'Patient query solved after follow-up' : 'Patient query follow-up', `${OUTCOME_LABEL[outcome]}${note ? ` - ${note}` : ''}`);
});

// @route POST /api/advice/:id/resolve   { note }   Only after a follow-up where the patient was satisfied.
const resolveQuery = asyncHandler(async (req, res) => {
  const { entry, patient } = await loadForPcc(req);
  if (entry.resolvedAt) fail('This query is already solved');
  if (!entry.sentToPatientAt) fail("Send the doctor's answer to the patient first");
  const last = entry.followUps[entry.followUps.length - 1];
  if (!last || last.outcome !== 'satisfied') fail('Take the follow-up first: a query is solved once the patient is satisfied');
  const note = clean(req.body?.note, 1000);
  solve(entry, req.user, note, new Date());
  await saveAndSend(req, res, entry, patient, 'Patient query solved', note);
});

// @route POST /api/advice/:id/ask-again   { query, isUrgent }
// The patient is not satisfied (or has more to ask): the same query goes back to the doctor with the new question;
// the earlier question, answer, sending and follow-ups are kept in rounds.
const askDoctorAgain = asyncHandler(async (req, res) => {
  const { entry, patient } = await loadForPcc(req);
  if (entry.resolvedAt) fail('This query is already solved');
  if (entry.status !== 'advice_given') fail('The doctor has not answered the current question yet');
  const query = clean(req.body?.query, 4000);
  if (!query) fail('Write what to ask the doctor');
  const now = new Date();
  entry.rounds.push({
    query: entry.query, askedAt: entry.askedAt || entry.createdAt, askedByName: entry.requestedByName, isUrgent: entry.isUrgent,
    advice: entry.advice, adviceVoice: plain(entry.adviceVoice), adviceGivenAt: entry.adviceGivenAt, adviceGivenByName: entry.adviceGivenByName,
    sentToPatientAt: entry.sentToPatientAt, sentToPatientByName: entry.sentToPatientByName, sentVia: entry.sentVia, sentNote: entry.sentNote,
    followUps: entry.followUps.map(plain),
  });
  Object.assign(entry, {
    query, askedAt: now, isUrgent: req.body?.isUrgent === true || req.body?.isUrgent === 'true', status: 'requested', doctorReadAt: null,
    advice: '', adviceVoice: undefined, adviceGivenAt: null, adviceGivenBy: null, adviceGivenByName: '',
    sentToPatientAt: null, sentToPatientBy: null, sentToPatientByName: '', sentVia: '', sentNote: '', followUps: [], nextFollowUpAt: null, alarms: [], lastAlarmAt: null,
  });
  track(entry, req.user, entry.isUrgent ? 'Asked the doctor again (emergency)' : 'Asked the doctor again', query);
  await saveAndSend(req, res, entry, patient, 'Doctor asked again about the patient query', query);
});

// @route POST /api/advice/:id/alarm   { note }   The doctor has not answered: the PCC rings the doctor's alarm.
const ringDoctorAlarm = asyncHandler(async (req, res) => {
  const { entry, patient } = await loadForPcc(req);
  if (entry.resolvedAt || entry.status !== 'requested') fail('The doctor has already answered this query');
  const now = new Date();
  if (entry.lastAlarmAt && now - new Date(entry.lastAlarmAt) < 60 * 1000) fail('The alarm was rung less than a minute ago');
  const note = clean(req.body?.note, 300);
  entry.alarms.push({ at: now, note, byName: req.user.name, byRole: req.user.role });
  entry.lastAlarmAt = now;
  track(entry, req.user, "Rang the doctor's alarm", note);
  notify(req, entry, 'advice:alarm');
  await saveAndSend(req, res, entry, patient, "Doctor's alarm rung for a patient query", note);
});

// @route GET /api/advice/doctor-alarms   Queries a PCC rang the alarm for that the doctor has not answered.
const doctorAdviceAlarms = asyncHandler(async (req, res) => {
  if (!canAnswerAdvice(req.user)) return res.json({ success: true, alarms: [] });
  const rows = await AdviceRequest.find({ status: 'requested', resolvedAt: null, lastAlarmAt: { $ne: null } })
    .populate('patient', QUERY_PATIENT_SELECT).sort({ lastAlarmAt: -1 }).limit(50).lean();
  res.json({
    success: true,
    alarms: rows.map((r) => {
      const last = (r.alarms || [])[r.alarms.length - 1] || {};
      return { id: String(r._id), patientId: String(r.patient?._id || r.patient), patientName: r.patient?.patientName || '', patientCode: r.patient?.patientCode || '', stage: r.stage, query: String(r.query || '').slice(0, 160), isUrgent: Boolean(r.isUrgent), rings: (r.alarms || []).length, lastAlarmAt: iso(r.lastAlarmAt), lastAlarmBy: last.byName || '', lastNote: last.note || '', waitingSince: iso(r.askedAt || r.createdAt) };
    }),
  });
});

// @route GET /api/advice/queries?view=open|solved   The PCC's patient queries (the admin / manager: everyone's).
const listPatientQueries = asyncHandler(async (req, res) => {
  if (!canRequestAdvice(req.user)) fail('Only the PCC or the admin sees patient queries', 403);
  const solved = req.query.view === 'solved';
  const filter = solved ? { resolvedAt: { $ne: null } } : { resolvedAt: null };
  if (!isAdminLike(req.user)) filter.requestedBy = req.user._id;
  const rows = await AdviceRequest.find(filter).populate('patient', QUERY_PATIENT_SELECT)
    .sort(solved ? { resolvedAt: -1 } : { updatedAt: -1 }).limit(solved ? 200 : 400).lean();
  res.json({ success: true, rows: rows.map(formatAdvice) });
});

// Open work of the PCC (My Day, sidebar count): answers to send, follow-ups due in the next 24 hours or late, and
// patients not satisfied with no next step yet.
const pccQueryWork = async (user, now = new Date()) => {
  const filter = { resolvedAt: null, status: 'advice_given' };
  if (!isAdminLike(user)) filter.requestedBy = user._id;
  const rows = await AdviceRequest.find(filter).select('patient stage query adviceGivenAt sentToPatientAt nextFollowUpAt followUps.outcome followUps.at').populate('patient', 'patientName patientCode').lean();
  const soon = now.getTime() + DAY_MS;
  const out = [];
  for (const r of rows) {
    const base = { id: String(r._id), patientId: String(r.patient?._id || r.patient), patientName: r.patient?.patientName || 'Patient', patientCode: r.patient?.patientCode || '', stage: r.stage, query: String(r.query || '').slice(0, 80) };
    const last = (r.followUps || [])[(r.followUps || []).length - 1];
    if (!r.sentToPatientAt) out.push({ ...base, what: "Doctor answered - send it to the patient", due: r.adviceGivenAt });
    else if (r.nextFollowUpAt && new Date(r.nextFollowUpAt).getTime() <= soon) out.push({ ...base, what: new Date(r.nextFollowUpAt) < now ? 'Follow-up late' : 'Follow-up due', due: r.nextFollowUpAt });
    else if (!r.nextFollowUpAt && last?.outcome === 'not_satisfied') out.push({ ...base, what: 'Patient not satisfied - ask the doctor again or set the next call', due: last.at });
    else if (!r.nextFollowUpAt && last?.outcome === 'satisfied') out.push({ ...base, what: 'Patient satisfied - mark the query solved', due: last.at });
  }
  return out;
};

module.exports = {
  markSentToPatient,
  addQueryFollowUp,
  resolveQuery,
  askDoctorAgain,
  ringDoctorAlarm,
  doctorAdviceAlarms,
  listPatientQueries,
  pccQueryWork,
  createAdviceRequest,
  listPatientAdvice,
  listAdviceRequests,
  listAdviceGiven,
  getUnreadAdviceCount,
  respondToAdviceRequest,
  updateAdviceRequest,
  updateAdviceAnswer,
};
