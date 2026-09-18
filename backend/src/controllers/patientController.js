const Patient = require('../models/Patient');
const User = require('../models/User');
const CallLog = require('../models/CallLog');
const AdviceRequest = require('../models/AdviceRequest');
const DigitalMarketingReview = require('../models/DigitalMarketingReview');
const BankAccount = require('../models/BankAccount');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { asyncHandler } = require('../middleware/errorHandler');
const { writeTextPdf, writeImagesPdf } = require('../utils/simplePdf');
const { ALL_CATEGORIES, CATEGORY_LABELS } = require('../constants/patientCategories');
const {
  STAGES,
  STAGE_LABELS,
  STAGE_STATUSES,
  ALL_STAGE_STATUSES,
  STAGE_STATUS_LABELS,
} = require('../constants/treatmentStages');
const { PAYMENT_MODES, ALL_PAYMENT_MODES, PAYMENT_MODE_LABELS } = require('../constants/paymentModes');
const { ROLES, ASSIGN_DOCTOR_ROLES } = require('../constants/roles');
const { ALL_SCHEDULE_STATUSES, DISPLAY_STATUS_LABELS, getDisplayStatus } = require('../constants/scheduleStatuses');

const MEDICINE_STATUSES = {
  NOT_REQUESTED: 'not_requested',
  REQUESTED: 'requested',
  IN_PROCESS: 'in_process',
  MADE: 'made',
  SENT_TO_COURIER: 'sent_to_courier',
};

const MEDICINE_STATUS_LABELS = {
  [MEDICINE_STATUSES.NOT_REQUESTED]: 'Not Requested',
  [MEDICINE_STATUSES.REQUESTED]: 'Medicine Request Sent',
  [MEDICINE_STATUSES.IN_PROCESS]: 'Medicine Preparation In Process',
  [MEDICINE_STATUSES.MADE]: 'Medicine Done',
  [MEDICINE_STATUSES.SENT_TO_COURIER]: 'Sent To Courier',
};

const ACTIVE_MEDICINE_STATUSES = Object.values(MEDICINE_STATUSES);

const COURIER_STATUSES = {
  PENDING: 'pending',
  DISPATCHED: 'dispatched',
  DELIVERED: 'delivered',
};

const COURIER_STATUS_LABELS = {
  [COURIER_STATUSES.PENDING]: 'Courier Pending',
  [COURIER_STATUSES.DISPATCHED]: 'Courier Dispatched',
  [COURIER_STATUSES.DELIVERED]: 'Delivered',
};

const emptyCourier = () => ({
  status: COURIER_STATUSES.PENDING,
  receiverName: '',
  receiverPhone: '',
  address: '',
  courierPartner: '',
  deliveryMode: 'courier',
  selfPickupByName: '',
  trackingNumber: '',
  packageImageUrl: null,
  packageImageFileName: '',
  packageImages: [],
  paymentPaidBy: 'clinic',
  paymentAmount: 0,
  paymentMode: '',
  notes: '',
  dispatchedAt: null,
  dispatchedByName: '',
  deliveredAt: null,
  deliveredByName: '',
  receivedByName: '',
  deliveryProofUrl: null,
  deliveryProofFileName: '',
  deliveryProofImages: [],
});

const emptyMedicineRequest = () => ({
  status: MEDICINE_STATUSES.NOT_REQUESTED,
  medicines: '',
  notes: '',
  prescriptionUrl: null,
  prescriptionFileName: '',
  prescriptionFiles: [],
  requestedAt: null,
  requestedByName: '',
  inProcessAt: null,
  inProcessByName: '',
  madeAt: null,
  madeByName: '',
  medicineImageUrl: null,
  medicineImageFileName: '',
  medicineImages: [],
  packagedByName: '',
  chitsWrittenByName: '',
  lastMedicineCheckedByName: '',
  packagingDetailsFilledByName: '',
  packagingDetailsFilledAt: null,
  sentToCourierAt: null,
  sentToCourierByName: '',
  courier: emptyCourier(),
});
// Assistant Doctor and Psychologist can only see/edit patients assigned to them,
// and only once the patient has cleared accounts approval (see approvalStatus on the model).
// Works whether assignment fields are raw ObjectIds or populated into {_id, name}.
const canAccessPatient = (user, patient) => {
  if (user.role !== ROLES.ASSISTANT_DOCTOR && user.role !== ROLES.PSYCHOLOGIST) return true;
  if ((patient.approvalStatus || 'approved') !== 'approved') return false;
  if (patient.isActive === false) return false;
  const assignment = user.role === ROLES.ASSISTANT_DOCTOR ? patient.assignedDoctor : patient.assignedPsychologist;
  if (!assignment) return false;
  const assignedId = assignment._id || assignment;
  return String(assignedId) === String(user._id);
};

const canReviewPatientApproval = (user) => [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT].includes(user?.role);
const canTogglePatientActive = (user) => [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR].includes(user?.role);
const isApprovedPayment = (payment = {}) => (payment.approvalStatus || 'approved') === 'approved';

const formatAssignedUser = (assignedUser) => {
  if (!assignedUser) return null;
  if (typeof assignedUser === 'object' && assignedUser.name) {
    return { id: assignedUser._id, name: assignedUser.name };
  }
  return { id: assignedUser, name: null };
};

const populateAssignments = async (patient) => {
  await patient.populate('assignedDoctor', 'name');
  await patient.populate('assignedPsychologist', 'name');
  await patient.populate('stages.postCounselor', 'name');
};

const addActivity = (patient, user, action, details = '') => {
  patient.activityLog.push({
    action,
    details,
    actorName: user?.name || 'System',
    actorRole: user?.role || '',
  });
};

const filesFromRequest = (req) => req.files || (req.file ? [req.file] : []);
const toFileItems = (files, folder) =>
  files.map((file) => ({
    url: `/uploads/${folder}/${file.filename}`,
    fileName: file.originalname,
  }));
const mergeFileItems = (existing = [], items = []) => [...(existing || []), ...items];
const withLegacyFile = (files = [], url, fileName) => {
  const list = [...(files || [])];
  if (url && !list.some((file) => file.url === url)) {
    list.unshift({ url, fileName: fileName || 'View file' });
  }
  return list;
};

const sameValue = (left, right) => String(left ?? '') === String(right ?? '');

const resolvePayToBank = async (paymentMode, bankId) => {
  if (paymentMode !== PAYMENT_MODES.ONLINE) return { payToBank: null, payToBankName: '' };
  const normalizedBankId = String(bankId || '').trim();
  const activeBanks = await BankAccount.countDocuments({ isActive: true });
  if (!normalizedBankId) {
    if (activeBanks > 0) {
      const error = new Error('Pay to Bank is required for online payment');
      error.statusCode = 400;
      throw error;
    }
    return { payToBank: null, payToBankName: '' };
  }
  const bank = await BankAccount.findOne({ _id: normalizedBankId, isActive: true }).lean();
  if (!bank) {
    const error = new Error('Select a valid active bank');
    error.statusCode = 400;
    throw error;
  }
  return { payToBank: bank._id, payToBankName: bank.displayName || bank.name };
};

const formatScheduleEntry = (e) => {
  const displayStatus = getDisplayStatus(e);
  return {
    id: e._id,
    dateTime: e.dateTime,
    status: e.status,
    followUpType: e.followUpType || 'normal',
    displayStatus,
    displayStatusLabel: DISPLAY_STATUS_LABELS[displayStatus],
    notes: e.notes,
    createdByName: e.createdByName,
    completedAt: e.completedAt || null,
    trackerSentAt: e.trackerSentAt || null,
    trackerSentByName: e.trackerSentByName || '',
    completionName: e.completionName || '',
    completionDetails: e.completionDetails || '',
    completionFiles: e.completionFiles || [],
    trackerSubmissionUrl: e.trackerSubmissionUrl || '',
    meetRecordingUrl: e.meetRecordingUrl || '',
    completionFormType: e.completionFormType || '',
    completionPdfUrl: e.completionPdfUrl || null,
    completionPdfName: e.completionPdfName || '',
    cancelReason: e.cancelReason || '',
    cancelledAt: e.cancelledAt || null,
    cancelledByName: e.cancelledByName || '',
    ...(e.followUpType === 'tracker' && e.status === 'sent'
      ? { displayStatusLabel: 'Tracker Sent' }
      : {}),
  };
};

const isSameUser = (left, right) => {
  if (!left || !right) return false;
  return String(left._id || left) === String(right._id || right);
};

const canSeeScheduleReminder = (user, patient, type) => {
  if (user.role === ROLES.MANAGER) return true;
  if (user.role === ROLES.ASSISTANT_DOCTOR) return type === 'followup' && isSameUser(patient.assignedDoctor, user._id);
  if (user.role === ROLES.PSYCHOLOGIST) return type === 'family_session' && isSameUser(patient.assignedPsychologist, user._id);
  return false;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const isMedicineConnectDue = (stage) => {
  if (!stage?.medicineNextConnectDate || stage.medicineConnectDone) return false;
  const connectDate = new Date(stage.medicineNextConnectDate);
  connectDate.setHours(0, 0, 0, 0);
  return connectDate <= startOfToday();
};

const canSeeMedicineConnectReminder = (user, patient, stage) => {
  if (user.role === ROLES.MANAGER) return true;
  if (user.role === ROLES.ASSISTANT_DOCTOR) return isSameUser(patient.assignedDoctor, user._id);
  if (user.role === ROLES.POST_COUNSELOR) return isSameUser(stage.postCounselor, user._id);
  return false;
};

const canEditPackageStage = (user) =>
  [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR].includes(user?.role);

const canEditPatientRecords = (user) =>
  [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user?.role);

const canAddStagePayment = (user) =>
  [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user?.role);

const canEditPatientIdentity = (user) =>
  [ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user?.role);

const assigneeKey = (assignedUser, fallbackName = 'Unassigned') =>
  assignedUser?._id ? String(assignedUser._id) : assignedUser ? String(assignedUser) : fallbackName;

const assigneeName = (assignedUser, fallbackName = 'Unassigned') =>
  assignedUser?.name || fallbackName;

const collectScheduleReminders = (patients, user, { includeUpcoming24 = false } = {}) => {
  const now = new Date();
  const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const reminders = [];

  patients.forEach((patient) => {
    (patient.stages || []).forEach((stage) => {
      const pushReminder = (entry, type) => {
        if (!canSeeScheduleReminder(user, patient, type)) return;
        const formatted = formatScheduleEntry(entry);
        const entryDate = formatted.dateTime ? new Date(formatted.dateTime) : null;
        const isLate = formatted.displayStatus === 'late';
        const isUpcoming24 =
          includeUpcoming24
          && formatted.displayStatus === 'upcoming'
          && entryDate
          && entryDate >= now
          && entryDate <= next24;
        if (!isLate && !isUpcoming24) return;

        reminders.push({
          ...formatted,
          type,
          reminderKind: isLate ? 'late' : 'next_24_hours',
          typeLabel: type === 'followup' ? 'Follow-up' : 'Family Session',
          patientId: patient._id,
          patientName: patient.patientName,
          patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
          category: patient.category,
          categoryLabel: CATEGORY_LABELS[patient.category],
          stageNumber: stage.number,
          stageLabel: STAGE_LABELS[stage.number],
          assignee: type === 'followup'
            ? patient.assignedDoctor?.name || 'Unassigned'
            : patient.assignedPsychologist?.name || 'Unassigned',
        });
      };

      (stage.followUps || []).forEach((entry) => pushReminder(entry, 'followup'));
      (stage.familySessions || []).forEach((entry) => pushReminder(entry, 'family_session'));

      if (isMedicineConnectDue(stage) && canSeeMedicineConnectReminder(user, patient, stage)) {
        reminders.push({
          id: `medicine-connect-${patient._id}-${stage.number}`,
          type: 'medicine_connect',
          reminderKind: 'late',
          typeLabel: 'Medicine Connect',
          dateTime: stage.medicineNextConnectDate,
          notes: stage.medicineNextConnectNote || '',
          patientId: patient._id,
          patientName: patient.patientName,
          patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
          category: patient.category,
          categoryLabel: CATEGORY_LABELS[patient.category],
          stageNumber: stage.number,
          stageLabel: STAGE_LABELS[stage.number],
          assignee: stage.postCounselor?.name || patient.assignedDoctor?.name || 'Unassigned',
        });
      }
    });
  });

  return reminders.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
};

const formatMedicineRequest = (request = {}) => {
  const data = { ...emptyMedicineRequest(), ...(request?.toObject?.() || request || {}) };
  const courier = { ...emptyCourier(), ...(data.courier?.toObject?.() || data.courier || {}) };
  return {
    ...data,
    id: data.requestId || 'legacy',
    prescriptionFiles: withLegacyFile(data.prescriptionFiles, data.prescriptionUrl, data.prescriptionFileName),
    medicineImages: withLegacyFile(data.medicineImages, data.medicineImageUrl, data.medicineImageFileName),
    courier: {
      ...courier,
      packageImages: withLegacyFile(courier.packageImages, courier.packageImageUrl, courier.packageImageFileName),
      deliveryProofImages: withLegacyFile(courier.deliveryProofImages, courier.deliveryProofUrl, courier.deliveryProofFileName),
      statusLabel: COURIER_STATUS_LABELS[courier.status] || courier.status,
    },
    statusLabel: MEDICINE_STATUS_LABELS[data.status] || data.status,
  };
};

const parseMaybeJsonValue = (value, fallback) => {
  if (typeof value !== 'string') return value || fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const pickWebhookValue = (source, keys, fallback) => {
  if (!source || typeof source !== 'object') return fallback;
  const normalizedSource = Object.entries(source).reduce((acc, [key, value]) => {
    acc[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')] = value;
    return acc;
  }, {});
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    const normalizedValue = normalizedSource[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '') return normalizedValue;
  }
  return fallback;
};

const parseCallTimeText = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const monthMap = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    sept: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\s*,?\s*(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\s+(\d{2,4})$/i);
  if (!match) return null;
  const [, rawHour, minute, second = '0', meridiem, day, monthName, rawYear] = match;
  let hour = Number(rawHour) % 12;
  if (meridiem.toLowerCase() === 'pm') hour += 12;
  const month = monthMap[monthName.toLowerCase()];
  if (month === undefined) return null;
  const yearNumber = Number(rawYear);
  const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
  return new Date(year, month, Number(day), hour, Number(minute), Number(second));
};

const getRawCallCreationTime = (callLog) => {
  const payload = parseMaybeJsonValue(callLog.rawPayload, callLog.rawPayload) || {};
  const parsedActions = parseMaybeJsonValue(payload.actions, payload.actions);
  const action = Array.isArray(parsedActions) && parsedActions.length ? parsedActions[0] : { fields: payload };
  const fields = parseMaybeJsonValue(action.fields, action.fields) || action;
  return pickWebhookValue(fields, ['creationTimestamp', 'creation timestamp', 'actionCreationTime', 'action_creation_time', 'createdTime', 'created_time'], null);
};

const getDisplayCallTime = (callLog) => parseCallTimeText(getRawCallCreationTime(callLog)) || callLog.actionCreationTime;

const formatCallLog = (callLog) => ({
  id: callLog._id,
  patientId: callLog.patient,
  patientName: callLog.patientName,
  phoneNumber: callLog.phoneNumber,
  callType: callLog.callType,
  durationSeconds: callLog.durationSeconds || 0,
  durationText: callLog.durationText || '',
  callAction: callLog.callAction || '',
  actionCreationTime: getDisplayCallTime(callLog),
  savedActionCreationTime: callLog.actionCreationTime,
  recordingUrl: callLog.recordingUrl || '',
  recordingFileUrl: callLog.recordingFileUrl || '',
  recordingFileName: callLog.recordingFileName || '',
  createdAt: callLog.createdAt,
  updatedAt: callLog.updatedAt,
});

// Always returns exactly 6 stage entries (1-6), filling in defaults for any that are
// missing — covers patients created before the stages field existed.
const normalizeStages = (existing = []) => {
  const byNumber = new Map(existing.map((s) => [s.number, s]));
  return STAGES.map((n) => {
    const found = byNumber.get(n);
    return {
      number: n,
      status: found?.status || STAGE_STATUSES.NOT_STARTED,
      date: found?.date ?? null,
      consultationDate: found?.consultationDate ?? null,
      notes: found?.notes || '',
      packageName: found?.packageName || '',
      patientHistoryBy: found?.patientHistoryBy || '',
      totalAmount: found?.totalAmount || 0,
      postCounselor: found?.postCounselor || null,
      medicineMonthsGiven: found?.medicineMonthsGiven || 0,
      medicineExplainDate: found?.medicineExplainDate ?? null,
      medicineSupplyNote: found?.medicineSupplyNote || '',
      medicineNextConnectDate: found?.medicineNextConnectDate ?? null,
      medicineNextConnectNote: found?.medicineNextConnectNote || '',
      medicineTakenDate: found?.medicineTakenDate ?? null,
      medicineFullyGiven: Boolean(found?.medicineFullyGiven),
      medicineConnectDone: Boolean(found?.medicineConnectDone),
      medicineConnectedAt: found?.medicineConnectedAt ?? null,
      medicineConnectedByName: found?.medicineConnectedByName || '',
      payments: found?.payments || [],
      recordFileUrl: found?.recordFileUrl || null,
      recordFileName: found?.recordFileName || '',
      recordFiles: withLegacyFile(found?.recordFiles || [], found?.recordFileUrl, found?.recordFileName),
      recordScanFiles: found?.recordScanFiles || [],
      recordPdfPageCount: found?.recordPdfPageCount || 0,
      recordPdfUpdatedAt: found?.recordPdfUpdatedAt || null,
      medicineRequest: { ...emptyMedicineRequest(), ...(found?.medicineRequest?.toObject?.() || found?.medicineRequest || {}) },
      medicineRequests: found?.medicineRequests || [],
      followUps: found?.followUps || [],
      familySessions: found?.familySessions || [],
    };
  });
};

const shouldShowFollowUps = (user) =>
  !user || ![ROLES.MEDICINE_DEPARTMENT, ROLES.DISPATCH_COURIER].includes(user.role);

const shouldShowFamilySessions = (user) =>
  !user || ![ROLES.MEDICINE_DEPARTMENT, ROLES.DISPATCH_COURIER].includes(user.role);

const cannotSeeScheduleType = (user, fieldKey) =>
  fieldKey === 'followUps' && user.role === ROLES.PSYCHOLOGIST;

const cannotUpdateScheduleType = (user, fieldKey) =>
  (fieldKey === 'followUps' && user.role === ROLES.PSYCHOLOGIST) ||
  (fieldKey === 'familySessions' && user.role === ROLES.ASSISTANT_DOCTOR);

const formatPatient = (p, user = null, { includeActivity = false } = {}) => ({
  id: p._id,
  patientCode: p.patientCode || `PT-${String(p._id).slice(-6).toUpperCase()}`,
  patientName: p.patientName,
  category: p.category,
  categoryLabel: CATEGORY_LABELS[p.category],
  age: p.age,
  number: p.number,
  guardianName: p.guardianName || null,
  alternateNumber: p.alternateNumber || null,
  relativeName: p.relativeName || null,
  currentStage: p.currentStage || 1,
  currentStageLabel: STAGE_LABELS[p.currentStage || 1],
  approvalStatus: p.approvalStatus || 'approved',
  approvedByName: p.approvedByName || '',
  approvedAt: p.approvedAt || null,
  canApprove: canReviewPatientApproval(user),
  isActive: p.isActive !== false,
  inactiveReason: p.inactiveReason || '',
  inactivatedByName: p.inactivatedByName || '',
  inactivatedAt: p.inactivatedAt || null,
  reactivatedByName: p.reactivatedByName || '',
  reactivatedAt: p.reactivatedAt || null,
  canToggleActive: canTogglePatientActive(user),
  assignedDoctor: formatAssignedUser(p.assignedDoctor),
  assignedPsychologist: formatAssignedUser(p.assignedPsychologist),
  hasDueMedicineConnect: normalizeStages(p.stages).some(isMedicineConnectDue),
  stages: normalizeStages(p.stages).map((s) => {
    const amountPaid = (s.payments || [])
      .filter(isApprovedPayment)
      .reduce((sum, pay) => sum + (pay.amount || 0), 0);
    return {
      number: s.number,
      status: s.status,
      statusLabel: STAGE_STATUS_LABELS[s.status],
      date: s.date,
      consultationDate: s.consultationDate,
      notes: s.notes,
      packageName: s.packageName,
      patientHistoryBy: s.patientHistoryBy || (s.number === 1 ? p.patientHistoryBy || '' : ''),
      totalAmount: s.totalAmount,
      postCounselor: formatAssignedUser(s.postCounselor),
      medicineMonthsGiven: s.medicineMonthsGiven || 0,
      medicineExplainDate: s.medicineExplainDate,
      medicineSupplyNote: s.medicineSupplyNote || '',
      medicineNextConnectDate: s.medicineNextConnectDate,
      medicineNextConnectNote: s.medicineNextConnectNote || '',
      medicineTakenDate: s.medicineTakenDate,
      medicineFullyGiven: Boolean(s.medicineFullyGiven),
      medicineConnectDone: Boolean(s.medicineConnectDone),
      medicineConnectedAt: s.medicineConnectedAt,
      medicineConnectedByName: s.medicineConnectedByName || '',
      amountPaid,
      remainingAmount: Math.max(s.totalAmount - amountPaid, 0),
      recordFileUrl: s.recordFileUrl || null,
      recordFileName: s.recordFileName || '',
      recordFiles: withLegacyFile(s.recordFiles || [], s.recordFileUrl, s.recordFileName),
      recordScanFiles: s.recordScanFiles || [],
      recordPdfPageCount: s.recordPdfPageCount || 0,
      recordPdfUpdatedAt: s.recordPdfUpdatedAt || null,
      medicineRequest: formatMedicineRequest(s.medicineRequest),
      medicineRequests: stageMedicineRequests(s)
        .map(formatMedicineRequest)
        .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0)),
      followUps: shouldShowFollowUps(user)
        ? (s.followUps || []).map(formatScheduleEntry).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
        : [],
      familySessions: shouldShowFamilySessions(user)
        ? (s.familySessions || []).map(formatScheduleEntry).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
        : [],
      payments: (s.payments || [])
        .map((pay) => ({
          id: pay._id,
          amount: pay.amount,
          date: pay.date,
          createdAt: pay.createdAt || pay.date,
          updatedAt: pay.updatedAt || pay.createdAt || pay.date,
          paymentMode: pay.paymentMode || PAYMENT_MODES.ONLINE,
          paymentModeLabel: PAYMENT_MODE_LABELS[pay.paymentMode || PAYMENT_MODES.ONLINE],
          payToBank: pay.payToBank || null,
          payToBankName: pay.payToBankName || '',
          utr: pay.utr || '',
          transactionId: pay.transactionId || '',
          receivedBy: pay.receivedBy || '',
          screenshotUrl: pay.screenshotUrl || null,
          screenshotFiles: withLegacyFile(pay.screenshotFiles || [], pay.screenshotUrl, 'Payment screenshot'),
          recordedByName: pay.recordedByName || '',
          editedByName: pay.editedByName || '',
          editedAt: pay.editedAt || null,
          approvalStatus: pay.approvalStatus || 'approved',
          approvedByName: pay.approvedByName || '',
          approvedAt: pay.approvedAt || null,
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    };
  }),
  ...(includeActivity
    ? {
        activityLog: (p.activityLog || [])
          .map(formatActivityEntry)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      }
    : {}),
  createdAt: p.createdAt,
});

// @desc    List patients received via webhook (search, filter by category, paginated)
// @route   GET /api/patients
// @access  Private/Admin, Doctor, Accountant, Post Counselor
const getPatients = asyncHandler(async (req, res) => {
  const { search = '', category, stage, receivedDate, status, page = 1, limit = 10 } = req.query;

  const filter = {};

  // Closed/inactive cases stay out of the main list by default; the dedicated
  // Inactive Patients page asks for them explicitly with ?status=inactive.
  filter.isActive = status === 'inactive' ? false : { $ne: false };

  if (category) {
    if (!ALL_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category filter' });
    }
    filter.category = category;
  }

  if (stage) {
    const stageNum = parseInt(stage, 10);
    if (!STAGES.includes(stageNum)) {
      return res.status(400).json({ success: false, message: 'Invalid phase filter' });
    }
    filter.currentStage = stageNum;
  }

  if (receivedDate) {
    const dateText = String(receivedDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      return res.status(400).json({ success: false, message: 'Invalid received date filter' });
    }
    const start = new Date(`${dateText}T00:00:00.000+05:30`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    filter.createdAt = { $gte: start, $lt: end };
  }

  if (search) {
    filter.$or = [
      { patientName: { $regex: search, $options: 'i' } },
      { patientCode: { $regex: search, $options: 'i' } },
      { number: { $regex: search, $options: 'i' } },
      { alternateNumber: { $regex: search, $options: 'i' } },
    ];
  }

  // Assistant Doctor and Psychologist only ever see patients assigned to them,
  // and only once accounts has approved the patient (see approvalStatus on the model).
  // Post Counselor has full All Patients access, same as Admin/Doctor/Manager.
  if (req.user.role === ROLES.ASSISTANT_DOCTOR) {
    filter.assignedDoctor = req.user._id;
    filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
  } else if (req.user.role === ROLES.PSYCHOLOGIST) {
    filter.assignedPsychologist = req.user._id;
    filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .populate('assignedDoctor', 'name')
      .populate('assignedPsychologist', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Patient.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: patients.length,
    total,
    page: pageNum,
    pages: Math.max(Math.ceil(total / limitNum), 1),
    patients: patients.map((patient) => formatPatient(patient, req.user)),
  });
});

const checkPatientCode = asyncHandler(async (req, res) => {
  const patientCode = String(req.query.code || '').trim().toUpperCase();
  if (!patientCode) {
    return res.status(400).json({ success: false, message: 'Patient ID is required' });
  }
  const exists = Boolean(await Patient.exists({ patientCode }));
  res.status(200).json({ success: true, exists });
});

// @desc    Admin dashboard patient/payment summary
// @route   GET /api/patients/dashboard-stats
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  const patients = await Patient.find({})
    .select('patientName patientCode currentStage stages assignedDoctor assignedPsychologist createdAt')
    .populate('assignedDoctor', 'name')
    .populate('assignedPsychologist', 'name')
    .populate('stages.postCounselor', 'name')
    .lean();
  const dateText = String(req.query.followUpDate || '').trim();
  const monthText = String(req.query.followUpMonth || '').trim();
  const selectedFollowUpDate = dateText ? new Date(`${dateText}T00:00:00`) : new Date();
  let followUpRangeStart;
  let followUpRangeEnd;
  let followUpRangeLabel;
  if (/^\d{4}-\d{2}$/.test(monthText)) {
    const [year, monthIndex] = monthText.split('-').map(Number);
    followUpRangeStart = new Date(year, monthIndex - 1, 1, 0, 0, 0, 0);
    followUpRangeEnd = new Date(year, monthIndex, 0, 23, 59, 59, 999);
    followUpRangeLabel = monthText;
  } else {
    followUpRangeStart = new Date(selectedFollowUpDate);
    followUpRangeStart.setHours(0, 0, 0, 0);
    followUpRangeEnd = new Date(selectedFollowUpDate);
    followUpRangeEnd.setHours(23, 59, 59, 999);
    followUpRangeLabel = `${followUpRangeStart.getFullYear()}-${String(followUpRangeStart.getMonth() + 1).padStart(2, '0')}-${String(followUpRangeStart.getDate()).padStart(2, '0')}`;
  }

  const stageCounts = STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    activePatients: 0,
  }));

  const workflowSummary = {
    medicineRequested: 0,
    medicineInProcess: 0,
    medicineMade: 0,
    sentToCourier: 0,
    courierPending: 0,
    courierDispatched: 0,
    courierDelivered: 0,
  };

  const followUpSummary = {
    date: followUpRangeLabel,
    range: monthText ? 'month' : 'date',
    total: 0,
    done: 0,
    pending: 0,
    normal: { total: 0, done: 0, pending: 0 },
    sfs: { total: 0, done: 0, pending: 0 },
    tracker: { total: 0, done: 0, pending: 0 },
  };

  const now = new Date();
  const lossRows = new Map();
  const paymentDueRows = [];
  const bankSummaryRows = new Map();
  const addLossPoint = (assignedUser, fallbackName, type, item) => {
    const key = assigneeKey(assignedUser, fallbackName);
    if (!lossRows.has(key)) {
      lossRows.set(key, {
        key,
        name: assigneeName(assignedUser, fallbackName),
        total: 0,
        followUps: 0,
        familySessions: 0,
        medicine: 0,
        latest: [],
      });
    }
    const row = lossRows.get(key);
    row.total += 1;
    row[type] += 1;
    row.latest.push(item);
  };

  const paymentSummary = patients.reduce(
    (acc, patient) => {
      const currentStage = patient.currentStage || 1;
      const stageRow = stageCounts.find((row) => row.stage === currentStage);
      if (stageRow) stageRow.activePatients += 1;

      normalizeStages(patient.stages).forEach((stage) => {
        const totalAmount = Number(stage.totalAmount || 0);
        const amountPaid = (stage.payments || [])
          .filter(isApprovedPayment)
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        (stage.payments || [])
          .filter(isApprovedPayment)
          .filter((payment) => payment.paymentMode === PAYMENT_MODES.ONLINE)
          .forEach((payment) => {
            const paidDate = payment.date ? new Date(payment.date) : null;
            if (!paidDate || paidDate < followUpRangeStart || paidDate > followUpRangeEnd) return;
            const key = payment.payToBank ? String(payment.payToBank) : 'unassigned';
            const row = bankSummaryRows.get(key) || {
              bankId: key,
              bankName: payment.payToBankName || 'Unassigned Bank',
              amount: 0,
              count: 0,
            };
            row.amount += Number(payment.amount || 0);
            row.count += 1;
            bankSummaryRows.set(key, row);
          });
        acc.totalAmount += totalAmount;
        acc.amountPaid += amountPaid;
        const dueAmount = Math.max(totalAmount - amountPaid, 0);
        if (totalAmount > 0 && dueAmount > 0) {
          const pendingAmount = (stage.payments || [])
            .filter((payment) => !isApprovedPayment(payment))
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          paymentDueRows.push({
            patientId: patient._id,
            patientName: patient.patientName,
            patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
            phase: stage.number,
            phaseLabel: STAGE_LABELS[stage.number],
            packageName: stage.packageName || '',
            totalAmount,
            paidAmount: amountPaid,
            dueAmount,
            pendingApprovalAmount: pendingAmount,
            assignedDoctor: patient.assignedDoctor?.name || '',
            postCounselor: stage.postCounselor?.name || '',
          });
        }
        stageMedicineRequests(stage).map(formatMedicineRequest).forEach((request) => {
          if (request.status === MEDICINE_STATUSES.REQUESTED) workflowSummary.medicineRequested += 1;
          if (request.status === MEDICINE_STATUSES.IN_PROCESS) workflowSummary.medicineInProcess += 1;
          if ([MEDICINE_STATUSES.MADE, MEDICINE_STATUSES.SENT_TO_COURIER].includes(request.status)) workflowSummary.medicineMade += 1;
          if (request.status === MEDICINE_STATUSES.SENT_TO_COURIER) workflowSummary.sentToCourier += 1;
          if (request.status === MEDICINE_STATUSES.SENT_TO_COURIER && request.courier.status === COURIER_STATUSES.PENDING) workflowSummary.courierPending += 1;
          if (request.courier.status === COURIER_STATUSES.DISPATCHED) workflowSummary.courierDispatched += 1;
          if (request.courier.status === COURIER_STATUSES.DELIVERED) workflowSummary.courierDelivered += 1;
        });

        (stage.followUps || []).forEach((entry) => {
          const entryDate = entry.dateTime ? new Date(entry.dateTime) : null;
          if (entryDate && entryDate < now && entry.status === 'scheduled') {
            addLossPoint(patient.assignedDoctor, 'Unassigned Assistant Doctor', 'followUps', {
              type: 'Follow-up late',
              patientName: patient.patientName,
              patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
              stage: stage.number,
              at: entry.dateTime,
            });
          }
          if (!entryDate || entryDate < followUpRangeStart || entryDate > followUpRangeEnd) return;
          const type = entry.followUpType === 'sfs' ? 'sfs' : entry.followUpType === 'tracker' ? 'tracker' : 'normal';
          const isDone = ['completed', 'sent', 'done', 'done_late'].includes(entry.status);
          const isCancelled = entry.status === 'cancelled';
          if (isCancelled) return;

          followUpSummary.total += 1;
          followUpSummary[type].total += 1;
          if (isDone) {
            followUpSummary.done += 1;
            followUpSummary[type].done += 1;
          } else {
            followUpSummary.pending += 1;
            followUpSummary[type].pending += 1;
          }
        });

        (stage.familySessions || []).forEach((entry) => {
          const entryDate = entry.dateTime ? new Date(entry.dateTime) : null;
          if (entryDate && entryDate < now && entry.status === 'scheduled') {
            addLossPoint(patient.assignedPsychologist, 'Unassigned Psychologist', 'familySessions', {
              type: 'Family session late',
              patientName: patient.patientName,
              patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
              stage: stage.number,
              at: entry.dateTime,
            });
          }
        });

        if (isMedicineConnectDue(stage)) {
          addLossPoint(stage.postCounselor || patient.assignedDoctor, 'Unassigned Medicine Follow-up', 'medicine', {
            type: 'Medicine connect due',
            patientName: patient.patientName,
            patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
            stage: stage.number,
            at: stage.medicineNextConnectDate,
          });
        }
      });
      return acc;
    },
    { totalAmount: 0, amountPaid: 0 }
  );

  paymentSummary.dueAmount = Math.max(paymentSummary.totalAmount - paymentSummary.amountPaid, 0);
  const paymentDueLedger = {
    count: paymentDueRows.length,
    totalDue: paymentDueRows.reduce((sum, row) => sum + row.dueAmount, 0),
    totalPendingApproval: paymentDueRows.reduce((sum, row) => sum + row.pendingApprovalAmount, 0),
    rows: paymentDueRows
      .sort((a, b) => b.dueAmount - a.dueAmount || a.patientName.localeCompare(b.patientName))
      .slice(0, 20),
  };
  const lossPoints = {
    total: Array.from(lossRows.values()).reduce((sum, row) => sum + row.total, 0),
    rows: Array.from(lossRows.values())
      .map((row) => ({
        ...row,
        latest: row.latest
          .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
          .slice(0, 3),
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
  };

  const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short' });
  const monthlyOnboarding = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: monthFormatter.format(date),
      patients: 0,
    };
  });

  const monthRowsByKey = monthlyOnboarding.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {});

  patients.forEach((patient) => {
    if (!patient.createdAt) return;
    const createdAt = new Date(patient.createdAt);
    const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
    if (monthRowsByKey[key]) monthRowsByKey[key].patients += 1;
  });

  res.status(200).json({
    success: true,
    totalPatients: patients.length,
    stageCounts,
    paymentSummary,
    paymentDueLedger,
    bankPaymentSummary: {
      range: followUpSummary.range,
      date: followUpSummary.date,
      rows: Array.from(bankSummaryRows.values()).sort((a, b) => b.amount - a.amount || a.bankName.localeCompare(b.bankName)),
    },
    workflowSummary,
    followUpSummary,
    lossPoints,
    monthlyOnboarding,
  });
});

const getStaffDashboardStats = asyncHandler(async (req, res) => {
  const allowedRoles = [ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'This dashboard is not available for your role' });
  }

  // Closed patients never generate reminders/workload for anyone.
  const filter = { isActive: { $ne: false } };
  if (req.user.role === ROLES.ASSISTANT_DOCTOR) {
    filter.assignedDoctor = req.user._id;
    filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
  }
  if (req.user.role === ROLES.PSYCHOLOGIST) {
    filter.assignedPsychologist = req.user._id;
    filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
  }

  // Trimmed to the schedule/medicine-connect fields collectScheduleReminders actually reads —
  // the full "stages" tree also carries payments, medicine/courier data and record files.
  const patients = await Patient.find(filter)
    .select(
      'patientName patientCode category currentStage stages.number stages.followUps stages.familySessions '
      + 'stages.medicineNextConnectDate stages.medicineConnectDone stages.medicineNextConnectNote stages.postCounselor '
      + 'assignedDoctor assignedPsychologist activityLog updatedAt'
    )
    .populate('assignedDoctor', 'name')
    .populate('assignedPsychologist', 'name')
    .populate('stages.postCounselor', 'name')
    .sort({ updatedAt: -1 })
    .lean();

  const reminders = collectScheduleReminders(patients, req.user, { includeUpcoming24: true });
  const lateReminders = reminders.filter((item) => item.reminderKind === 'late');
  const next24Reminders = reminders.filter((item) => item.reminderKind === 'next_24_hours');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const summary = {
    assignedPatients: patients.length,
    reminders: reminders.length,
    lateReminders: lateReminders.length,
    next24Reminders: next24Reminders.length,
    todayFollowUps: 0,
    todayFamilySessions: 0,
    todayCompleted: 0,
    recentActions: 0,
  };

  const assigneeRows = new Map();
  const ensureAssignee = (name, role) => {
    const key = `${role}:${name || 'Unassigned'}`;
    if (!assigneeRows.has(key)) {
      assigneeRows.set(key, {
        name: name || 'Unassigned',
        role,
        late: 0,
        next24: 0,
        total: 0,
      });
    }
    return assigneeRows.get(key);
  };

  reminders.forEach((item) => {
    const row = ensureAssignee(item.assignee, item.type === 'followup' ? 'Assistant Doctor' : 'Psychologist');
    row.total += 1;
    if (item.reminderKind === 'late') row.late += 1;
    if (item.reminderKind === 'next_24_hours') row.next24 += 1;
  });

  const recentActions = [];
  patients.forEach((patient) => {
    normalizeStages(patient.stages).forEach((stage) => {
      (stage.followUps || []).forEach((entry) => {
        const date = entry.dateTime ? new Date(entry.dateTime) : null;
        if (date && date >= today && date <= todayEnd && entry.status !== 'cancelled') summary.todayFollowUps += 1;
        if (entry.completedAt && new Date(entry.completedAt) >= today && new Date(entry.completedAt) <= todayEnd) summary.todayCompleted += 1;
      });
      (stage.familySessions || []).forEach((entry) => {
        const date = entry.dateTime ? new Date(entry.dateTime) : null;
        if (date && date >= today && date <= todayEnd && entry.status !== 'cancelled') summary.todayFamilySessions += 1;
        if (entry.completedAt && new Date(entry.completedAt) >= today && new Date(entry.completedAt) <= todayEnd) summary.todayCompleted += 1;
      });
    });

    (patient.activityLog || []).slice(-8).forEach((activity) => {
      if (
        req.user.role === ROLES.MANAGER
        && [ROLES.ADMIN, ROLES.DOCTOR].includes(activity.actorRole)
      ) {
        return;
      }
      recentActions.push({
        action: activity.action,
        details: activity.details,
        by: activity.actorName || 'System',
        role: activity.actorRole || '',
        patientId: patient._id,
        patientName: patient.patientName,
        patientCode: patient.patientCode || '',
        at: activity.createdAt,
      });
    });
  });

  recentActions.sort((a, b) => new Date(b.at) - new Date(a.at));
  summary.recentActions = recentActions.length;

  res.status(200).json({
    success: true,
    summary,
    assigneeRows: Array.from(assigneeRows.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    reminders: reminders.slice(0, 30),
    recentActions: recentActions.slice(0, 20).map((item) => ({
      ...item,
      at: item.at,
    })),
  });
});

// @desc    Admin payment ledger across all patients/stages
// @route   GET /api/patients/payments-ledger
// @access  Private/Admin
const getPaymentsLedger = asyncHandler(async (req, res) => {
  const { filter = 'all', date, month, dateType = 'paid', page = 1, limit = 10, bankId, from: fromParam, to: toParam } = req.query;
  const now = new Date();
  let from = null;
  let to = null;

  if (fromParam || toParam) {
    if (fromParam) {
      const selected = new Date(`${fromParam}T00:00:00`);
      from = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
    }
    if (toParam) {
      const selected = new Date(`${toParam}T00:00:00`);
      to = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 1);
    }
  } else if (filter === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (filter === 'date' && date) {
    const selected = new Date(`${date}T00:00:00`);
    from = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
    to = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 1);
  } else if (filter === 'month' && month) {
    const [year, monthIndex] = String(month).split('-').map(Number);
    if (year && monthIndex) {
      from = new Date(year, monthIndex - 1, 1);
      to = new Date(year, monthIndex, 1);
    }
  }

  // Project only what a payment row needs — the full "stages" tree also carries
  // follow-ups, family sessions, medicine/courier data and record files per stage,
  // which made this scan very slow as the patient collection grew.
  const patients = await Patient.find({})
    .select('patientName number category stages.number stages.payments')
    .lean();
  const payments = [];

  patients.forEach((patient) => {
    (patient.stages || []).forEach((stage) => {
      (stage.payments || []).forEach((payment) => {
        if (!isApprovedPayment(payment)) return;
        const paidAt = payment.date ? new Date(payment.date) : null;
        const addedAt = payment.createdAt ? new Date(payment.createdAt) : null;
        const updatedAt = payment.updatedAt ? new Date(payment.updatedAt) : addedAt;
        const compareDate = dateType === 'added' ? addedAt : paidAt;
        if (from && (!compareDate || compareDate < from)) return;
        if (to && (!compareDate || compareDate >= to)) return;

        payments.push({
          id: payment._id,
          patientId: patient._id,
          patientName: patient.patientName,
          patientNumber: patient.number,
          category: patient.category,
          categoryLabel: CATEGORY_LABELS[patient.category],
          stage: stage.number,
          amount: Number(payment.amount || 0),
          paidAt,
          addedAt,
          updatedAt,
          paymentMode: payment.paymentMode,
          paymentModeLabel: PAYMENT_MODE_LABELS[payment.paymentMode] || payment.paymentMode,
          payToBank: payment.payToBank || null,
          payToBankName: payment.payToBankName || '',
          utr: payment.utr || '',
          transactionId: payment.transactionId || '',
          receivedBy: payment.receivedBy || '',
          recordedByName: payment.recordedByName || '',
          editedByName: payment.editedByName || '',
          editedAt: payment.editedAt || null,
          approvedByName: payment.approvedByName || '',
          approvedAt: payment.approvedAt || null,
          screenshotUrl: payment.screenshotUrl || null,
          screenshotFiles: withLegacyFile(payment.screenshotFiles || [], payment.screenshotUrl, 'Payment screenshot'),
        });
      });
    });
  });

  payments.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));

  // Built from the full (date-filtered, not bank-filtered) set so the bank overview
  // list always sees every bank's totals for the selected range, regardless of bankId.
  const bankSummaryMap = new Map();
  payments
    .filter((payment) => payment.paymentMode === PAYMENT_MODES.ONLINE)
    .forEach((payment) => {
      const key = payment.payToBank ? String(payment.payToBank) : 'unassigned';
      const current = bankSummaryMap.get(key) || {
        bankId: key,
        bankName: payment.payToBankName || 'Unassigned Bank',
        amount: 0,
        count: 0,
      };
      current.amount += Number(payment.amount || 0);
      current.count += 1;
      bankSummaryMap.set(key, current);
    });

  const scopedPayments = bankId
    ? payments.filter((payment) => (payment.payToBank ? String(payment.payToBank) : 'unassigned') === bankId)
    : payments;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 2000);
  const total = scopedPayments.length;
  const totalAmount = scopedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const paginatedPayments = scopedPayments.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.status(200).json({
    success: true,
    count: paginatedPayments.length,
    total,
    page: pageNum,
    pages: Math.max(Math.ceil(total / limitNum), 1),
    totalAmount,
    bankSummary: Array.from(bankSummaryMap.values()).sort((a, b) => b.amount - a.amount || a.bankName.localeCompare(b.bankName)),
    payments: paginatedPayments,
  });
});

// @desc    Get a single patient by id
// @route   GET /api/patients/:id
// @access  Private/Admin, Doctor, Accountant, Post Counselor
const getPatientById = asyncHandler(async (req, res) => {
  // .lean() skips building a full Mongoose document (with getters/subdocument wrappers
  // for every payment/follow-up/activity entry) — this is the single heaviest read on
  // the details page, so it's the one place that benefits most from it.
  const patient = await Patient.findById(req.params.id)
    .populate('assignedDoctor', 'name')
    .populate('assignedPsychologist', 'name')
    .populate('stages.postCounselor', 'name')
    .lean();

  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    List calling webhook data for one patient
// @route   GET /api/patients/:id/calls
// @access  Private, scoped like patient details
const getPatientCallLogs = asyncHandler(async (req, res) => {
  // Only the access-check fields are needed here — not the patient's whole record.
  const patient = await Patient.findById(req.params.id)
    .select('assignedDoctor assignedPsychologist approvalStatus')
    .lean();
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'You can only view calls for assigned patients' });
  }

  const callLogs = await CallLog.find({ patient: patient._id })
    .sort({ actionCreationTime: -1, createdAt: -1 })
    .limit(100)
    .lean();
  res.status(200).json({ success: true, callLogs: callLogs.map(formatCallLog) });
});

// @desc    Manually create a patient when it was not received from the CRM webhook
// @route   POST /api/patients
// @access  Private/Admin, Manager, Post Counselor
const createPatient = asyncHandler(async (req, res) => {
  const {
    patientCode,
    patientName,
    category,
    age,
    number,
    guardianName,
    alternateNumber,
    patientHistoryBy,
    relativeName,
    currentStage,
    consultationDate,
    postCounselor,
  } = req.body;
  const ageText = String(age ?? '').trim();

  if (!patientCode || !patientName || !category || !ageText || !number) {
    return res.status(400).json({ success: false, message: "Patient ID, patient name, category, age and father's number are required" });
  }

  const normalizedPatientCode = String(patientCode).trim().toUpperCase();
  const existingCode = await Patient.findOne({ patientCode: normalizedPatientCode });
  if (existingCode) {
    return res.status(400).json({ success: false, message: 'Patient ID already exists' });
  }

  if (!ALL_CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Invalid patient category' });
  }

  if (category === 'autism_adhd' && !guardianName) {
    return res.status(400).json({ success: false, message: 'Father/Mother name is required for Autism/ADHD patients' });
  }

  if (category === 'mental_health' && !relativeName) {
    return res.status(400).json({ success: false, message: 'Relative name is required for Mental Health patients' });
  }

  const stageNum = Number(currentStage || 1);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: `Phase must be one of: ${STAGES.join(', ')}` });
  }

  let selectedPostCounselor = null;
  if (postCounselor) {
    selectedPostCounselor = await User.findOne({ _id: postCounselor, role: ROLES.POST_COUNSELOR, isActive: true });
    if (!selectedPostCounselor) {
      return res.status(400).json({ success: false, message: 'Select a valid, active Post Counselor' });
    }
  }

  const stages = normalizeStages();
  const stageEntry = stages.find((stage) => stage.number === stageNum);
  stageEntry.patientHistoryBy = String(patientHistoryBy || '').trim();
  if (consultationDate) {
    const parsedConsultationDate = new Date(`${consultationDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(consultationDate) || Number.isNaN(parsedConsultationDate.getTime()) || parsedConsultationDate.toISOString().slice(0, 10) !== consultationDate) {
      return res.status(400).json({ success: false, message: 'Invalid consultation date' });
    }
    stageEntry.consultationDate = consultationDate;
  }
  if (stageEntry && selectedPostCounselor) {
    stageEntry.postCounselor = selectedPostCounselor._id;
  }

  const patient = await Patient.create({
    patientCode: normalizedPatientCode,
    patientName,
    category,
    age: ageText,
    number,
    guardianName: category === 'autism_adhd' ? guardianName : '',
    alternateNumber: category === 'autism_adhd' ? alternateNumber : '',
    relativeName: category === 'mental_health' ? relativeName : '',
    currentStage: stageNum,
    source: 'manual',
    approvalStatus: 'pending',
    stages,
    activityLog: [
      {
        action: 'Patient manually added',
        details: `Created in All Patients by ${req.user?.name || 'Unknown'} — pending accounts approval`,
        actorName: req.user?.name || 'System',
        actorRole: req.user?.role || '',
      },
      ...(consultationDate ? [{
        action: `Phase ${stageNum} consultation date set`,
        details: consultationDate,
        actorName: req.user?.name || 'System',
        actorRole: req.user?.role || '',
      }] : []),
    ],
  });

  await populateAssignments(patient);
  res.status(201).json({ success: true, patient: formatPatient(patient, req.user) });
});

// @desc    List patients awaiting accounts approval — newly added patients whose payments/
//          screenshots haven't been verified yet. Hidden from Assistant Doctor/Psychologist
//          until approved from here (or from the patient's own details page).
// @route   GET /api/patients/pending-approvals
// @access  Private/Admin, Doctor, Accountant
// Every payment on this patient that still needs Admin/Doctor/Accountant sign-off,
// with the stage it belongs to — this is the "which phase's payment" detail Accounts needs.
const pendingPaymentsOf = (patient) => {
  const rows = [];
  (patient.stages || []).forEach((stage) => {
    (stage.payments || []).forEach((payment) => {
      if ((payment.approvalStatus || 'approved') === 'approved') return;
      rows.push({
        paymentId: payment._id,
        stage: stage.number,
        stageLabel: STAGE_LABELS[stage.number],
        amount: payment.amount,
        date: payment.date,
        paymentMode: payment.paymentMode,
        paymentModeLabel: PAYMENT_MODE_LABELS[payment.paymentMode] || payment.paymentMode,
        payToBankName: payment.payToBankName || '',
        utr: payment.utr || '',
        transactionId: payment.transactionId || '',
        receivedBy: payment.receivedBy || '',
        recordedByName: payment.recordedByName || '',
        screenshotCount: (payment.screenshotFiles || []).length,
        screenshotFiles: withLegacyFile(payment.screenshotFiles || [], payment.screenshotUrl, 'Payment screenshot'),
      });
    });
  });
  return rows;
};

const getPendingApprovals = asyncHandler(async (req, res) => {
  if (!canReviewPatientApproval(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Admin, Doctor or Accountant can review patient approvals' });
  }

  // A patient shows up here either because the patient itself is brand-new and unapproved,
  // or because it's already live but a later payment (on any stage) is awaiting sign-off.
  // Both fields are indexed (see Patient.js) so this $or stays a fast index lookup instead
  // of a full collection scan, and .lean() skips building a full Mongoose document for
  // every payment/follow-up/activity entry on each match.
  const patients = await Patient.find({
    $or: [{ approvalStatus: 'pending' }, { 'stages.payments.approvalStatus': 'pending' }],
  })
    .populate('assignedDoctor', 'name')
    .populate('assignedPsychologist', 'name')
    .populate('stages.postCounselor', 'name')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: patients.length,
    patients: patients.map((patient) => ({
      ...formatPatient(patient, req.user),
      pendingPayments: pendingPaymentsOf(patient),
    })),
  });
});

// @desc    Approve a pending patient — clears the accounts gate so it behaves like every
//          other patient (visible to its assigned Assistant Doctor/Psychologist, counted
//          in dashboards, etc.)
// @route   PATCH /api/patients/:id/approve
// @access  Private/Admin, Doctor, Accountant
const approvePatient = asyncHandler(async (req, res) => {
  if (!canReviewPatientApproval(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Admin, Doctor or Accountant can approve a patient' });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (patient.approvalStatus === 'approved') {
    return res.status(400).json({ success: false, message: 'This patient is already approved' });
  }

  patient.approvalStatus = 'approved';
  patient.approvedByName = req.user.name;
  patient.approvedAt = new Date();
  addActivity(patient, req.user, 'Patient approved', 'Cleared accounts approval — now visible to assigned staff');
  await patient.save();

  await populateAssignments(patient);
  await patient.populate('stages.postCounselor', 'name');
  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Close ("inactive") or reopen ("active") a patient — a closed patient drops off
//          the main patient list, stops generating follow-up/family-session/medicine-
//          connect reminders, and can be reactivated any time. Nothing is deleted.
// @route   PATCH /api/patients/:id/status
// @access  Private/Admin, Doctor, Post Counselor
const updatePatientStatus = asyncHandler(async (req, res) => {
  if (!canTogglePatientActive(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Admin, Doctor or Post Counselor can close/reopen a patient' });
  }

  const isActive = req.body.isActive !== false;
  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if ((patient.isActive !== false) === isActive) {
    return res.status(400).json({
      success: false,
      message: isActive ? 'This patient is already active' : 'This patient is already inactive',
    });
  }

  patient.isActive = isActive;
  if (isActive) {
    patient.reactivatedByName = req.user.name;
    patient.reactivatedAt = new Date();
    addActivity(patient, req.user, 'Patient reactivated', 'Back on the active patient list');
  } else {
    const reason = String(req.body.reason || '').trim();
    patient.inactiveReason = reason;
    patient.inactivatedByName = req.user.name;
    patient.inactivatedAt = new Date();
    addActivity(patient, req.user, 'Patient marked inactive', reason || 'No reason given');
  }
  await patient.save();

  await populateAssignments(patient);
  await patient.populate('stages.postCounselor', 'name');
  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Update one or more fields on a patient (used by inline editing on the details page)
// @route   PATCH /api/patients/:id
// @access  Private/Admin, Manager, Post Counselor, Psychologist, Assistant Doctor (scoped)
const updatePatient = asyncHandler(async (req, res) => {
  const {
    patientCode,
    patientName,
    category,
    age,
    number,
    guardianName,
    alternateNumber,
    patientHistoryBy,
    relativeName,
    currentStage,
    assignedDoctor,
    assignedPsychologist,
  } = req.body;

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  const identityFields = ['patientCode', 'patientName', 'category'];
  const hasNonIdentityUpdate = Object.keys(req.body || {}).some((key) => !identityFields.includes(key));
  if (req.user.role === ROLES.PSYCHOLOGIST && hasNonIdentityUpdate) {
    return res.status(403).json({ success: false, message: 'Psychologist cannot edit patient details' });
  }

  const updateField = (fieldKey, nextValue, label) => {
    if (nextValue === undefined || sameValue(patient[fieldKey], nextValue)) return;
    const previousValue = patient[fieldKey] || 'Blank';
    patient[fieldKey] = nextValue;
    addActivity(patient, req.user, `${label} updated`, `From "${previousValue}" to "${nextValue || 'Blank'}"`);
  };

  if (patientCode !== undefined) {
    if (!canEditPatientIdentity(req.user)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit Patient ID' });
    }
    const normalizedPatientCode = String(patientCode || '').trim().toUpperCase();
    if (!normalizedPatientCode) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }
    if (!sameValue(patient.patientCode, normalizedPatientCode)) {
      const existingCode = await Patient.findOne({ patientCode: normalizedPatientCode, _id: { $ne: patient._id } });
      if (existingCode) {
        return res.status(400).json({ success: false, message: 'Patient ID already exists' });
      }
      updateField('patientCode', normalizedPatientCode, 'Patient ID');
    }
  }

  if (patientName !== undefined && !canEditPatientIdentity(req.user)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to edit Patient name' });
  }
  updateField('patientName', patientName, 'Patient name');

  if (category !== undefined) {
    if (!canEditPatientIdentity(req.user)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit patient category' });
    }
    if (!ALL_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid patient category' });
    }
    updateField('category', category, 'Patient category');
  }

  updateField('age', age, 'Age');
  updateField('number', number, "Father's number");
  updateField('guardianName', guardianName, 'Father/Mother name');
  updateField('alternateNumber', alternateNumber, "Mother's number");
  if (patientHistoryBy !== undefined) {
    if (!patient.stages || patient.stages.length !== STAGES.length) {
      patient.stages = normalizeStages(patient.stages);
    }
    const firstPhase = patient.stages.find((stage) => stage.number === 1);
    const nextName = String(patientHistoryBy || '').trim();
    const previousName = firstPhase.patientHistoryBy || patient.patientHistoryBy || '';
    if (!sameValue(previousName, nextName)) {
      addActivity(patient, req.user, 'Phase 1 patient history by updated', `From "${previousName || 'Blank'}" to "${nextName || 'Blank'}"`);
    }
    firstPhase.patientHistoryBy = nextName;
    patient.patientHistoryBy = '';
  }
  updateField('relativeName', relativeName, 'Relative name');

  if (currentStage !== undefined) {
    const stageNum = Number(currentStage);
    if (!STAGES.includes(stageNum)) {
      return res.status(400).json({ success: false, message: `Phase must be one of: ${STAGES.join(', ')}` });
    }
    if (!sameValue(patient.currentStage, stageNum)) {
      addActivity(patient, req.user, 'Current phase updated', `From ${STAGE_LABELS[patient.currentStage] || patient.currentStage} to ${STAGE_LABELS[stageNum]}`);
    }
    patient.currentStage = stageNum;
  }

  if (assignedDoctor !== undefined) {
    if (!ASSIGN_DOCTOR_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to assign patients' });
    }
    if (!assignedDoctor) {
      if (patient.assignedDoctor) {
        addActivity(patient, req.user, 'Assistant Doctor unassigned');
      }
      patient.assignedDoctor = null;
    } else {
      const doctor = await User.findOne({ _id: assignedDoctor, role: ROLES.ASSISTANT_DOCTOR, isActive: true });
      if (!doctor) {
        return res.status(400).json({ success: false, message: 'Select a valid, active Assistant Doctor' });
      }
      if (!sameValue(patient.assignedDoctor, doctor._id)) {
        addActivity(patient, req.user, 'Assistant Doctor assigned', doctor.name);
      }
      patient.assignedDoctor = doctor._id;
    }
  }

  if (assignedPsychologist !== undefined) {
    if (!ASSIGN_DOCTOR_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to assign patients' });
    }
    if (!assignedPsychologist) {
      if (patient.assignedPsychologist) {
        addActivity(patient, req.user, 'Psychologist unassigned');
      }
      patient.assignedPsychologist = null;
    } else {
      const psychologist = await User.findOne({ _id: assignedPsychologist, role: ROLES.PSYCHOLOGIST, isActive: true });
      if (!psychologist) {
        return res.status(400).json({ success: false, message: 'Select a valid, active Psychologist' });
      }
      if (!sameValue(patient.assignedPsychologist, psychologist._id)) {
        addActivity(patient, req.user, 'Psychologist assigned', psychologist.name);
      }
      patient.assignedPsychologist = psychologist._id;
    }
  }

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Update one stage's status/date/notes (used by the stage detail modal)
// @route   PATCH /api/patients/:id/stages/:number
// @access  Private/Admin, Manager, Post Counselor, Psychologist, Assistant Doctor (scoped)
const updatePatientStage = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const {
    status,
    date,
    notes,
    packageName,
    consultationDate,
    patientHistoryBy,
    totalAmount,
    postCounselor,
    medicineMonthsGiven,
    medicineExplainDate,
    medicineSupplyNote,
    medicineNextConnectDate,
    medicineNextConnectNote,
    medicineTakenDate,
    medicineFullyGiven,
    medicineConnectDone,
  } = req.body;
  if (status !== undefined && !ALL_STAGE_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Status must be one of: ${ALL_STAGE_STATUSES.join(', ')}` });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  if (!canEditPackageStage(req.user)) {
    const medicineFields = new Set([
      'patientHistoryBy', 'consultationDate',
      'medicineMonthsGiven', 'medicineExplainDate', 'medicineSupplyNote',
      'medicineNextConnectDate', 'medicineNextConnectNote', 'medicineTakenDate',
      'medicineFullyGiven', 'medicineConnectDone',
    ]);
    const allowedFields = req.user.role === ROLES.MANAGER
      ? new Set(['patientHistoryBy', 'consultationDate'])
      : req.user.role === ROLES.ASSISTANT_DOCTOR ? medicineFields : null;
    if (!allowedFields || !Object.keys(req.body).length ||
        Object.keys(req.body).some((key) => !allowedFields.has(key))) {
      return res.status(403).json({ success: false, message: 'You can only edit patient history by and medicine supply details for this phase' });
    }
  }

  // Backfill the full 6-entry array if this patient predates the stages field
  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  if (consultationDate !== undefined) {
    const nextDate = consultationDate || '';
    if (nextDate) {
      const parsedConsultationDate = new Date(`${nextDate}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || Number.isNaN(parsedConsultationDate.getTime()) || parsedConsultationDate.toISOString().slice(0, 10) !== nextDate) {
        return res.status(400).json({ success: false, message: 'Invalid consultation date' });
      }
    }
    const previousDate = stageEntry.consultationDate ? stageEntry.consultationDate.toISOString().slice(0, 10) : '';
    if (previousDate !== nextDate) {
      addActivity(patient, req.user, `Phase ${stageNum} consultation date updated`, `From ${previousDate || 'Blank'} to ${nextDate || 'Blank'}`);
      stageEntry.consultationDate = nextDate || null;
    }
  }
  if (patientHistoryBy !== undefined) {
    const nextName = String(patientHistoryBy || '').trim();
    const previousName = stageEntry.patientHistoryBy || (stageNum === 1 ? patient.patientHistoryBy || '' : '');
    if (!sameValue(previousName, nextName)) {
      addActivity(patient, req.user, `Phase ${stageNum} patient history by updated`, `From "${previousName || 'Blank'}" to "${nextName || 'Blank'}"`);
    }
    stageEntry.patientHistoryBy = nextName;
    if (stageNum === 1) patient.patientHistoryBy = '';
  }
  if (status !== undefined && !sameValue(stageEntry.status, status)) {
    addActivity(patient, req.user, `Phase ${stageNum} status updated`, `From ${STAGE_STATUS_LABELS[stageEntry.status]} to ${STAGE_STATUS_LABELS[status]}`);
    stageEntry.status = status;
  }
  if (date !== undefined && !sameValue(stageEntry.date ? stageEntry.date.toISOString().slice(0, 10) : '', date || '')) {
    addActivity(patient, req.user, `Phase ${stageNum} date updated`, date || 'Cleared');
    stageEntry.date = date || null;
  }
  if (notes !== undefined && !sameValue(stageEntry.notes, notes)) {
    addActivity(patient, req.user, `Phase ${stageNum} notes updated`, notes || 'Cleared');
    stageEntry.notes = notes;
  }
  if (packageName !== undefined && !sameValue(stageEntry.packageName, packageName)) {
    addActivity(patient, req.user, `Phase ${stageNum} package updated`, packageName || 'Cleared');
    stageEntry.packageName = packageName;
  }
  if (totalAmount !== undefined) {
    const nextTotalAmount = Math.max(Number(totalAmount) || 0, 0);
    if (!sameValue(stageEntry.totalAmount, nextTotalAmount)) {
      addActivity(patient, req.user, `Phase ${stageNum} total amount updated`, `From ${stageEntry.totalAmount || 0} to ${nextTotalAmount}`);
    }
    stageEntry.totalAmount = nextTotalAmount;
  }
  if (postCounselor !== undefined) {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, message: 'Only Admin can update phase post counselor' });
    }
    if (!postCounselor) {
      if (stageEntry.postCounselor) {
        addActivity(patient, req.user, `Phase ${stageNum} post counselor cleared`);
      }
      stageEntry.postCounselor = null;
    } else {
      const counselor = await User.findOne({ _id: postCounselor, role: ROLES.POST_COUNSELOR, isActive: true });
      if (!counselor) {
        return res.status(400).json({ success: false, message: 'Select a valid, active Post Counselor' });
      }
      if (!sameValue(stageEntry.postCounselor, counselor._id)) {
        addActivity(patient, req.user, `Phase ${stageNum} post counselor updated`, counselor.name);
      }
      stageEntry.postCounselor = counselor._id;
    }
  }
  if (medicineMonthsGiven !== undefined) {
    const nextMonths = Math.max(Number(medicineMonthsGiven) || 0, 0);
    if (!sameValue(stageEntry.medicineMonthsGiven, nextMonths)) {
      addActivity(patient, req.user, `Phase ${stageNum} medicine months updated`, `From ${stageEntry.medicineMonthsGiven || 0} to ${nextMonths}`);
    }
    stageEntry.medicineMonthsGiven = nextMonths;
  }
  if (medicineExplainDate !== undefined) {
    const previousDate = stageEntry.medicineExplainDate ? stageEntry.medicineExplainDate.toISOString().slice(0, 10) : '';
    const nextDate = medicineExplainDate || '';
    if (!sameValue(previousDate, nextDate)) {
      addActivity(patient, req.user, `Phase ${stageNum} medicine explain date updated`, nextDate || 'Cleared');
    }
    stageEntry.medicineExplainDate = medicineExplainDate || null;
  }
  if (medicineSupplyNote !== undefined && !sameValue(stageEntry.medicineSupplyNote, medicineSupplyNote)) {
    addActivity(patient, req.user, `Phase ${stageNum} medicine supply note updated`, medicineSupplyNote || 'Cleared');
    stageEntry.medicineSupplyNote = medicineSupplyNote || '';
  }
  if (medicineNextConnectDate !== undefined) {
    const previousDate = stageEntry.medicineNextConnectDate ? stageEntry.medicineNextConnectDate.toISOString().slice(0, 10) : '';
    const nextDate = medicineNextConnectDate || '';
    if (!sameValue(previousDate, nextDate)) {
      addActivity(patient, req.user, `Phase ${stageNum} medicine next connect date updated`, nextDate || 'Cleared');
      if (stageEntry.medicineConnectDone) {
        addActivity(patient, req.user, `Phase ${stageNum} medicine connect reopened`, 'Next connect date changed');
      }
      stageEntry.medicineConnectDone = false;
      stageEntry.medicineConnectedAt = null;
      stageEntry.medicineConnectedByName = '';
    }
    stageEntry.medicineNextConnectDate = medicineNextConnectDate || null;
  }
  if (medicineNextConnectNote !== undefined && !sameValue(stageEntry.medicineNextConnectNote, medicineNextConnectNote)) {
    addActivity(patient, req.user, `Phase ${stageNum} medicine reminder note updated`, medicineNextConnectNote || 'Cleared');
    stageEntry.medicineNextConnectNote = medicineNextConnectNote || '';
  }
  if (medicineTakenDate !== undefined) {
    const previousDate = stageEntry.medicineTakenDate ? stageEntry.medicineTakenDate.toISOString().slice(0, 10) : '';
    const nextDate = medicineTakenDate || '';
    if (!sameValue(previousDate, nextDate)) {
      addActivity(patient, req.user, `Phase ${stageNum} medicine taken date updated`, nextDate || 'Cleared');
    }
    stageEntry.medicineTakenDate = medicineTakenDate || null;
  }
  if (medicineFullyGiven !== undefined) {
    const nextFullyGiven = medicineFullyGiven === true || medicineFullyGiven === 'true';
    if (Boolean(stageEntry.medicineFullyGiven) !== nextFullyGiven) {
      addActivity(patient, req.user, `Phase ${stageNum} medicine supply status updated`, nextFullyGiven ? 'Medicine fully given' : 'Medicine not fully given');
    }
    stageEntry.medicineFullyGiven = nextFullyGiven;
  }
  if (medicineConnectDone !== undefined) {
    const nextConnectDone = medicineConnectDone === true || medicineConnectDone === 'true';
    if (Boolean(stageEntry.medicineConnectDone) !== nextConnectDone) {
      addActivity(
        patient,
        req.user,
        `Phase ${stageNum} medicine connect ${nextConnectDone ? 'marked connected' : 'reopened'}`,
        nextConnectDone ? `Connected by ${req.user.name}` : 'Marked not connected',
      );
    }
    stageEntry.medicineConnectDone = nextConnectDone;
    stageEntry.medicineConnectedAt = nextConnectDone ? new Date() : null;
    stageEntry.medicineConnectedByName = nextConnectDone ? req.user.name : '';
  }

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Log a payment made towards a stage's package (adds to, never overwrites, the running total)
// @route   POST /api/patients/:id/stages/:number/payments
// @access  Private/Admin, Manager, Post Counselor, Psychologist, Assistant Doctor (scoped)
const addStagePayment = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const amountNum = Number(req.body.amount);
  if (!amountNum || amountNum <= 0) {
    return res.status(400).json({ success: false, message: 'Enter a valid payment amount' });
  }

  const paymentMode = req.body.paymentMode || PAYMENT_MODES.ONLINE;
  if (!ALL_PAYMENT_MODES.includes(paymentMode)) {
    return res.status(400).json({ success: false, message: `Payment mode must be one of: ${ALL_PAYMENT_MODES.join(', ')}` });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAddStagePayment(req.user)) {
    return res.status(403).json({ success: false, message: 'You do not have access to add payments' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const screenshotFiles = toFileItems(filesFromRequest(req), 'payments');
  const bank = await resolvePayToBank(paymentMode, req.body.payToBank);
  stageEntry.payments.push({
    amount: amountNum,
    date: req.body.date || new Date(),
    paymentMode,
    payToBank: bank.payToBank,
    payToBankName: bank.payToBankName,
    utr: paymentMode === PAYMENT_MODES.ONLINE ? req.body.utr || '' : '',
    transactionId: paymentMode === PAYMENT_MODES.ONLINE ? req.body.transactionId || '' : '',
    receivedBy: paymentMode === PAYMENT_MODES.CASH ? req.body.receivedBy || '' : '',
    screenshotUrl: screenshotFiles[0]?.url || null,
    screenshotFiles,
    recordedByName: req.user.name,
    approvalStatus: 'pending',
  });
  addActivity(
    patient,
    req.user,
    `Payment added for Phase ${stageNum}`,
    `${amountNum} via ${PAYMENT_MODE_LABELS[paymentMode]} — pending accounts approval`
  );

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Edit a payment entry. Admin only; other members can add where allowed but cannot edit.
// @route   PATCH /api/patients/:id/stages/:number/payments/:paymentId
// @access  Private/Admin
const updateStagePayment = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const payment = stageEntry.payments.id(req.params.paymentId);
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment not found' });
  }

  const amountNum = Number(req.body.amount);
  if (!amountNum || amountNum <= 0) {
    return res.status(400).json({ success: false, message: 'Enter a valid payment amount' });
  }

  const paymentMode = req.body.paymentMode || PAYMENT_MODES.ONLINE;
  if (!ALL_PAYMENT_MODES.includes(paymentMode)) {
    return res.status(400).json({ success: false, message: `Payment mode must be one of: ${ALL_PAYMENT_MODES.join(', ')}` });
  }

  const previousSummary = `${payment.amount || 0} via ${PAYMENT_MODE_LABELS[payment.paymentMode] || payment.paymentMode}`;
  payment.amount = amountNum;
  payment.date = req.body.date || payment.date || new Date();
  payment.paymentMode = paymentMode;
  const bank = await resolvePayToBank(paymentMode, req.body.payToBank);
  payment.payToBank = bank.payToBank;
  payment.payToBankName = bank.payToBankName;
  payment.utr = paymentMode === PAYMENT_MODES.ONLINE ? req.body.utr || '' : '';
  payment.transactionId = paymentMode === PAYMENT_MODES.ONLINE ? req.body.transactionId || '' : '';
  payment.receivedBy = paymentMode === PAYMENT_MODES.CASH ? req.body.receivedBy || '' : '';
  payment.editedByName = req.user.name;
  payment.editedAt = new Date();
  const screenshotFiles = toFileItems(filesFromRequest(req), 'payments');
  if (screenshotFiles.length) {
    payment.screenshotUrl = screenshotFiles[0].url;
    payment.screenshotFiles = mergeFileItems(payment.screenshotFiles || [], screenshotFiles);
  }

  addActivity(
    patient,
    req.user,
    `Payment edited for Phase ${stageNum}`,
    `From ${previousSummary} to ${amountNum} via ${PAYMENT_MODE_LABELS[paymentMode]}`
  );

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Delete a payment entry from a phase
// @route   DELETE /api/patients/:id/stages/:number/payments/:paymentId
// @access  Private/Admin
const deleteStagePayment = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  const stageEntry = patient.stages?.find((stage) => stage.number === stageNum);
  const payment = stageEntry?.payments.id(req.params.paymentId);
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment not found' });
  }

  const details = `${payment.amount} via ${PAYMENT_MODE_LABELS[payment.paymentMode] || payment.paymentMode} (payment ID: ${payment._id})`;
  const screenshotUrls = [payment.screenshotUrl, ...(payment.screenshotFiles || []).map((file) => file.url)].filter(Boolean);
  payment.deleteOne();
  addActivity(patient, req.user, `Payment deleted for Phase ${stageNum}`, details);
  await patient.save();
  await Promise.all([...new Set(screenshotUrls)].map(deleteUploadedFileByUrl));
  await populateAssignments(patient);

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Approve one payment entry so it counts as accounts-verified — this is the
//          per-payment approval that keeps firing for an existing, already-approved
//          patient every time a new payment comes in on any stage.
// @route   PATCH /api/patients/:id/stages/:number/payments/:paymentId/approve
// @access  Private/Admin, Doctor, Accountant
const approveStagePayment = asyncHandler(async (req, res) => {
  if (!canReviewPatientApproval(req.user)) {
    return res.status(403).json({ success: false, message: 'Only Admin, Doctor or Accountant can approve a payment' });
  }

  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const payment = stageEntry?.payments.id(req.params.paymentId);
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Payment not found' });
  }

  if (payment.approvalStatus === 'approved') {
    return res.status(400).json({ success: false, message: 'This payment is already approved' });
  }

  payment.approvalStatus = 'approved';
  payment.approvedByName = req.user.name;
  payment.approvedAt = new Date();
  addActivity(
    patient,
    req.user,
    `Payment approved for Phase ${stageNum}`,
    `${payment.amount} via ${PAYMENT_MODE_LABELS[payment.paymentMode] || payment.paymentMode}`
  );

  await patient.save();
  await populateAssignments(patient);
  await patient.populate('stages.postCounselor', 'name');

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Upload (or replace) the patient-record file for a stage
// @route   POST /api/patients/:id/stages/:number/record
// @access  Private/Admin, Manager, Post Counselor, Psychologist, Assistant Doctor (scoped)
const getUploadsFilePathFromUrl = (url) => {
  if (!url) return null;
  const relativePath = String(url).replace(/^\//, '');
  const uploadsRoot = path.resolve(__dirname, '../../uploads');
  const filePath = path.resolve(__dirname, '../..', relativePath);
  if (!filePath.toLowerCase().startsWith(`${uploadsRoot.toLowerCase()}${path.sep}`)) return null;
  return filePath;
};

const deleteUploadedFileByUrl = async (url) => {
  const filePath = getUploadsFilePathFromUrl(url);
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not delete uploaded file ${filePath}: ${error.message}`);
    }
  }
};

const stageMedicineRequests = (stage) => [
  ...(stage.medicineRequest && stage.medicineRequest.status !== MEDICINE_STATUSES.NOT_REQUESTED
    ? [stage.medicineRequest] : []),
  ...(stage.medicineRequests || []),
];

const findStageMedicineRequest = (stage, requestId) => {
  if (!requestId || requestId === 'legacy') return stage.medicineRequest;
  return (stage.medicineRequests || []).find((request) => request.requestId === requestId);
};

// @desc    Remove a patient and records owned by that patient
// @route   DELETE /api/patients/:id
// @access  Private/Admin
const deletePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  const calls = await CallLog.find({ patient: patient._id }).select('recordingFileUrl');
  const fileUrls = new Set(calls.map((call) => call.recordingFileUrl).filter(Boolean));
  const collectFiles = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(collectFiles);
    for (const [key, item] of Object.entries(value)) {
      if (key.toLowerCase().endsWith('url') && typeof item === 'string' && item.startsWith('/uploads/')) {
        fileUrls.add(item);
      } else if (item && typeof item === 'object') {
        collectFiles(item);
      }
    }
  };
  collectFiles(patient.toObject().stages);

  await AdviceRequest.deleteMany({ patient: patient._id });
  await DigitalMarketingReview.deleteMany({ patient: patient._id });
  await CallLog.deleteMany({ patient: patient._id });
  await Patient.deleteOne({ _id: patient._id });
  await Promise.all([...fileUrls].map(deleteUploadedFileByUrl));

  res.status(200).json({ success: true, message: 'Patient deleted' });
});

const regenerateStageRecordPdf = async (patient, stageEntry, stageNum) => {
  const scans = stageEntry.recordScanFiles || [];
  if (!scans.length) {
    await deleteUploadedFileByUrl(stageEntry.recordFileUrl);
    stageEntry.recordFileUrl = null;
    stageEntry.recordFileName = '';
    stageEntry.recordFiles = [];
    stageEntry.recordPdfPageCount = 0;
    stageEntry.recordPdfUpdatedAt = null;
    return;
  }

  const pdfFileName = `patient-${patient._id}-phase-${stageNum}-records.pdf`;
  const pdfPath = path.join(__dirname, '../../uploads/records', pdfFileName);
  const pdfImages = scans.map((file) => ({
    filePath: getUploadsFilePathFromUrl(file.url),
    uploadedAt: file.uploadedAt,
    uploadedByName: file.uploadedByName,
  }));
  await writeImagesPdf({ filePath: pdfPath, images: pdfImages });

  stageEntry.recordFileUrl = `/uploads/records/${pdfFileName}`;
  stageEntry.recordFileName = `Phase ${stageNum} scanned records (${scans.length} pages).pdf`;
  stageEntry.recordFiles = [{ url: stageEntry.recordFileUrl, fileName: stageEntry.recordFileName }];
  stageEntry.recordPdfPageCount = scans.length;
  stageEntry.recordPdfUpdatedAt = new Date();
};

const uploadStageRecord = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const uploadedFiles = filesFromRequest(req);
  if (!uploadedFiles.length) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const invalidFile = uploadedFiles.find((file) => !['image/jpeg', 'image/png'].includes(file.mimetype));
  if (invalidFile) {
    return res.status(400).json({ success: false, message: 'Only JPG or PNG images can be scanned into patient record PDF' });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  if (!canEditPatientRecords(req.user)) {
    return res.status(403).json({ success: false, message: 'You do not have access to edit patient records' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const uploadedItems = toFileItems(uploadedFiles, 'records').map((file) => ({
    ...file,
    uploadedAt: new Date(),
    uploadedByName: req.user.name,
  }));
  stageEntry.recordScanFiles = [...(stageEntry.recordScanFiles || []), ...uploadedItems];
  await regenerateStageRecordPdf(patient, stageEntry, stageNum);
  addActivity(
    patient,
    req.user,
    `Record scans appended for Phase ${stageNum}`,
    `${uploadedItems.length} page(s) added. Total ${stageEntry.recordScanFiles.length} page(s).`
  );

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

const deleteStageRecordScan = asyncHandler(async (req, res) => {
  if (!canEditPatientRecords(req.user)) {
    return res.status(403).json({ success: false, message: 'You do not have access to edit patient records' });
  }

  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const scans = stageEntry.recordScanFiles || [];
  const scanIndex = scans.findIndex((scan) => String(scan._id) === String(req.params.scanId));
  if (scanIndex === -1) {
    return res.status(404).json({ success: false, message: 'Scanned page not found' });
  }

  const [removedScan] = scans.splice(scanIndex, 1);
  stageEntry.recordScanFiles = scans;
  await deleteUploadedFileByUrl(removedScan?.url);
  await regenerateStageRecordPdf(patient, stageEntry, stageNum);
  addActivity(
    patient,
    req.user,
    `Record scan deleted for Phase ${stageNum}`,
    removedScan?.fileName || 'Scanned page removed'
  );

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

// @desc    Assistant Doctor/Doctor/Admin sends a stage medicine request with prescription
// @route   POST /api/patients/:id/stages/:number/medicine-request
// @access  Private/Admin, Doctor, Assistant Doctor (scoped)
const requestStageMedicine = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  if (![ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only Doctor, Assistant Doctor or Admin can request medicine' });
  }

  const { medicines, notes } = req.body;
  if (!medicines) {
    return res.status(400).json({ success: false, message: 'Medicine details are required' });
  }
  const uploadedFiles = filesFromRequest(req);
  if (!uploadedFiles.length) {
    return res.status(400).json({ success: false, message: 'Prescription image or document is required' });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!canAccessPatient(req.user, patient)) {
    return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const prescriptionFiles = toFileItems(uploadedFiles, 'prescriptions');
  const createNew = req.body.createNew === 'true' || req.body.createNew === true;
  const existingRequest = createNew ? null : findStageMedicineRequest(stageEntry, req.body.requestId);
  if (!createNew && req.body.requestId && !existingRequest) {
    return res.status(404).json({ success: false, message: 'Medicine request not found' });
  }
  const nextRequest = {
    ...emptyMedicineRequest(),
    ...(existingRequest?.toObject?.() || existingRequest || {}),
    ...(createNew ? { requestId: crypto.randomUUID() } : {}),
    status: MEDICINE_STATUSES.REQUESTED,
    medicines,
    notes: notes || '',
    prescriptionUrl: prescriptionFiles[0].url,
    prescriptionFileName: prescriptionFiles[0].fileName,
    prescriptionFiles: mergeFileItems(existingRequest?.prescriptionFiles || [], prescriptionFiles),
    requestedAt: new Date(),
    requestedByName: req.user.name,
  };
  if (createNew) {
    stageEntry.medicineRequests.push(nextRequest);
  } else if (req.body.requestId && req.body.requestId !== 'legacy') {
    Object.assign(existingRequest, nextRequest);
  } else {
    stageEntry.medicineRequest = nextRequest;
  }

  addActivity(patient, req.user, `${createNew ? 'Medicine requested' : 'Medicine request updated'} for Phase ${stageNum}`, `${medicines} | Request: ${nextRequest.requestId || 'legacy'}`);

  await patient.save();
  await populateAssignments(patient);

  res.status(201).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
});

const formatMedicineListItem = (patient, stage, request) => ({
  patientId: patient._id,
  patientName: patient.patientName,
  patientNumber: patient.number,
  categoryLabel: CATEGORY_LABELS[patient.category],
  stage: stage.number,
  stageLabel: STAGE_LABELS[stage.number],
  requestId: request?.requestId || 'legacy',
  medicineRequest: formatMedicineRequest(request),
});

// @desc    Medicine department/admin list medicine requests by status
// @route   GET /api/medicine/requests
// @access  Private/Admin, Medicine Department
const listMedicineRequests = asyncHandler(async (req, res) => {
  const statuses = String(req.query.status || `${MEDICINE_STATUSES.REQUESTED},${MEDICINE_STATUSES.IN_PROCESS}`)
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean);

  if (statuses.some((status) => !ACTIVE_MEDICINE_STATUSES.includes(status))) {
    return res.status(400).json({ success: false, message: 'Invalid medicine status filter' });
  }

  const patients = await Patient.find({}).select('patientName number category stages');
  const rows = [];

  patients.forEach((patient) => {
    normalizeStages(patient.stages).forEach((stage) => {
      stageMedicineRequests(stage).forEach((request) => {
        if (statuses.includes(request.status)) rows.push(formatMedicineListItem(patient, stage, request));
      });
    });
  });

  rows.sort((a, b) => {
    const left = a.medicineRequest.requestedAt || a.medicineRequest.madeAt || 0;
    const right = b.medicineRequest.requestedAt || b.medicineRequest.madeAt || 0;
    return new Date(right) - new Date(left);
  });

  res.status(200).json({ success: true, count: rows.length, rows });
});

// @desc    Medicine department/admin updates medicine preparation status
// @route   PATCH /api/medicine/requests/:patientId/stages/:number
// @access  Private/Admin, Medicine Department
const updateMedicineRequestStatus = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const { status } = req.body;
  if (![MEDICINE_STATUSES.IN_PROCESS, MEDICINE_STATUSES.MADE, MEDICINE_STATUSES.SENT_TO_COURIER].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid medicine status update' });
  }

  const patient = await Patient.findById(req.params.patientId);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const requestDoc = findStageMedicineRequest(stageEntry, req.body.requestId);
  if (!requestDoc) return res.status(404).json({ success: false, message: 'Medicine request not found' });
  const currentRequest = { ...emptyMedicineRequest(), ...(requestDoc.toObject?.() || requestDoc) };
  const uploadedFiles = filesFromRequest(req);
  const existingMedicineImages = withLegacyFile(currentRequest.medicineImages || [], currentRequest.medicineImageUrl, currentRequest.medicineImageFileName);
  if (currentRequest.status === MEDICINE_STATUSES.NOT_REQUESTED) {
    return res.status(400).json({ success: false, message: 'Medicine has not been requested for this phase' });
  }
  if (status === MEDICINE_STATUSES.MADE && !uploadedFiles.length && !existingMedicineImages.length) {
    return res.status(400).json({ success: false, message: 'Medicine image is required before marking medicine made' });
  }
  if (status === MEDICINE_STATUSES.SENT_TO_COURIER && !existingMedicineImages.length) {
    return res.status(400).json({ success: false, message: 'Upload medicine image before sending to courier' });
  }
  if (status === MEDICINE_STATUSES.SENT_TO_COURIER) {
    if (!req.body.packagedByName || !req.body.chitsWrittenByName || !req.body.lastMedicineCheckedByName) {
      return res.status(400).json({ success: false, message: 'Packaging by, chits written by and last medicine checking by are required before sending to courier' });
    }
  }

  const medicineImages = toFileItems(uploadedFiles, 'medicine');
  const nextRequest = {
    ...currentRequest,
    status,
    ...(status === MEDICINE_STATUSES.IN_PROCESS ? { inProcessAt: new Date(), inProcessByName: req.user.name } : {}),
    ...(status === MEDICINE_STATUSES.MADE
      ? {
          madeAt: new Date(),
          madeByName: req.user.name,
          ...(medicineImages.length
            ? {
                medicineImageUrl: medicineImages[0].url,
                medicineImageFileName: medicineImages[0].fileName,
                medicineImages: mergeFileItems(currentRequest.medicineImages || [], medicineImages),
              }
            : {}),
        }
      : {}),
    ...(status === MEDICINE_STATUSES.SENT_TO_COURIER
      ? {
          packagedByName: req.body.packagedByName,
          chitsWrittenByName: req.body.chitsWrittenByName,
          lastMedicineCheckedByName: req.body.lastMedicineCheckedByName,
          packagingDetailsFilledByName: req.user.name,
          packagingDetailsFilledAt: new Date(),
          sentToCourierAt: new Date(),
          sentToCourierByName: req.user.name,
        }
      : {}),
  };
  if (req.body.requestId && req.body.requestId !== 'legacy') {
    Object.assign(requestDoc, nextRequest);
  } else {
    stageEntry.medicineRequest = nextRequest;
  }

  addActivity(
    patient,
    req.user,
    `Medicine status updated for Phase ${stageNum}`,
    status === MEDICINE_STATUSES.SENT_TO_COURIER
      ? `${MEDICINE_STATUS_LABELS[status]} | Packaging: ${req.body.packagedByName} | Chits: ${req.body.chitsWrittenByName} | Last checking: ${req.body.lastMedicineCheckedByName} | Request: ${currentRequest.requestId || 'legacy'}`
      : `${MEDICINE_STATUS_LABELS[status]} | Request: ${currentRequest.requestId || 'legacy'}`
  );

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({
    success: true,
    patient: formatPatient(patient, req.user, { includeActivity: true }),
    item: formatMedicineListItem(patient, stageEntry, findStageMedicineRequest(stageEntry, req.body.requestId)),
  });
});

// @desc    Courier department/admin list courier records
// @route   GET /api/courier/requests
// @access  Private/Admin, Dispatch & Courier
const listCourierRequests = asyncHandler(async (req, res) => {
  const statusFilter = String(req.query.status || 'all')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean);
  const patients = await Patient.find({}).select('patientName number category stages');
  const rows = [];

  patients.forEach((patient) => {
    normalizeStages(patient.stages).forEach((stage) => {
      stageMedicineRequests(stage).forEach((request) => {
        if (request.status !== MEDICINE_STATUSES.SENT_TO_COURIER) return;
        if (!statusFilter.includes('all') && !statusFilter.includes(request.courier.status)) return;
        rows.push(formatMedicineListItem(patient, stage, request));
      });
    });
  });

  rows.sort((a, b) => {
    const aDate = a.medicineRequest.courier.deliveredAt || a.medicineRequest.courier.dispatchedAt || a.medicineRequest.sentToCourierAt || 0;
    const bDate = b.medicineRequest.courier.deliveredAt || b.medicineRequest.courier.dispatchedAt || b.medicineRequest.sentToCourierAt || 0;
    return new Date(bDate) - new Date(aDate);
  });

  res.status(200).json({ success: true, count: rows.length, rows });
});

// @desc    Courier department/admin updates courier dispatch or delivery details
// @route   PATCH /api/courier/requests/:patientId/stages/:number
// @access  Private/Admin, Dispatch & Courier
const updateCourierRequest = asyncHandler(async (req, res) => {
  const stageNum = parseInt(req.params.number, 10);
  if (!STAGES.includes(stageNum)) {
    return res.status(400).json({ success: false, message: 'Invalid phase number' });
  }

  const { status } = req.body;
  if (![COURIER_STATUSES.DISPATCHED, COURIER_STATUSES.DELIVERED].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid courier status update' });
  }

  const patient = await Patient.findById(req.params.patientId);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  if (!patient.stages || patient.stages.length !== STAGES.length) {
    patient.stages = normalizeStages(patient.stages);
  }

  const stageEntry = patient.stages.find((s) => s.number === stageNum);
  const requestDoc = findStageMedicineRequest(stageEntry, req.body.requestId);
  if (!requestDoc) return res.status(404).json({ success: false, message: 'Medicine request not found' });
  const currentRequest = { ...emptyMedicineRequest(), ...(requestDoc.toObject?.() || requestDoc) };
  const currentCourier = { ...emptyCourier(), ...(currentRequest.courier?.toObject?.() || currentRequest.courier || {}) };
  const uploadedFiles = filesFromRequest(req);
  const existingPackageImages = withLegacyFile(currentCourier.packageImages || [], currentCourier.packageImageUrl, currentCourier.packageImageFileName);
  if (currentRequest.status !== MEDICINE_STATUSES.SENT_TO_COURIER) {
    return res.status(400).json({ success: false, message: 'Medicine has not been sent to courier yet' });
  }

  if (status === COURIER_STATUSES.DISPATCHED) {
    const deliveryMode = req.body.deliveryMode === 'self' ? 'self' : 'courier';
    const required = deliveryMode === 'self'
      ? ['receiverName', 'receiverPhone']
      : ['receiverName', 'receiverPhone', 'address', 'courierPartner', 'trackingNumber'];
    const missing = required.find((field) => !req.body[field]);
    if (missing) {
      return res.status(400).json({
        success: false,
        message: deliveryMode === 'self'
          ? 'Receiver name and receiver phone are required'
          : 'Receiver, address, courier partner and tracking number are required',
      });
    }
    if (deliveryMode === 'courier' && !uploadedFiles.length && !existingPackageImages.length) {
      return res.status(400).json({ success: false, message: 'Package image is required before dispatch' });
    }
  }

  if (status === COURIER_STATUSES.DELIVERED) {
    const isSelfPickupDelivery = req.body.deliveryMode === 'self' || currentCourier.deliveryMode === 'self';
    if (!isSelfPickupDelivery && currentCourier.status !== COURIER_STATUSES.DISPATCHED) {
      return res.status(400).json({ success: false, message: 'Dispatch courier before marking delivered' });
    }
    if (isSelfPickupDelivery) {
      const missing = ['receiverName', 'receiverPhone'].find((field) => !req.body[field] && !currentCourier[field]);
      if (missing) {
        return res.status(400).json({ success: false, message: 'Receiver name and receiver phone are required' });
      }
    } else if (!req.body.receivedByName) {
      return res.status(400).json({ success: false, message: 'Received by whom is required' });
    }
  }

  const deliveryMode = req.body.deliveryMode === 'self' ? 'self' : (currentCourier.deliveryMode || 'courier');

  const nextCourier = {
    ...currentCourier,
    status,
    receiverName: req.body.receiverName || currentCourier.receiverName,
    receiverPhone: req.body.receiverPhone || currentCourier.receiverPhone,
    address: req.body.address || currentCourier.address,
    courierPartner: req.body.courierPartner || currentCourier.courierPartner,
    deliveryMode,
    selfPickupByName: req.body.deliveryMode === 'self' ? '' : (req.body.selfPickupByName || currentCourier.selfPickupByName),
    trackingNumber: req.body.trackingNumber || currentCourier.trackingNumber,
    paymentPaidBy: req.body.paymentPaidBy || currentCourier.paymentPaidBy,
    paymentAmount: req.body.paymentAmount !== undefined ? Math.max(Number(req.body.paymentAmount) || 0, 0) : currentCourier.paymentAmount,
    paymentMode: req.body.paymentMode || currentCourier.paymentMode,
    notes: req.body.notes || currentCourier.notes,
    ...(status === COURIER_STATUSES.DISPATCHED ? { dispatchedAt: new Date(), dispatchedByName: req.user.name } : {}),
    ...(status === COURIER_STATUSES.DELIVERED
      ? {
          deliveredAt: new Date(),
          deliveredByName: req.user.name,
          receivedByName: deliveryMode === 'self'
            ? (req.body.receivedByName || req.body.receiverName || currentCourier.receiverName)
            : req.body.receivedByName,
        }
      : {}),
  };

  const courierImages = toFileItems(uploadedFiles, 'courier');
  if (courierImages.length) {
    if (status === COURIER_STATUSES.DELIVERED) {
      nextCourier.deliveryProofUrl = courierImages[0].url;
      nextCourier.deliveryProofFileName = courierImages[0].fileName;
      nextCourier.deliveryProofImages = mergeFileItems(currentCourier.deliveryProofImages || [], courierImages);
    } else {
      nextCourier.packageImageUrl = courierImages[0].url;
      nextCourier.packageImageFileName = courierImages[0].fileName;
      nextCourier.packageImages = mergeFileItems(currentCourier.packageImages || [], courierImages);
    }
  }

  const nextRequest = {
    ...currentRequest,
    courier: nextCourier,
  };
  if (req.body.requestId && req.body.requestId !== 'legacy') {
    Object.assign(requestDoc, nextRequest);
  } else {
    stageEntry.medicineRequest = nextRequest;
  }

  addActivity(
    patient,
    req.user,
    `Courier ${status} for Phase ${stageNum}`,
    status === COURIER_STATUSES.DELIVERED
      ? nextCourier.deliveryMode === 'self'
        ? `Self pickup delivered to ${nextCourier.receivedByName} | Request: ${currentRequest.requestId || 'legacy'}`
        : `Received by ${nextCourier.receivedByName} | Request: ${currentRequest.requestId || 'legacy'}`
      : nextCourier.deliveryMode === 'self'
        ? `Self pickup by ${nextCourier.receiverName} | Request: ${currentRequest.requestId || 'legacy'}`
        : `${nextCourier.trackingNumber} | Request: ${currentRequest.requestId || 'legacy'}`
  );

  await patient.save();
  await populateAssignments(patient);

  res.status(200).json({
    success: true,
    patient: formatPatient(patient, req.user, { includeActivity: true }),
    item: formatMedicineListItem(patient, stageEntry, findStageMedicineRequest(stageEntry, req.body.requestId)),
  });
});

// --- Follow-ups & Family Sessions -----------------------------------------
// Both share the exact same shape (dateTime/status/notes) and live inside a
// specific stage, so the logic is written once and reused via a factory.

// @desc    Schedule a new Follow-up / Family Session for a specific stage
// @route   POST /api/patients/:id/stages/:number/followups | .../family-sessions
// @access  Private/Admin, Manager, Post Counselor, Psychologist, Assistant Doctor (scoped)
const addScheduleEntry = (fieldKey) =>
  asyncHandler(async (req, res) => {
    if (fieldKey === 'followUps' && req.user.role === ROLES.PSYCHOLOGIST) {
      return res.status(403).json({ success: false, message: 'Follow-ups are only visible to the assigned Assistant Doctor' });
    }

    const stageNum = parseInt(req.params.number, 10);
    if (!STAGES.includes(stageNum)) {
      return res.status(400).json({ success: false, message: 'Invalid phase number' });
    }

    const { dateTime, notes, followUpType } = req.body;
    if (!dateTime) {
      return res.status(400).json({ success: false, message: 'Date & time is required' });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    if (!canAccessPatient(req.user, patient)) {
      return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
    }

    if (!patient.stages || patient.stages.length !== STAGES.length) {
      patient.stages = normalizeStages(patient.stages);
    }

    const stageEntry = patient.stages.find((s) => s.number === stageNum);
    const requestedFollowUpType = String(followUpType || '').toLowerCase();
    const normalizedFollowUpType = fieldKey === 'followUps' && ['sfs', 'tracker'].includes(requestedFollowUpType)
      ? requestedFollowUpType
      : 'normal';
    stageEntry[fieldKey].push({ dateTime, notes: notes || '', followUpType: normalizedFollowUpType, createdByName: req.user.name });
    addActivity(
      patient,
      req.user,
      `${fieldKey === 'followUps' ? `${normalizedFollowUpType === 'sfs' ? 'SFS follow-up' : normalizedFollowUpType === 'tracker' ? 'Tracker follow-up' : 'Follow-up'}` : 'Family session'} scheduled for Phase ${stageNum}`,
      `${new Date(dateTime).toLocaleString('en-IN')}${notes ? ` - ${notes}` : ''}`
    );
    await patient.save();
    await populateAssignments(patient);

    res.status(201).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
  });

// @desc    Update a Follow-up / Family Session entry (status, notes, or reschedule)
// @route   PATCH /api/patients/:id/stages/:number/followups/:entryId | .../family-sessions/:entryId
// @access  Private/Admin, Manager, Post Counselor, Psychologist, Assistant Doctor (scoped)
const updateScheduleEntry = (fieldKey) =>
  asyncHandler(async (req, res) => {
    if (cannotUpdateScheduleType(req.user, fieldKey)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to update this schedule' });
    }

    const stageNum = parseInt(req.params.number, 10);
    if (!STAGES.includes(stageNum)) {
      return res.status(400).json({ success: false, message: 'Invalid phase number' });
    }

    const { dateTime, status, notes, followUpType, completionName, completionDetails, trackerSubmissionUrl, meetRecordingUrl, completionFormType, completionHtml, cancelReason } = req.body;
    const uploadedCompletionFiles = filesFromRequest(req);
    let completionFormData = req.body.completionFormData;
    if (typeof completionFormData === 'string') {
      try {
        completionFormData = JSON.parse(completionFormData || 'null');
      } catch {
        completionFormData = null;
      }
    }
    if (status !== undefined && !ALL_SCHEDULE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${ALL_SCHEDULE_STATUSES.join(', ')}` });
    }
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    if (!canAccessPatient(req.user, patient)) {
      return res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
    }

    if (!patient.stages || patient.stages.length !== STAGES.length) {
      patient.stages = normalizeStages(patient.stages);
    }

    const stageEntry = patient.stages.find((s) => s.number === stageNum);
    const entry = stageEntry[fieldKey].id(req.params.entryId);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    const isShortFollowUp = fieldKey === 'followUps' && entry.followUpType === 'sfs';
    const isTrackerFollowUp = fieldKey === 'followUps' && entry.followUpType === 'tracker';
    if (status === 'sent' && !isTrackerFollowUp) {
      return res.status(400).json({ success: false, message: 'Only tracker follow-ups can be marked sent' });
    }
    if (status === 'completed') {
      const hasCompletionAttachment = uploadedCompletionFiles.length > 0 || (entry.completionFiles || []).length > 0;
      if (isShortFollowUp && !String(completionDetails || '').trim() && !hasCompletionAttachment) {
        return res.status(400).json({ success: false, message: 'Add an SFS note or upload a photo/file' });
      }
      if (isTrackerFollowUp && !String(trackerSubmissionUrl || '').trim()) {
        return res.status(400).json({ success: false, message: 'Tracker submission link is required to mark tracker done' });
      }
    }
    if (status === 'cancelled' && !String(cancelReason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }

    const scheduleLabel = fieldKey === 'followUps'
      ? (isShortFollowUp ? 'SFS follow-up' : isTrackerFollowUp ? 'Tracker follow-up' : 'Follow-up')
      : 'Family session';
    if (dateTime !== undefined && !sameValue(new Date(entry.dateTime).toISOString(), new Date(dateTime).toISOString())) {
      addActivity(patient, req.user, `${scheduleLabel} rescheduled for Phase ${stageNum}`, new Date(dateTime).toLocaleString('en-IN'));
      entry.dateTime = dateTime;
    }
    if (notes !== undefined && !sameValue(entry.notes, notes)) {
      addActivity(patient, req.user, `${scheduleLabel} notes updated for Phase ${stageNum}`, notes || 'Cleared');
      entry.notes = notes;
    }
    if (fieldKey === 'followUps' && followUpType !== undefined) {
      if (req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({ success: false, message: 'Only Admin can edit follow-up type' });
      }
      const nextFollowUpType = String(followUpType || 'normal').toLowerCase();
      if (!['normal', 'sfs', 'tracker'].includes(nextFollowUpType)) {
        return res.status(400).json({ success: false, message: 'Follow-up type must be normal, sfs, or tracker' });
      }
      if (!sameValue(entry.followUpType || 'normal', nextFollowUpType)) {
        addActivity(patient, req.user, `${scheduleLabel} type updated for Phase ${stageNum}`, `From ${entry.followUpType || 'normal'} to ${nextFollowUpType}`);
        entry.followUpType = nextFollowUpType;
      }
    }
    if (fieldKey === 'familySessions' && meetRecordingUrl !== undefined) {
      const nextMeetRecordingUrl = String(meetRecordingUrl || '').trim();
      if (!sameValue(entry.meetRecordingUrl || '', nextMeetRecordingUrl)) {
        entry.meetRecordingUrl = nextMeetRecordingUrl;
        addActivity(
          patient,
          req.user,
          `Family session recording link ${nextMeetRecordingUrl ? 'updated' : 'cleared'} for Phase ${stageNum}`,
          nextMeetRecordingUrl || 'Cleared'
        );
      }
    }

    if (status !== undefined) {
      if (status === 'sent') {
        entry.trackerSentAt = new Date();
        entry.trackerSentByName = req.user.name;
      }
      if (status === 'cancelled') {
        entry.cancelReason = String(cancelReason || '').trim();
        entry.cancelledAt = new Date();
        entry.cancelledByName = req.user.name;
      }
      if (status === 'completed') {
        entry.completionName = isShortFollowUp
          ? (completionName || 'SFS Call')
          : isTrackerFollowUp
            ? 'Tracker Submission'
            : completionName;
        entry.completionDetails = isTrackerFollowUp ? (completionDetails || 'Tracker submitted') : completionDetails;
        const completionFiles = toFileItems(uploadedCompletionFiles, 'schedule');
        entry.completionFiles = mergeFileItems(entry.completionFiles || [], completionFiles);
        entry.trackerSubmissionUrl = isTrackerFollowUp ? String(trackerSubmissionUrl || '').trim() : '';
        entry.meetRecordingUrl = fieldKey === 'familySessions' ? String(meetRecordingUrl || '').trim() : '';
        entry.completedAt = new Date();
        entry.completionFormType = isShortFollowUp ? 'sfs' : isTrackerFollowUp ? 'tracker' : completionFormType || (fieldKey === 'followUps' ? 'followup_full' : 'family_section_a');
        entry.completionFormData = (isShortFollowUp || isTrackerFollowUp) ? null : completionFormData || null;
        if (isShortFollowUp || isTrackerFollowUp) {
          entry.completionPdfUrl = null;
          entry.completionPdfName = '';
        } else {
          const safePatientId = String(patient._id);
          const safeEntryId = String(entry._id);
          const pdfName = `${fieldKey === 'followUps' ? 'followup' : 'family-session'}-${safeEntryId}.pdf`;
          const pdfPath = path.join(__dirname, '../../uploads/forms', safePatientId, pdfName);
          const submittedMeta = completionFormData?.meta || {};
          // Keep the form open for retry if its original layout cannot be rendered.
          try {
            await writeTextPdf({
              filePath: pdfPath,
              html: completionHtml,
              requireHtml: true,
              title: fieldKey === 'followUps'
                ? 'MANOVAIDYA - AUTISM FOLLOW-UP ROUTINE & COMPLIANCE CHECK'
                : 'MANOVAIDYA WELLNESS PVT. LTD. - FAMILY SESSION RECORD',
              metaRows: [
                `Patient: ${patient.patientName}`,
                submittedMeta.patient ? `Patient details: ${submittedMeta.patient}` : '',
                submittedMeta.dateRecord ? `Record details: ${submittedMeta.dateRecord}` : '',
                `Phase: ${stageNum}`,
                `Scheduled: ${new Date(entry.dateTime).toLocaleString('en-IN')}`,
                `Completed: ${new Date().toLocaleString('en-IN')}`,
                `Completed by/with: ${completionName}`,
                fieldKey === 'familySessions' && meetRecordingUrl ? `Google Meet recording: ${meetRecordingUrl}` : '',
                `Summary: ${completionDetails}`,
              ].filter(Boolean),
              formData: completionFormData?.sections || completionFormData || {},
            });
            entry.completionPdfUrl = `/uploads/forms/${safePatientId}/${pdfName}`;
            entry.completionPdfName = pdfName;
          } catch (pdfError) {
            console.error(`Completion PDF generation failed for ${fieldKey} ${safeEntryId}:`, pdfError.message);
            return res.status(503).json({ message: 'Form PDF could not be generated. Please keep your form open and retry after the server PDF browser is configured.' });
          }
        }
      }
      if (!sameValue(entry.status, status)) {
        addActivity(
          patient,
          req.user,
          `${scheduleLabel} ${status === 'completed' ? 'marked done' : status === 'sent' ? 'marked sent' : status === 'cancelled' ? 'cancelled' : 'status updated'} for Phase ${stageNum}`,
          status === 'completed'
            ? (isTrackerFollowUp
                ? `Tracker link: ${trackerSubmissionUrl}`
                : `${entry.completionName}: ${entry.completionDetails || `${(entry.completionFiles || []).length} attachment(s)`}`)
            : status === 'sent'
              ? 'Tracker sent to parents'
              : status === 'cancelled'
                ? `Reason: ${entry.cancelReason}`
                : status
        );
      }
      entry.status = status;
    }

    await patient.save();
    await populateAssignments(patient);

    res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
  });

const deleteScheduleEntry = (fieldKey) =>
  asyncHandler(async (req, res) => {
    const stageNum = parseInt(req.params.number, 10);
    if (!STAGES.includes(stageNum)) {
      return res.status(400).json({ success: false, message: 'Invalid phase number' });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const stageEntry = patient.stages?.find((stage) => stage.number === stageNum);
    const entry = stageEntry?.[fieldKey].id(req.params.entryId);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    const fileUrls = [entry.completionPdfUrl, ...(entry.completionFiles || []).map((file) => file.url)].filter(Boolean);
    const entryType = fieldKey === 'followUps' ? 'Follow-up' : 'Family session';
    const details = `Scheduled ${entry.dateTime.toISOString()} | status: ${entry.status} | entry ID: ${entry._id}`;
    entry.deleteOne();
    addActivity(patient, req.user, `${entryType} deleted for Phase ${stageNum}`, details);
    await patient.save();
    await Promise.all([...new Set(fileUrls)].map(deleteUploadedFileByUrl));
    await populateAssignments(patient);

    res.status(200).json({ success: true, patient: formatPatient(patient, req.user, { includeActivity: true }) });
  });

// @desc    Follow-ups / Family Sessions grouped by assignee, with status counts
// @route   GET /api/schedule/followups | /api/schedule/family-sessions
// @access  Private/Admin, Manager, Post Counselor, Psychologist, Assistant Doctor (scoped)
// Follow-ups group by the patient's assigned Assistant Doctor (only that doctor sees their own row).
// Family Sessions group by whoever scheduled the entry — there's no "assigned Psychologist" concept yet.
const listScheduleEntries = (fieldKey, { groupByAssignedDoctor = false, groupByAssignedPsychologist = false } = {}) =>
  asyncHandler(async (req, res) => {
    if (cannotSeeScheduleType(req.user, fieldKey)) {
      return res.status(200).json({
        success: true,
        rows: [],
        totals: { upcoming: 0, late: 0, done: 0, done_late: 0, cancelled: 0 },
      });
    }

    // Closed patients drop off the Follow-ups/Family Sessions tracking pages too.
    const filter = { isActive: { $ne: false } };
    if (req.user.role === ROLES.ASSISTANT_DOCTOR) {
      filter.assignedDoctor = req.user._id;
      filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
    } else if (req.user.role === ROLES.PSYCHOLOGIST) {
      filter.assignedPsychologist = req.user._id;
      filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
    }

    // Only this one schedule field is ever read here — selecting the whole "stages" tree
    // (payments, medicine/courier data, record files) made this scan very slow at scale.
    let query = Patient.find(filter)
      .select(`patientName category stages.number stages.${fieldKey} assignedDoctor assignedPsychologist`)
      .lean();
    if (groupByAssignedDoctor) {
      query = query.populate('assignedDoctor', 'name');
    }
    if (groupByAssignedPsychologist) {
      query = query.populate('assignedPsychologist', 'name');
    }
    const patients = await query;

    const grouped = new Map();
    const emptyCounts = () => ({ upcoming: 0, late: 0, done: 0, done_late: 0, cancelled: 0 });

    patients.forEach((p) => {
      const patientAssignee = groupByAssignedDoctor
        ? (p.assignedDoctor && p.assignedDoctor.name) || 'Unassigned'
        : (p.assignedPsychologist && p.assignedPsychologist.name) || 'Unassigned';

      (p.stages || []).forEach((s) => {
        (s[fieldKey] || []).forEach((e) => {
          const formatted = formatScheduleEntry(e);
          const assignee = groupByAssignedDoctor || groupByAssignedPsychologist
            ? patientAssignee
            : formatted.createdByName || 'Unassigned';

          if (!grouped.has(assignee)) {
            grouped.set(assignee, { assignee, counts: emptyCounts(), entries: [] });
          }
          const bucket = grouped.get(assignee);
          bucket.counts[formatted.displayStatus] += 1;
          bucket.entries.push({
            ...formatted,
            patientId: p._id,
            patientName: p.patientName,
            category: p.category,
            categoryLabel: CATEGORY_LABELS[p.category],
            stageNumber: s.number,
            stageLabel: STAGE_LABELS[s.number],
          });
        });
      });
    });

    const rows = Array.from(grouped.values()).sort((a, b) => a.assignee.localeCompare(b.assignee));

    const totals = rows.reduce((acc, row) => {
      Object.keys(acc).forEach((key) => {
        acc[key] += row.counts[key];
      });
      return acc;
    }, emptyCounts());

    res.status(200).json({ success: true, rows, totals });
  });

const getScheduleReminders = asyncHandler(async (req, res) => {
  // Reminder visibility:
  //  - Manager sees late/upcoming reminders across the working team.
  //  - Assistant Doctor sees their assigned patients' follow-ups.
  //  - Psychologist sees their assigned patients' family sessions.
  //  - Post Counselor sees medicine connect reminders for stages assigned to them.
  //  - Admin and Doctor do not receive these operational reminders.
  const reminderRoles = [ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.POST_COUNSELOR];
  if (!reminderRoles.includes(req.user.role)) {
    return res.status(200).json({ success: true, count: 0, reminders: [] });
  }

  // Closed patients never generate reminders for anyone.
  const filter = { isActive: { $ne: false } };
  if (req.user.role === ROLES.ASSISTANT_DOCTOR) {
    filter.assignedDoctor = req.user._id;
    filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
  } else if (req.user.role === ROLES.PSYCHOLOGIST) {
    filter.assignedPsychologist = req.user._id;
    filter.approvalStatus = { $ne: 'pending' }; // treat missing (pre-existing patients) as approved
  }

  const includeUpcoming24 = req.query.window === '24h';
  // This runs on every 15s poll from the reminder bell/toasts, and for Manager/Post
  // Counselor it scans the whole collection — keep the projection to just the schedule/
  // medicine-connect fields collectScheduleReminders reads, not the full "stages" tree.
  const patients = await Patient.find(filter)
    .select(
      'patientName patientCode category stages.number stages.followUps stages.familySessions '
      + 'stages.medicineNextConnectDate stages.medicineConnectDone stages.medicineNextConnectNote stages.postCounselor '
      + 'assignedDoctor assignedPsychologist'
    )
    .populate('assignedDoctor', 'name')
    .populate('assignedPsychologist', 'name')
    .populate('stages.postCounselor', 'name')
    .lean();

  const reminders = collectScheduleReminders(patients, req.user, { includeUpcoming24 });
  res.status(200).json({ success: true, count: reminders.length, reminders });
});

const addFollowUp = addScheduleEntry('followUps');
const updateFollowUp = updateScheduleEntry('followUps');
const deleteFollowUp = deleteScheduleEntry('followUps');
const addFamilySession = addScheduleEntry('familySessions');
const updateFamilySession = updateScheduleEntry('familySessions');
const deleteFamilySession = deleteScheduleEntry('familySessions');
const getFollowUps = listScheduleEntries('followUps', { groupByAssignedDoctor: true });
const getFamilySessions = listScheduleEntries('familySessions', { groupByAssignedPsychologist: true });

module.exports = {
  getPatients,
  checkPatientCode,
  getDashboardStats,
  getStaffDashboardStats,
  getPaymentsLedger,
  getPatientById,
  deletePatient,
  getPatientCallLogs,
  createPatient,
  getPendingApprovals,
  approvePatient,
  updatePatientStatus,
  updatePatient,
  updatePatientStage,
  addStagePayment,
  updateStagePayment,
  deleteStagePayment,
  approveStagePayment,
  uploadStageRecord,
  deleteStageRecordScan,
  requestStageMedicine,
  listMedicineRequests,
  updateMedicineRequestStatus,
  listCourierRequests,
  updateCourierRequest,
  addFollowUp,
  updateFollowUp,
  deleteFollowUp,
  addFamilySession,
  updateFamilySession,
  deleteFamilySession,
  getFollowUps,
  getFamilySessions,
  getScheduleReminders,
};

const formatActivityEntry = (entry) => ({
  id: entry._id,
  action: entry.action,
  details: entry.details || '',
  actorName: entry.actorName || 'System',
  actorRole: entry.actorRole || '',
  createdAt: entry.createdAt,
});
