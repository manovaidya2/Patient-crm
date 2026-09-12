const DigitalMarketingReview = require('../models/DigitalMarketingReview');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { CATEGORY_LABELS } = require('./webhookController');

const REVIEW_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.DIGITAL_MARKETING];

const isSameUser = (left, right) => {
  if (!left || !right) return false;
  return String(left._id || left) === String(right._id || right);
};

const canAccessPatientForReview = (user, patient) => {
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
  createdByName: review.createdByName || '',
  updatedByName: review.updatedByName || '',
  updatedAt: review.updatedAt,
});

const getReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.ASSISTANT_DOCTOR) {
    const patients = await Patient.find({ assignedDoctor: req.user._id }).select('_id');
    filter.patient = { $in: patients.map((patient) => patient._id) };
  }

  const reviews = await DigitalMarketingReview.find(filter).sort({ updatedAt: -1 });
  res.status(200).json({ success: true, reviews: reviews.map(formatReview) });
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

  res.status(201).json({ success: true, review: formatReview(review) });
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

  if (req.user.role === ROLES.ASSISTANT_DOCTOR) {
    const patient = await Patient.findById(review.patient).select('assignedDoctor');
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

  res.status(200).json({ success: true, review: formatReview(review) });
});

module.exports = {
  REVIEW_ACCESS_ROLES,
  getReviews,
  createReview,
  updateReview,
};
