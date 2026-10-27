const DigitalMarketingReview = require('../models/DigitalMarketingReview');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { CATEGORY_LABELS } = require('./webhookController');
const { collectSessions, countOutcomes, qualifiesForMarketing, improvementSummaryOf } = require('../utils/patientImprovement');

const REVIEW_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.DIGITAL_MARKETING];

const isSameUser = (left, right) => {
  if (!left || !right) return false;
  return String(left._id || left) === String(right._id || right);
};

const canAccessPatientForReview = (user, patient) => {
  if (user.role === ROLES.PSYCHOLOGIST) return isSameUser(patient.assignedPsychologist, user._id);
  if (user.role !== ROLES.ASSISTANT_DOCTOR) return true;
  return isSameUser(patient.assignedDoctor, user._id);
};

const dateOnly = (value) => (value ? String(value).slice(0, 10) : '');

const latestFollowUpDate = (patient) => {
  let latest = null;
  (patient.stages || []).forEach((stage) => {
    (stage.followUps || []).forEach((entry) => {
      if (!entry.dateTime) return;
      const next = new Date(entry.completedAt || entry.dateTime);
      if (!latest || next > latest) latest = next;
    });
  });
  return latest;
};

const programStartDate = (patient) => {
  const dates = (patient.stages || [])
    .map((stage) => (stage.date ? new Date(stage.date) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  return dates[0] || patient.createdAt || null;
};

const patientSnapshot = (patient) => ({
  patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
  parentName: patient.guardianName || patient.relativeName || '',
  mobileNumber: patient.number || '',
  patientName: patient.patientName || '',
  program: CATEGORY_LABELS[patient.category] || patient.category || '',
  programStartDate: programStartDate(patient),
  latestFollowUpDate: latestFollowUpDate(patient),
});

const formatReview = (review) => ({
  id: review._id,
  patientId: review.patient,
  patientCode: review.patientCode,
  parentName: review.parentName,
  mobileNumber: review.mobileNumber,
  patientName: review.patientName,
  program: review.program,
  programStartDate: dateOnly(review.programStartDate),
  latestFollowUpDate: dateOnly(review.latestFollowUpDate),
  improvementSummary: review.improvementSummary || '',
  parentSatisfied: review.parentSatisfied || '',
  permissionToRequestReview: review.permissionToRequestReview || '',
  firstRequestDate: dateOnly(review.firstRequestDate),
  contactMethod: review.contactMethod || '',
  reviewStatus: review.reviewStatus || '',
  lastContactDate: dateOnly(review.lastContactDate),
  nextActionDate: dateOnly(review.nextActionDate),
  reviewPlatform: review.reviewPlatform || '',
  reviewLinkRef: review.reviewLinkRef || '',
  testimonialConsent: review.testimonialConsent || '',
  approvedBy: review.approvedBy || '',
  notes: review.notes || '',
  autoAdded: Boolean(review.autoAdded),
  improvementMonth: review.improvementMonth || '',
  monthImprovements: review.monthImprovements || 0,
  monthProblems: review.monthProblems || 0,
  createdByName: review.createdByName || '',
  updatedByName: review.updatedByName || '',
  updatedAt: review.updatedAt,
});

// Live improvement details from the Patient Improvement page (follow-up / family session outcomes),
// so the sheet always shows what the team noted, not a copy that goes stale.
const IMPROVEMENT_SELECT = ['dateTime', 'status', 'completedAt', 'outcome', 'outcomeNote', 'outcomeAt', 'outcomeByName']
  .flatMap((field) => ['followUps', 'familySessions'].map((kind) => `stages.${kind}.${field}`))
  .join(' ');
const MAX_NOTES = 12;
const emptyImprovement = () => ({ totals: { sessions: 0, followUps: 0, familySessions: 0, improvements: 0, problems: 0 }, notes: [] });
const improvementDetailsFor = async (patientIds) => {
  const details = new Map();
  if (!patientIds.length) return details;
  const patients = await Patient.find({ _id: { $in: patientIds } }).select(`stages.number ${IMPROVEMENT_SELECT}`).lean();
  patients.forEach((patient) => {
    const sessions = collectSessions(patient);
    details.set(String(patient._id), {
      totals: countOutcomes(sessions),
      // Newest first: what was noted after each done follow-up / family session.
      notes: sessions.filter((row) => row.outcome).reverse().slice(0, MAX_NOTES).map((row) => ({
        id: row.id,
        kind: row.kind,
        kindLabel: row.kindLabel,
        stage: row.stage,
        date: row.date,
        month: row.month,
        outcome: row.outcome,
        note: row.outcomeNote,
        byName: row.outcomeByName,
      })),
    });
  });
  return details;
};

const reviewWithImprovement = async (review) => {
  const details = await improvementDetailsFor([review.patient]);
  return { ...formatReview(review), improvement: details.get(String(review.patient)) || emptyImprovement() };
};

const getReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.ASSISTANT_DOCTOR) {
    const patients = await Patient.find({ assignedDoctor: req.user._id }).select('_id');
    filter.patient = { $in: patients.map((patient) => patient._id) };
  } else if (req.user.role === ROLES.PSYCHOLOGIST) {
    const patients = await Patient.find({ assignedPsychologist: req.user._id }).select('_id');
    filter.patient = { $in: patients.map((patient) => patient._id) };
  }

  const reviews = await DigitalMarketingReview.find(filter).sort({ updatedAt: -1 });
  const details = await improvementDetailsFor(reviews.map((review) => review.patient));
  res.status(200).json({
    success: true,
    reviews: reviews.map((review) => ({ ...formatReview(review), improvement: details.get(String(review.patient)) || emptyImprovement() })),
  });
});

const createReview = asyncHandler(async (req, res) => {
  const { patientId, improvementSummary = '', notes = '' } = req.body;
  if (!patientId) {
    return res.status(400).json({ success: false, message: 'Select a patient' });
  }

  const patient = await Patient.findById(patientId);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  if (!canAccessPatientForReview(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  const existing = await DigitalMarketingReview.findOne({ patient: patient._id });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Review row already exists for this patient' });
  }

  const review = await DigitalMarketingReview.create({
    patient: patient._id,
    ...patientSnapshot(patient),
    improvementSummary,
    notes,
    createdBy: req.user._id,
    createdByName: req.user.name,
    createdByRole: req.user.role,
    updatedByName: req.user.name,
    updatedByRole: req.user.role,
  });

  res.status(201).json({ success: true, review: await reviewWithImprovement(review) });
});

const editableFields = [
  'latestFollowUpDate',
  'improvementSummary',
  'parentSatisfied',
  'permissionToRequestReview',
  'firstRequestDate',
  'contactMethod',
  'reviewStatus',
  'lastContactDate',
  'nextActionDate',
  'reviewPlatform',
  'reviewLinkRef',
  'testimonialConsent',
  'approvedBy',
  'notes',
];

const dateFields = new Set(['latestFollowUpDate', 'firstRequestDate', 'lastContactDate', 'nextActionDate']);

const updateReview = asyncHandler(async (req, res) => {
  const review = await DigitalMarketingReview.findById(req.params.id);
  if (!review) {
    return res.status(404).json({ success: false, message: 'Review row not found' });
  }

  if ([ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(req.user.role)) {
    const patient = await Patient.findById(review.patient).select('assignedDoctor assignedPsychologist');
    if (!patient || !canAccessPatientForReview(req.user, patient)) {
      return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
    }
  }

  editableFields.forEach((field) => {
    if (req.body[field] === undefined) return;
    review[field] = dateFields.has(field) ? req.body[field] || null : req.body[field] || '';
  });
  review.updatedByName = req.user.name;
  review.updatedByRole = req.user.role;
  await review.save();

  res.status(200).json({ success: true, review: await reviewWithImprovement(review) });
});

const deleteReview = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: 'Only admin can delete review rows' });
  }

  const review = await DigitalMarketingReview.findById(req.params.id);
  if (!review) {
    return res.status(404).json({ success: false, message: 'Review row not found' });
  }

  await review.deleteOne();
  res.status(200).json({ success: true, message: 'Review row deleted' });
});

// Called whenever a follow-up / family session outcome is noted. When the patient clearly improved in
// that month the patient lands in the review sheet (or the existing row gets the new counts).
// Cells the marketing team already filled are never overwritten.
// force: someone chose "Add to Digital Marketing" on the Patient Improvement page for this patient.
const syncImprovementToMarketing = async (patient, monthKey, user = null, { force = false } = {}) => {
  if (!patient || !monthKey) return null;
  const sessions = collectSessions(patient).filter((row) => row.month === monthKey);
  const counts = countOutcomes(sessions);
  const qualifies = force || qualifiesForMarketing(counts);
  let review = await DigitalMarketingReview.findOne({ patient: patient._id });
  if (!review && !qualifies) return null;
  if (!review) {
    return DigitalMarketingReview.create({
      patient: patient._id,
      ...patientSnapshot(patient),
      improvementSummary: improvementSummaryOf(sessions),
      autoSummary: improvementSummaryOf(sessions),
      improvementMonth: monthKey,
      monthImprovements: counts.improvements,
      monthProblems: counts.problems,
      autoAdded: !force,
      createdBy: force ? user?._id || null : null,
      createdByName: force ? user?.name || '' : 'Auto · Patient Improvement',
      createdByRole: user?.role || '',
      updatedByName: force ? user?.name || '' : 'Auto · Patient Improvement',
    });
  }
  // Keep the newest qualifying month on the row; also refresh the same month when its counts change.
  const isNewerMonth = qualifies && String(monthKey) > String(review.improvementMonth || '');
  const isSameMonth = String(monthKey) === String(review.improvementMonth || '');
  if (!isNewerMonth && !isSameMonth) return review;
  review.improvementMonth = monthKey;
  review.monthImprovements = counts.improvements;
  review.monthProblems = counts.problems;
  review.latestFollowUpDate = patientSnapshot(patient).latestFollowUpDate || review.latestFollowUpDate;
  // Keep the summary in step with the notes unless the marketing team wrote their own.
  const summary = improvementSummaryOf(sessions);
  if (!review.improvementSummary || review.improvementSummary === (review.autoSummary || '')) {
    review.improvementSummary = summary;
    review.autoSummary = summary;
  }
  await review.save();
  return review;
};

module.exports = {
  REVIEW_ACCESS_ROLES,
  syncImprovementToMarketing,
  getReviews,
  createReview,
  updateReview,
  deleteReview,
};
