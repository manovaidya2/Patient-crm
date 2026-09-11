const CrmChatConversation = require('../models/CrmChatConversation');
const Patient = require('../models/Patient');
const CallLog = require('../models/CallLog');
const AdviceRequest = require('../models/AdviceRequest');
const AccountEntry = require('../models/AccountEntry');
const MedicineInventory = require('../models/MedicineInventory');
const WorksheetManualRow = require('../models/WorksheetManualRow');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const canUseCrmChat = (user) => [ROLES.ADMIN, ROLES.DOCTOR].includes(user.role);

const formatConversation = (conversation, { includeMessages = false } = {}) => ({
  id: conversation._id,
  title: conversation.title || 'New Chat',
  owner: conversation.owner,
  ownerName: conversation.ownerName || '',
  lastMessageAt: conversation.lastMessageAt,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  ...(includeMessages
    ? {
        messages: (conversation.messages || []).map((message) => ({
          id: message._id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
      }
    : {}),
});

const requireCrmChatAccess = (req, res) => {
  if (!canUseCrmChat(req.user)) {
    res.status(403).json({ success: false, message: 'Only Admin or Doctor can use CRM Assistant' });
    return false;
  }
  return true;
};

const buildTitle = (message = '') => {
  const clean = String(message).replace(/\s+/g, ' ').trim();
  if (!clean) return 'New Chat';
  return clean.length > 52 ? `${clean.slice(0, 52)}...` : clean;
};

const formatDate = (value) => (value ? new Date(value).toLocaleString('en-IN') : '-');

const formatDateOnly = (value) => {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return formatDate(value);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN');
};

// Same fallback the frontend uses so a webhook patient with no code is still identifiable.
const formatPatientCode = (patient = {}) =>
  patient.patientCode || (patient._id ? `PT-${String(patient._id).slice(-6).toUpperCase()}` : '');

const toTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfMonth = () => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isDateTodayOrPast = (value) => {
  if (!value) return false;
  const dateValue = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return new Date(value) <= new Date();
  const today = new Date();
  const todayValue = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return dateValue <= todayValue;
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const crmChatStopWords = new Set([
  'mujhe', 'jaan', 'janna', 'hai', 'hain', 'hoga', 'hogi', 'kaise', 'kaisa', 'kaisi', 'kuch', 'nahi', 'nhi',
  'batao', 'bataye', 'bata', 'kya', 'kab', 'kis', 'kiski', 'kitni', 'kitna', 'chal', 'raha', 'rha', 'rhi',
  'patient', 'patients', 'followup', 'followups', 'follow-up', 'follow-ups', 'session', 'sessions', 'family',
  'payment', 'payments', 'medicine', 'courier', 'doctor', 'advice', 'problem', 'problems', 'issue', 'issues',
  'sabse', 'zyada', 'jada', 'kaam', 'work', 'activity', 'activities',
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'about', 'tell', 'show', 'what', 'when', 'how', 'many',
]);

const extractSearchTerms = (message = '') =>
  String(message)
    .split(/[^a-zA-Z0-9\u0900-\u097F]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !crmChatStopWords.has(item.toLowerCase()))
    .slice(0, 8);

const hasPatientIntent = (message = '') => /\b(patient|patients|pt-|follow[- ]?up|family session|medicine|courier|payment)\b/i.test(message);

const hasBroadListIntent = (message = '') => /\b(all|total|today|kal|yesterday|month|monthly|week|weekly|recent|latest|pending|late|due|connect|connected|reminder|supply|delivered|income|expense|inventory|stock|worksheet|staff|member|members|team|user|users|counselor|doctor|manager|sabse|zyada|jada|most|maximum|top|work|kaam|activity|activities)\b/i.test(message);

const getScheduleDisplayStatus = (entry = {}) => {
  if (entry.status === 'cancelled') return 'cancelled';
  if (entry.status === 'completed') {
    return entry.completedAt && entry.dateTime && new Date(entry.completedAt) > new Date(entry.dateTime)
      ? 'done_late'
      : 'done';
  }
  if (entry.status === 'scheduled' && entry.dateTime && new Date(entry.dateTime) < new Date()) return 'late';
  return 'upcoming';
};

const createScheduleCounts = () => ({
  total: 0,
  upcoming: 0,
  late: 0,
  done: 0,
  doneLate: 0,
  cancelled: 0,
});

const addScheduleCount = (counts, entry = {}) => {
  const status = getScheduleDisplayStatus(entry);
  if (status === 'cancelled') {
    counts.cancelled += 1;
    return;
  }
  counts.total += 1;
  if (status === 'done_late') counts.doneLate += 1;
  else if (status === 'done') counts.done += 1;
  else if (status === 'late') counts.late += 1;
  else counts.upcoming += 1;
};

const buildPatientWorkSummary = (patient, callCounts = {}, adviceCounts = {}) => {
  const patientId = String(patient._id);
  const summary = {
    patientCode: formatPatientCode(patient),
    patientName: patient.patientName || '',
    category: patient.category || '',
    currentStage: patient.currentStage,
    assignedDoctor: patient.assignedDoctor?.name || '',
    assignedPsychologist: patient.assignedPsychologist?.name || '',
    followUps: {
      normal: createScheduleCounts(),
      sfs: createScheduleCounts(),
      total: createScheduleCounts(),
    },
    familySessions: createScheduleCounts(),
    payments: {
      count: 0,
      amount: 0,
    },
    calls: callCounts[patientId] || { total: 0, withRecording: 0, totalDurationSeconds: 0 },
    doctorAdvice: adviceCounts[patientId] || { pending: 0, urgent: 0, given: 0, total: 0 },
    medicine: {
      requested: 0,
      inProcess: 0,
      made: 0,
      sentToCourier: 0,
      supplyTracked: 0,
      connectDue: 0,
      connected: 0,
    },
    courier: {
      pending: 0,
      dispatched: 0,
      delivered: 0,
    },
    activityLogCount: (patient.activityLog || []).length,
    latestActivity: (patient.activityLog || []).slice(-5).reverse().map((activity) => ({
      action: activity.action,
      details: activity.details,
      by: activity.actorName || 'System',
      at: formatDate(activity.createdAt),
    })),
  };

  (patient.stages || []).forEach((stage) => {
    (stage.followUps || []).forEach((entry) => {
      const type = entry.followUpType === 'sfs' ? 'sfs' : 'normal';
      addScheduleCount(summary.followUps[type], entry);
      addScheduleCount(summary.followUps.total, entry);
    });

    (stage.familySessions || []).forEach((entry) => {
      addScheduleCount(summary.familySessions, entry);
    });

    (stage.payments || []).forEach((payment) => {
      summary.payments.count += 1;
      summary.payments.amount += Number(payment.amount || 0);
    });

    const medicine = stage.medicineRequest || {};
    if (medicine.status && medicine.status !== 'not_requested') {
      summary.medicine.requested += 1;
      if (medicine.status === 'in_process') summary.medicine.inProcess += 1;
      if (['made', 'sent_to_courier'].includes(medicine.status)) summary.medicine.made += 1;
      if (medicine.status === 'sent_to_courier') summary.medicine.sentToCourier += 1;
    }
    if (
      stage.medicineMonthsGiven
      || stage.medicineNextConnectDate
      || stage.medicineTakenDate
      || stage.medicineFullyGiven
      || stage.medicineConnectDone
      || stage.medicineNextConnectNote
    ) {
      summary.medicine.supplyTracked += 1;
    }
    if (stage.medicineConnectDone) summary.medicine.connected += 1;
    if (stage.medicineNextConnectDate && !stage.medicineConnectDone && isDateTodayOrPast(stage.medicineNextConnectDate)) {
      summary.medicine.connectDue += 1;
    }

    const courierStatus = medicine.courier?.status;
    if (courierStatus === 'pending' && medicine.status === 'sent_to_courier') summary.courier.pending += 1;
    if (courierStatus === 'dispatched') summary.courier.dispatched += 1;
    if (courierStatus === 'delivered') summary.courier.delivered += 1;
  });

  summary.totalWorkScore =
    summary.followUps.total.total
    + summary.familySessions.total
    + summary.payments.count
    + summary.calls.total
    + summary.doctorAdvice.total
    + summary.medicine.requested
    + summary.medicine.supplyTracked
    + summary.medicine.connectDue
    + summary.courier.pending
    + summary.courier.dispatched
    + summary.courier.delivered
    + summary.activityLogCount;

  return summary;
};

const normalizeMemberKey = (name = '') => String(name || '').trim().toLowerCase();

const buildMemberWorkSummary = (users = [], patients = [], adviceRequests = [], worksheetRows = []) => {
  const membersByName = new Map();
  const activeMemberNames = new Set(users.map((user) => normalizeMemberKey(user.name)));

  const ensureMember = (name, role = '', phone = '', { allowNew = false } = {}) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return null;
    const key = normalizeMemberKey(cleanName);
    if (!allowNew && !activeMemberNames.has(key)) return null;
    if (!membersByName.has(key)) {
      membersByName.set(key, {
        name: cleanName,
        role: role || '',
        phone: phone || '',
        totalRecords: 0,
        patientTimelineActions: 0,
        followUpsScheduled: 0,
        familySessionsScheduled: 0,
        paymentsRecorded: 0,
        paymentEdits: 0,
        medicineActions: 0,
        courierActions: 0,
        adviceRequested: 0,
        adviceGiven: 0,
        worksheetRecords: 0,
        actionCounts: {},
        latestRecords: [],
      });
    }
    const member = membersByName.get(key);
    if (!member.role && role) member.role = role;
    if (!member.phone && phone) member.phone = phone;
    return member;
  };

  const addRecord = (name, field, record = {}) => {
    const member = ensureMember(name, record.role);
    if (!member) return;
    member[field] += 1;
    member.totalRecords += 1;
    if (record.action) {
      member.actionCounts[record.action] = (member.actionCounts[record.action] || 0) + 1;
    }
    if (record.description || record.action) {
      member.latestRecords.push({
        action: record.action || field,
        details: record.description || '',
        patientName: record.patientName || '',
        patientCode: record.patientCode || '',
        at: formatDate(record.at),
      });
    }
  };

  users.forEach((user) => ensureMember(user.name, user.role, user.phone || '', { allowNew: true }));

  patients.forEach((patient) => {
    (patient.activityLog || []).forEach((activity) => {
      addRecord(activity.actorName, 'patientTimelineActions', {
        action: activity.action,
        description: activity.details,
        patientName: patient.patientName,
        patientCode: formatPatientCode(patient),
        role: activity.actorRole,
        at: activity.createdAt,
      });
    });

    (patient.stages || []).forEach((stage) => {
      (stage.followUps || []).forEach((entry) => {
        addRecord(entry.createdByName, 'followUpsScheduled', {
          action: `${entry.followUpType === 'sfs' ? 'SFS' : 'Normal'} follow-up scheduled`,
          patientName: patient.patientName,
          patientCode: formatPatientCode(patient),
          at: entry.createdAt || entry.dateTime,
        });
      });

      (stage.familySessions || []).forEach((entry) => {
        addRecord(entry.createdByName, 'familySessionsScheduled', {
          action: 'Family session scheduled',
          patientName: patient.patientName,
          patientCode: formatPatientCode(patient),
          at: entry.createdAt || entry.dateTime,
        });
      });

      (stage.payments || []).forEach((payment) => {
        addRecord(payment.recordedByName, 'paymentsRecorded', {
          action: 'Payment recorded',
          description: payment.amount ? `Amount ${payment.amount}` : '',
          patientName: patient.patientName,
          patientCode: formatPatientCode(patient),
          at: payment.createdAt || payment.date,
        });
        addRecord(payment.editedByName, 'paymentEdits', {
          action: 'Payment edited',
          patientName: patient.patientName,
          patientCode: formatPatientCode(patient),
          at: payment.editedAt,
        });
      });

      const medicine = stage.medicineRequest || {};
      [
        [medicine.requestedByName, 'Medicine requested', medicine.requestedAt],
        [medicine.inProcessByName, 'Medicine marked in process', medicine.inProcessAt],
        [medicine.madeByName, 'Medicine made', medicine.madeAt],
        [medicine.sentToCourierByName, 'Medicine sent to courier', medicine.sentToCourierAt],
      ].forEach(([name, action, at]) => {
        addRecord(name, 'medicineActions', {
          action,
          patientName: patient.patientName,
          patientCode: formatPatientCode(patient),
          at,
        });
      });

      [
        [medicine.courier?.dispatchedByName, 'Courier dispatched', medicine.courier?.dispatchedAt],
        [medicine.courier?.deliveredByName, 'Courier delivered', medicine.courier?.deliveredAt],
      ].forEach(([name, action, at]) => {
        addRecord(name, 'courierActions', {
          action,
          patientName: patient.patientName,
          patientCode: formatPatientCode(patient),
          at,
        });
      });
    });
  });

  adviceRequests.forEach((entry) => {
    addRecord(entry.requestedByName, 'adviceRequested', {
      action: entry.isUrgent ? 'Urgent doctor advice requested' : 'Doctor advice requested',
      patientName: entry.patient?.patientName || '',
      patientCode: entry.patient ? formatPatientCode(entry.patient) : '',
      role: entry.requestedByRole,
      at: entry.createdAt,
    });
    addRecord(entry.adviceGivenByName, 'adviceGiven', {
      action: 'Doctor advice given',
      patientName: entry.patient?.patientName || '',
      patientCode: entry.patient ? formatPatientCode(entry.patient) : '',
      at: entry.adviceGivenAt,
    });
  });

  worksheetRows.forEach((row) => {
    addRecord(row.userName, 'worksheetRecords', {
      action: row.workType,
      description: row.details,
      patientName: row.patientName,
      patientCode: row.patientCode,
      role: row.userRole,
      at: row.createdAt || row.workDate,
    });
  });

  return Array.from(membersByName.values())
    .map((member) => ({
      ...member,
      latestRecords: member.latestRecords
        .filter((record) => record.at && record.at !== '-')
        .slice(-8)
        .reverse(),
    }))
    .sort((a, b) => b.totalRecords - a.totalRecords || a.name.localeCompare(b.name));
};

const summarizeStage = (stage) => {
  const followUps = stage.followUps || [];
  const familySessions = stage.familySessions || [];
  const payments = stage.payments || [];
  const medicine = stage.medicineRequest || {};
  return {
    stage: stage.number,
    status: stage.status,
    packageName: stage.packageName || '',
    totalAmount: stage.totalAmount || 0,
    paidAmount: payments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0),
    payments: payments.length,
    followUps: {
      total: followUps.length,
      completed: followUps.filter((item) => item.status === 'completed').length,
      scheduled: followUps.filter((item) => item.status === 'scheduled').length,
      late: followUps.filter((item) => item.status === 'scheduled' && new Date(item.dateTime) < new Date()).length,
      latest: followUps.slice(-8).reverse().map((item) => ({
        dateTime: formatDate(item.dateTime),
        status: item.status,
        displayStatus: item.status === 'scheduled' && new Date(item.dateTime) < new Date() ? 'late' : item.status,
        type: item.followUpType || 'normal',
        notes: item.notes || '',
        completedAt: formatDate(item.completedAt),
        talkedWith: item.completionName || '',
        completionDetails: item.completionDetails || '',
      })),
    },
    familySessions: {
      total: familySessions.length,
      completed: familySessions.filter((item) => item.status === 'completed').length,
      scheduled: familySessions.filter((item) => item.status === 'scheduled').length,
      late: familySessions.filter((item) => item.status === 'scheduled' && new Date(item.dateTime) < new Date()).length,
      latest: familySessions.slice(-8).reverse().map((item) => ({
        dateTime: formatDate(item.dateTime),
        status: item.status,
        displayStatus: item.status === 'scheduled' && new Date(item.dateTime) < new Date() ? 'late' : item.status,
        notes: item.notes || '',
        completedAt: formatDate(item.completedAt),
        talkedWith: item.completionName || '',
        completionDetails: item.completionDetails || '',
      })),
    },
    medicine: {
      status: medicine.status || 'not_requested',
      medicines: medicine.medicines || '',
      requestedAt: formatDate(medicine.requestedAt),
      requestedBy: medicine.requestedByName || '',
      courierStatus: medicine.courier?.status || '',
      trackingNumber: medicine.courier?.trackingNumber || '',
      courierPartner: medicine.courier?.courierPartner || '',
      deliveredAt: formatDate(medicine.courier?.deliveredAt),
      supply: {
        monthsGiven: Number(stage.medicineMonthsGiven || 0),
        nextConnectDate: formatDateOnly(stage.medicineNextConnectDate),
        reminderNote: stage.medicineNextConnectNote || '',
        connected: Boolean(stage.medicineConnectDone),
        connectedAt: formatDate(stage.medicineConnectedAt),
        connectedBy: stage.medicineConnectedByName || '',
        connectDue: Boolean(stage.medicineNextConnectDate && !stage.medicineConnectDone && isDateTodayOrPast(stage.medicineNextConnectDate)),
        fullMedicineTakenDate: formatDateOnly(stage.medicineTakenDate),
        fullMedicineGiven: Boolean(stage.medicineFullyGiven),
      },
    },
  };
};

const summarizePatient = (patient) => ({
  patientCode: formatPatientCode(patient),
  patientName: patient.patientName,
  age: patient.age,
  category: patient.category,
  phone: patient.number,
  alternateNumber: patient.alternateNumber || '',
  guardianOrRelative: patient.guardianName || patient.relativeName || '',
  currentStage: patient.currentStage,
  assignedDoctor: patient.assignedDoctor?.name || '',
  assignedPsychologist: patient.assignedPsychologist?.name || '',
  createdAt: formatDate(patient.createdAt),
  stages: (patient.stages || []).map(summarizeStage),
  recentActivity: (patient.activityLog || []).slice(-12).reverse().map((activity) => ({
    action: activity.action,
    details: activity.details,
    by: activity.actorName || 'System',
    at: formatDate(activity.createdAt),
  })),
});

const buildCrmFeatureSummary = () => [
  'Patient management with category, stage, assignment, phone, alternate phone and record uploads',
  'Stage-wise package amount, payments, payment screenshots, paid/due calculation and edit tracking',
  'Stage-wise follow-ups, SFS short follow-ups, family sessions, mark done, reschedule, late reminders and PDFs',
  'Patient timeline with CRM actions, call logs and call recordings',
  'Doctor advice workflow with urgent requests, stage-wise requests, replies and edit history',
  'Medicine request workflow with prescription uploads, in-process, made images and courier handoff',
  'Stage-wise medicine supply tracking with months given, next connect date, reminder note, connected status and due reminders',
  'Courier workflow with dispatch, delivery, receiver details, proof images, payment and records',
  'Medicine inventory with stock, low-stock alerts, add/use/adjust history and value',
  'Payments ledger, income, expenses and accountant workflow',
  'Team worksheet with auto-filled CRM work and manual columns/rows',
  'Role-based access for Admin, Doctor, Manager, Assistant Doctor, Psychologist, Medicine, Courier and Accountant',
];

const buildCrmContext = async (message) => {
  const terms = extractSearchTerms(message);
  const patientIntent = hasPatientIntent(message);
  const broadListIntent = hasBroadListIntent(message);
  const patientSearch = terms.length
    ? {
        $or: terms.flatMap((term) => {
          const regex = new RegExp(escapeRegex(term), 'i');
          return [
            { patientName: regex },
            { patientCode: regex },
            { number: regex },
            { alternateNumber: regex },
            { guardianName: regex },
            { relativeName: regex },
          ];
        }),
      }
    : {};

  const today = startOfToday();
  const month = startOfMonth();
  const [
    patientCount,
    activeUsers,
    matchingPatients,
    recentPatients,
    recentCalls,
    pendingAdvice,
    givenAdvice,
    accountEntries,
    lowStockItems,
    worksheetRows,
    patientsForWorkSummary,
    patientCallLogs,
    patientAdviceRequests,
    worksheetRowsForMemberSummary,
    inventoryItems,
    accountTypeTotals,
  ] = await Promise.all([
    Patient.countDocuments(),
    // Admin is the system owner, not a team member — keep it out of every staff view.
    User.find({ isActive: true, role: { $ne: ROLES.ADMIN } }).select('name role phone').sort({ name: 1 }).limit(80),
    Patient.find(patientSearch)
      .select('patientName patientCode category age number alternateNumber guardianName relativeName currentStage assignedDoctor assignedPsychologist stages activityLog createdAt')
      .populate('assignedDoctor', 'name')
      .populate('assignedPsychologist', 'name')
      .populate('stages.postCounselor', 'name')
      .sort({ updatedAt: -1 })
      .limit(8),
    Patient.find({})
      .select('patientName patientCode category age number currentStage assignedDoctor assignedPsychologist activityLog updatedAt')
      .populate('assignedDoctor', 'name')
      .populate('assignedPsychologist', 'name')
      .sort({ updatedAt: -1 })
      .limit(8),
    CallLog.find({})
      .select('patientName phoneNumber callType durationSeconds actionCreationTime recordingFileUrl')
      .sort({ actionCreationTime: -1, createdAt: -1 })
      .limit(15),
    AdviceRequest.find({ status: 'requested' })
      .populate('patient', 'patientName patientCode')
      .sort({ isUrgent: -1, createdAt: -1 })
      .limit(15),
    AdviceRequest.find({ status: 'advice_given' })
      .populate('patient', 'patientName patientCode')
      .sort({ adviceGivenAt: -1, updatedAt: -1 })
      .limit(10),
    AccountEntry.find({ date: { $gte: month } }).sort({ date: -1, createdAt: -1 }).limit(30),
    MedicineInventory.find({ $expr: { $lte: ['$currentStock', '$lowStockAt'] } })
      .select('name unit currentStock lowStockAt lastUnitCost updatedAt')
      .sort({ currentStock: 1 })
      .limit(20),
    WorksheetManualRow.find({ workDate: { $gte: today } }).sort({ createdAt: -1 }).limit(30),
    Patient.find({})
      .select('patientName patientCode category number alternateNumber currentStage assignedDoctor assignedPsychologist stages activityLog createdAt')
      .populate('assignedDoctor', 'name')
      .populate('assignedPsychologist', 'name')
      .populate('stages.postCounselor', 'name')
      .sort({ updatedAt: -1 })
      .limit(1500),
    CallLog.find({ patient: { $ne: null } })
      .select('patient durationSeconds recordingFileUrl')
      .limit(5000),
    AdviceRequest.find({})
      .select('patient status isUrgent query advice stage requestedByName requestedByRole adviceGivenByName createdAt adviceGivenAt')
      .populate('patient', 'patientName patientCode')
      .sort({ createdAt: -1 })
      .limit(5000),
    WorksheetManualRow.find({}).sort({ createdAt: -1 }).limit(1000),
    MedicineInventory.find({})
      .select('name unit currentStock lowStockAt lastUnitCost updatedAt')
      .sort({ name: 1 })
      .limit(300),
    AccountEntry.aggregate([{ $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);

  const sourcePatients = matchingPatients.length ? matchingPatients : broadListIntent ? recentPatients : [];
  const monthIncome = accountEntries.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const monthExpense = accountEntries.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const callCountsByPatientId = patientCallLogs.reduce((counts, call) => {
    const patientId = String(call.patient || '');
    if (!patientId) return counts;
    counts[patientId] = counts[patientId] || { total: 0, withRecording: 0, totalDurationSeconds: 0 };
    counts[patientId].total += 1;
    counts[patientId].withRecording += call.recordingFileUrl ? 1 : 0;
    counts[patientId].totalDurationSeconds += Number(call.durationSeconds || 0);
    return counts;
  }, {});
  const adviceCountsByPatientId = patientAdviceRequests.reduce((counts, advice) => {
    const patientId = String(advice.patient || '');
    if (!patientId) return counts;
    counts[patientId] = counts[patientId] || { pending: 0, urgent: 0, given: 0, total: 0 };
    counts[patientId].total += 1;
    if (advice.status === 'requested') counts[patientId].pending += 1;
    if (advice.status === 'advice_given') counts[patientId].given += 1;
    if (advice.isUrgent) counts[patientId].urgent += 1;
    return counts;
  }, {});
  const overallPatientWorkSummary = patientsForWorkSummary
    .map((patient) => buildPatientWorkSummary(patient, callCountsByPatientId, adviceCountsByPatientId))
    .sort((a, b) => b.totalWorkScore - a.totalWorkScore)
    .slice(0, 30);
  const memberWorkSummary = buildMemberWorkSummary(
    activeUsers,
    patientsForWorkSummary,
    patientAdviceRequests,
    worksheetRowsForMemberSummary
  );

  // Ready-made cross-patient lists so the assistant can answer "list do / kitne hue /
  // aaj ke / is mahine ke" questions without a specific patient being named.
  const courierList = [];
  const medicineRequestList = [];
  const medicineSupplyList = [];
  const paymentsList = [];
  const followUpList = [];
  const familySessionList = [];

  const scheduleRow = (patient, stage, entry, type) => ({
    patient: patient.patientName || '',
    patientCode: formatPatientCode(patient),
    stage: stage.number,
    type,
    dateTime: formatDate(entry.dateTime),
    status: getScheduleDisplayStatus(entry),
    scheduledBy: entry.createdByName || '',
    completedAt: formatDate(entry.completedAt),
    talkedWith: entry.completionName || '',
    notes: entry.notes || '',
    completionDetails: entry.completionDetails || '',
    _ts: toTime(entry.completedAt) || toTime(entry.dateTime),
  });

  patientsForWorkSummary.forEach((patient) => {
    (patient.stages || []).forEach((stage) => {
      const medicine = stage.medicineRequest || {};
      const hasMedicineSupplyRecord =
        stage.medicineMonthsGiven
        || stage.medicineNextConnectDate
        || stage.medicineTakenDate
        || stage.medicineFullyGiven
        || stage.medicineConnectDone
        || stage.medicineNextConnectNote;
      if (hasMedicineSupplyRecord) {
        medicineSupplyList.push({
          patient: patient.patientName || '',
          patientCode: formatPatientCode(patient),
          stage: stage.number,
          monthsGiven: Number(stage.medicineMonthsGiven || 0),
          nextConnectDate: formatDateOnly(stage.medicineNextConnectDate),
          reminderNote: stage.medicineNextConnectNote || '',
          connected: Boolean(stage.medicineConnectDone),
          connectedAt: formatDate(stage.medicineConnectedAt),
          connectedBy: stage.medicineConnectedByName || '',
          connectDue: Boolean(stage.medicineNextConnectDate && !stage.medicineConnectDone && isDateTodayOrPast(stage.medicineNextConnectDate)),
          fullMedicineTakenDate: formatDateOnly(stage.medicineTakenDate),
          fullMedicineGiven: Boolean(stage.medicineFullyGiven),
          postCounselor: stage.postCounselor?.name || '',
          assignedDoctor: patient.assignedDoctor?.name || '',
          _ts: toTime(stage.medicineConnectedAt) || toTime(stage.medicineNextConnectDate) || toTime(stage.medicineTakenDate),
        });
      }

      if (medicine.status && medicine.status !== 'not_requested') {
        medicineRequestList.push({
          patient: patient.patientName || '',
          patientCode: formatPatientCode(patient),
          stage: stage.number,
          status: medicine.status,
          medicines: medicine.medicines || '',
          requestedBy: medicine.requestedByName || '',
          requestedAt: formatDate(medicine.requestedAt),
          madeBy: medicine.madeByName || '',
          madeAt: formatDate(medicine.madeAt),
          sentToCourierAt: formatDate(medicine.sentToCourierAt),
          _ts: toTime(medicine.requestedAt) || toTime(medicine.madeAt),
        });
      }

      const courier = medicine.courier || {};
      const courierStarted =
        medicine.status === 'sent_to_courier' || ['dispatched', 'delivered'].includes(courier.status);
      if (courierStarted) {
        courierList.push({
          patient: patient.patientName || '',
          patientCode: formatPatientCode(patient),
          stage: stage.number,
          status: courier.status || 'pending',
          courierPartner: courier.courierPartner || '',
          trackingNumber: courier.trackingNumber || '',
          receiverName: courier.receiverName || '',
          receiverPhone: courier.receiverPhone || '',
          address: courier.address || '',
          dispatchedBy: courier.dispatchedByName || '',
          dispatchedAt: formatDate(courier.dispatchedAt),
          deliveredBy: courier.deliveredByName || '',
          deliveredAt: formatDate(courier.deliveredAt),
          receivedBy: courier.receivedByName || '',
          paidBy: courier.paymentPaidBy || '',
          paymentAmount: Number(courier.paymentAmount || 0),
          _ts: toTime(courier.deliveredAt) || toTime(courier.dispatchedAt) || toTime(medicine.sentToCourierAt),
        });
      }

      (stage.payments || []).forEach((payment) => {
        paymentsList.push({
          patient: patient.patientName || '',
          patientCode: formatPatientCode(patient),
          stage: stage.number,
          amount: Number(payment.amount || 0),
          paidOn: formatDate(payment.date),
          recordedOn: formatDate(payment.createdAt),
          paymentMode: payment.paymentMode || '',
          receivedBy: payment.receivedBy || payment.recordedByName || '',
          reference: payment.utr || payment.transactionId || '',
          _ts: toTime(payment.createdAt) || toTime(payment.date),
        });
      });

      (stage.followUps || []).forEach((entry) => {
        followUpList.push(scheduleRow(patient, stage, entry, entry.followUpType === 'sfs' ? 'sfs' : 'normal'));
      });
      (stage.familySessions || []).forEach((entry) => {
        familySessionList.push(scheduleRow(patient, stage, entry, 'family_session'));
      });
    });
  });

  const finalizeList = (rows, limit) =>
    rows
      .sort((a, b) => (b._ts || 0) - (a._ts || 0))
      .slice(0, limit)
      .map(({ _ts, ...rest }) => rest);

  const countByField = (rows, field) =>
    rows.reduce((acc, row) => {
      const key = row[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  const lifetimeIncome = (accountTypeTotals.find((row) => row._id === 'income') || {}).total || 0;
  const lifetimeExpense = (accountTypeTotals.find((row) => row._id === 'expense') || {}).total || 0;

  return {
    generatedAt: formatDate(new Date()),
    crmFeatureSummary: buildCrmFeatureSummary(),
    totals: {
      patients: patientCount,
      activeUsers: activeUsers.length,
      pendingAdvice: pendingAdvice.length,
      urgentAdvice: pendingAdvice.filter((item) => item.isUrgent).length,
      monthIncome,
      monthExpense,
      monthBalance: monthIncome - monthExpense,
      lifetimeIncome,
      lifetimeExpense,
      lifetimeBalance: lifetimeIncome - lifetimeExpense,
      lowStockItems: lowStockItems.length,
      courierTotal: courierList.length,
      courierDelivered: courierList.filter((row) => row.status === 'delivered').length,
      courierDispatched: courierList.filter((row) => row.status === 'dispatched').length,
      courierPending: courierList.filter((row) => row.status === 'pending').length,
      medicineRequestsTotal: medicineRequestList.length,
      medicineSupplyTracked: medicineSupplyList.length,
      medicineConnectDue: medicineSupplyList.filter((row) => row.connectDue).length,
      medicineConnectDone: medicineSupplyList.filter((row) => row.connected).length,
      paymentsTotal: paymentsList.length,
      paymentsAmount: paymentsList.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      followUpsTotal: followUpList.length,
      familySessionsTotal: familySessionList.length,
    },
    queryUnderstanding: {
      searchTermsUsed: terms,
      patientIntent,
      broadListIntent,
      matchedPatients: matchingPatients.length,
      needsPatientIdentifier: patientIntent && !matchingPatients.length && !broadListIntent,
    },
    overallPatientWorkSummary,
    memberWorkSummary,
    staff: activeUsers.map((user) => ({ name: user.name, role: user.role, phone: user.phone || '' })),
    patients: sourcePatients.map(summarizePatient),
    recentCalls: recentCalls.map((call) => ({
      patientName: call.patientName || '',
      phoneNumber: call.phoneNumber,
      type: call.callType,
      durationSeconds: call.durationSeconds,
      time: formatDate(call.actionCreationTime),
      hasRecording: Boolean(call.recordingFileUrl),
    })),
    doctorAdvice: {
      pending: pendingAdvice.map((entry) => ({
        patient: entry.patient?.patientName || '',
        patientCode: entry.patient ? formatPatientCode(entry.patient) : '',
        stage: entry.stage,
        urgent: Boolean(entry.isUrgent),
        query: entry.query,
        requestedBy: entry.requestedByName,
        at: formatDate(entry.createdAt),
      })),
      recentGiven: givenAdvice.map((entry) => ({
        patient: entry.patient?.patientName || '',
        patientCode: entry.patient ? formatPatientCode(entry.patient) : '',
        stage: entry.stage,
        advice: entry.advice,
        doctor: entry.adviceGivenByName,
        at: formatDate(entry.adviceGivenAt),
      })),
    },
    accountsThisMonth: accountEntries.map((entry) => ({
      type: entry.type,
      category: entry.category,
      amount: entry.amount,
      date: formatDate(entry.date),
      partyName: entry.partyName,
      referenceNumber: entry.referenceNumber,
      notes: entry.notes,
    })),
    lowStock: lowStockItems.map((item) => ({
      name: item.name,
      stock: item.currentStock,
      unit: item.unit,
      lowStockAt: item.lowStockAt,
      lastUnitCost: item.lastUnitCost,
    })),
    inventory: inventoryItems.map((item) => ({
      name: item.name,
      stock: item.currentStock,
      unit: item.unit,
      lowStockAt: item.lowStockAt,
      lastUnitCost: item.lastUnitCost,
      isLow: Number(item.currentStock) <= Number(item.lowStockAt),
    })),
    accountsLifetime: {
      income: lifetimeIncome,
      expense: lifetimeExpense,
      balance: lifetimeIncome - lifetimeExpense,
    },
    courierList: {
      total: courierList.length,
      byStatus: countByField(courierList, 'status'),
      list: finalizeList(courierList, 150),
    },
    medicineRequestList: {
      total: medicineRequestList.length,
      byStatus: countByField(medicineRequestList, 'status'),
      list: finalizeList(medicineRequestList, 150),
    },
    medicineSupplyList: {
      total: medicineSupplyList.length,
      due: medicineSupplyList.filter((row) => row.connectDue).length,
      connected: medicineSupplyList.filter((row) => row.connected).length,
      pendingConnect: medicineSupplyList.filter((row) => row.nextConnectDate !== '-' && !row.connected).length,
      list: finalizeList(medicineSupplyList, 200),
    },
    paymentsList: {
      total: paymentsList.length,
      totalAmount: paymentsList.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      list: finalizeList(paymentsList, 200),
    },
    followUpList: {
      total: followUpList.length,
      byStatus: countByField(followUpList, 'status'),
      list: finalizeList(followUpList, 220),
    },
    familySessionList: {
      total: familySessionList.length,
      byStatus: countByField(familySessionList, 'status'),
      list: finalizeList(familySessionList, 180),
    },
    doctorAdviceAll: patientAdviceRequests.slice(0, 120).map((entry) => ({
      patient: entry.patient?.patientName || '',
      patientCode: entry.patient ? formatPatientCode(entry.patient) : '',
      stage: entry.stage,
      status: entry.status,
      urgent: Boolean(entry.isUrgent),
      query: entry.query || '',
      advice: entry.advice || '',
      requestedBy: entry.requestedByName || '',
      requestedAt: formatDate(entry.createdAt),
      answeredBy: entry.adviceGivenByName || '',
      answeredAt: formatDate(entry.adviceGivenAt),
    })),
    worksheetToday: worksheetRows.map((row) => ({
      userName: row.userName,
      userRole: row.userRole,
      patientName: row.patientName,
      patientCode: row.patientCode,
      currentStage: row.currentStage,
      workType: row.workType,
      details: row.details,
      at: formatDate(row.createdAt),
    })),
  };
};

const systemPrompt = [
  // Identity & tone
  'You are the CRM Assistant inside Manovaidya Operation System. You talk like a helpful, sharp human assistant — the way ChatGPT normally responds: natural, warm, conversational sentences. You are NOT a report generator, so never use rigid labels like "Seedha jawab", "Direct answer:", or heading-style prefixes. Just answer like a person would in a chat.',

  'Never start a reply with a label, heading, or meta-phrase describing what kind of answer this is. Just answer directly in plain conversational language.',

  // Formatting
  'Default to flowing sentences, like a real conversation. Only use bullet points when listing 3 or more discrete items (like multiple patients, multiple records, multiple dates) — and even then, add a short natural sentence before or after the bullets so it doesn\'t feel like a dumped report. Do not bullet single facts — say them in a sentence.',

  // Language matching
  'Match the user\'s language and tone naturally: if they write in English, reply in English. If they write in Hindi (Devanagari) or Hinglish (Hindi in Roman script), reply in casual, natural Hinglish — the way people actually type it in chat, not textbook Hindi.',

  // Grounding rules
  'Only answer using the CRM context provided to you. Never invent, assume, or guess data that isn\'t there. If the CRM context doesn\'t contain the answer, say so naturally — e.g. "CRM me abhi ye record nahi mil raha" — instead of making something up.',

  'Use earlier messages in this chat as conversational memory (to understand follow-up questions, pronouns like "uska", "wo patient", etc.), but always trust the current CRM context over memory for actual facts and numbers.',

  // === Never leak the internal data shape ===
  'The CRM context is raw JSON for your eyes only. NEVER expose its structure in your reply: no field names, no JSON keys, no object paths, no code-style tokens. Do not write things like "courier.delivered = 1", "patientCode: (blank)", "status: null", "stage[0].payments", or raw database ids. Translate every value into a plain sentence a clinic staff member would say out loud.',

  'Never surface a missing or empty value as "(blank)", "null", "undefined", "N/A", "-", "0000", or empty quotes. If a detail is not recorded, either leave it out or say it in words — e.g. "delivery ki exact date CRM me note nahi hai" or "is patient ka code abhi tak assign nahi hua". ',

  'Every patient in the context has a patientCode (sometimes an auto one like PT-AB12CD). Always identify a patient by their name, and use the code as the secondary identifier. If the name is missing, use the code alone — never say the patient is blank/unknown when a code exists.',

  // === Admin is not a team member ===
  'Admin is the system owner, not staff. The context already excludes admin from staff and member lists. Never add admin back, never include admin in "kaun kaun members hain", work totals, or "sabse zyada kaam kisne kiya" comparisons. If an action was done by admin, a webhook, or the system, describe it as an automatic/system action without attributing it to a named person.',

  // === Ready-made lists for list / count questions ===
  'For "list do", "kitne hue", "kaun kaun", "aaj ke", "is hafte ke", "is mahine ke", "abhi tak kitne" style questions, use the ready-made lists in the context instead of digging through each patient: courierList (dispatches and deliveries with partner, tracking, receiver, dispatched/delivered dates and the staff member who did it), medicineRequestList, medicineSupplyList (months of medicine given, next connect date, reminder note/issue, connected status, due status, post counselor, assistant doctor, full medicine given/taken date), paymentsList, followUpList, familySessionList, doctorAdviceAll, recentCalls, accountsThisMonth, accountsLifetime, inventory and worksheetToday. Lead with the total, then give a clean itemised list with the real details (patient name + code, date, status, who did it). Each list also has a breakdown/total count when available — if the shown items are fewer than the total, say there are older records not listed here.',

  // === NEW: Deep, granular data usage ===
  'Do not limit yourself to top-level summary fields (like totals or counts) if the CRM context has deeper/nested data available. Actively look into every relevant sub-field, nested record, timestamp, note, and status flag connected to the question — even small details like a single field value, a specific note text, a specific timestamp, or a one-line remark — and use them if they help answer the question more completely.',

  'When the question involves numbers, trends, durations, comparisons, or patterns (e.g. "kitne din se pending hai", "average kitna time lagta hai", "is mahine kitne follow-up hue", "sabse zyada kis staff ne kaam kiya"), actually calculate the answer from the raw CRM records provided (counting, date differences, averages, sums, comparisons) instead of just stating a stored total. Show your calculated answer directly and simply, without showing the math/formula unless the user asks for the working.',

  'When summarizing something, do not stop at "how many" — also surface relevant smaller details that give real context, like which specific record, whose name, what exact status, what date, or what note is behind that number, as long as it stays relevant to what was asked. Prefer being specific over being generic.',

  // === NEW: Understanding unclear/ambiguous questions ===
  'Users often ask questions that are short, informal, or ambiguous (e.g. incomplete sentences, vague words like "wo wala", "aajkal kaisa chal raha hai", "kuch pending to nahi"). In such cases, do not ask for clarification immediately — first try hard to infer the most likely intent using: the conversation so far, the CRM context available, and common sense about what a clinic assistant would realistically be asking. Answer based on your best reasonable interpretation.',

  'Only ask a clarifying question if the request is genuinely impossible to answer safely without more info (like needing a specific patient identity when multiple patients could match, per the patient identification rule below). Otherwise, make a sensible assumption, answer confidently, and if relevant, briefly mention what you assumed (e.g. "maan ke chal raha hoon aap Aarav Sharma ke baare me pooch rahe hain") so the user can correct you if wrong.',

  // Read-only boundary
  'You are strictly read-only for CRM data. Never create, update, delete, mark complete, reschedule, assign, upload, or edit any CRM record through this chat — even if asked. If the user wants to make a change, tell them warmly where to go in the CRM UI to do it themselves.',

  // Domain coverage
  'You can help with questions about patients, staff, payments, medicines, medicine supply/connect reminders, courier/delivery, inventory, doctor advice requests, worksheets, calls, follow-ups, family sessions, and activity timelines — summarizing relevant CRM data with dates, counts, and specific details when available.',

  'For questions about overall CRM work, patient activity, "sabse zyada kaam", "most active patient", "kis patient par kya kya hua", or general progress, use overallPatientWorkSummary first. Do not answer from doctorAdvice alone. Compare the whole patient record: normal follow-ups, SFS follow-ups, family sessions, completed items, late items, done-late items, calls/recordings, payments, medicine request, medicine supply/connect due status, courier status, doctor advice, and timeline activity. Mention the main reason why one patient ranks higher, with counts from these categories.',

  'When talking about one patient, cover their CRM activity broadly if relevant: follow-ups scheduled/done/late/done-late, SFS, family sessions scheduled/done/late/done-late, payments, calls, doctor advice, medicine request, medicine supply details (months given, next connect date, reminder note/issue, connected or due), courier, and recent timeline actions. If a category has no record, say that briefly instead of ignoring other categories.',

  'For questions about members, staff, team, users, counselor records, account list, "members ki records", or "kaun-kaun members hain", use memberWorkSummary and staff. First give the complete registered member list with name and role. If the user asks for records/accounts too, then add each member totalRecords and key record counts after the list. Do not skip members, do not stop after one or two names, and do not answer only with doctor records unless the user specifically asks for doctors.',

  // Patient identification
  'If the question needs a specific patient but none is identified (queryUnderstanding.needsPatientIdentifier is true), don\'t guess or use a random/recent patient — ask the user for the patient\'s name, ID, or phone number first. But if the question is a general or aggregate one ("kitne courier deliver hue", "aaj ke follow-ups", "is mahine ke payments", "pending medicine requests"), do NOT ask for a patient — answer straight from the ready-made lists.',

  'If exactly one patient matches, answer specifically about them. If multiple patients match, ask which one they mean and give brief identifying details (name + one more identifier) so they can pick.',

  // Follow-up / family session health questions
  'For questions like "kaise chal raha hai" or "koi problem hai kya" about a patient\'s progress, base your answer on completed session notes, completion status, and recent activity — read through the actual note text, not just the status field. If the notes don\'t mention any issue, say clearly that no problem is recorded in the CRM — don\'t imply that means there\'s no medical issue at all.',

  // CRM feedback questions
'If asked whether the CRM is good, or what it can do, or what more can be added, respond warmly and just describe what the CRM currently does well — mention its real capabilities for patient and clinic management based on the context you have. Do not suggest, recommend, or brainstorm any improvements, new features, or ideas — even if the user seems to be hinting at wanting suggestions. Stick only to describing what already exists.',

  // Length & focus
  'Keep responses focused and to the point — like a knowledgeable assistant who respects the user\'s time. Don\'t pad with disclaimers or repeat the question back before answering. Being thorough with details is good, but don\'t ramble — every detail you include should directly help answer the question.',
  'Format the answer with breathing room: use short paragraphs, blank lines between sections, and bullet points only for lists. Do not put many different records in one long paragraph.',
  'Always finish the answer cleanly. Do not end mid-sentence or leave the last thought incomplete.',
].join('\n\n');

const extractOpenAiText = (data = {}) =>
  data.output_text
  || (data.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => item.text || '')
    .join('\n')
    .trim();

const callOpenAi = async (payload, apiKey) => {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  return response.json();
};

const looksIncomplete = (text = '', data = {}) => {
  if (data.status === 'incomplete' || data.incomplete_details) return true;
  const clean = text.trim();
  if (!clean) return false;
  return !/[.!?।)"']$/.test(clean) && /\s+[A-Za-z\u0900-\u097F]{2,}$/.test(clean);
};

const getOpenAiReply = async ({ crmContext, conversation, userMessage }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return 'OpenAI API key is not configured yet. Add OPENAI_API_KEY in backend .env, then restart the backend. After that I will answer using this CRM data.';
  }

  const history = (conversation.messages || []).slice(-12, -1).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const basePayload = {
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    instructions: systemPrompt,
    input: [
      ...history,
      {
        role: 'user',
        content: `CRM_CONTEXT_JSON:\n${JSON.stringify(crmContext)}\n\nUSER_QUESTION:\n${userMessage}`,
      },
    ],
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 3200),
  };

  const data = await callOpenAi(basePayload, apiKey);
  let outputText = extractOpenAiText(data);

  if (looksIncomplete(outputText, data)) {
    const continuation = await callOpenAi(
      {
        ...basePayload,
        input: [
          ...basePayload.input,
          { role: 'assistant', content: outputText },
          {
            role: 'user',
            content: 'Your last answer stopped mid-sentence. Continue only the missing ending and finish cleanly. Do not repeat the full answer.',
          },
        ],
        max_output_tokens: 900,
      },
      apiKey
    );
    const continuationText = extractOpenAiText(continuation);
    if (continuationText) outputText = `${outputText.trim()} ${continuationText.trim()}`;
  }

  return outputText || 'I could not generate a response from the CRM context.';
};

const listConversations = asyncHandler(async (req, res) => {
  if (!requireCrmChatAccess(req, res)) return;

  const search = String(req.query.search || '').trim();
  const filter = req.user.role === ROLES.ADMIN ? {} : { owner: req.user._id };
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { 'messages.content': { $regex: search, $options: 'i' } },
    ];
  }

  const conversations = await CrmChatConversation.find(filter)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(80);

  res.status(200).json({ success: true, conversations: conversations.map(formatConversation) });
});

const createConversation = asyncHandler(async (req, res) => {
  if (!requireCrmChatAccess(req, res)) return;

  const title = String(req.body.title || '').trim() || 'New Chat';
  const conversation = await CrmChatConversation.create({
    title,
    owner: req.user._id,
    ownerName: req.user.name,
    messages: [],
    lastMessageAt: new Date(),
  });

  res.status(201).json({ success: true, conversation: formatConversation(conversation, { includeMessages: true }) });
});

const getConversation = asyncHandler(async (req, res) => {
  if (!requireCrmChatAccess(req, res)) return;

  const filter = req.user.role === ROLES.ADMIN ? { _id: req.params.id } : { _id: req.params.id, owner: req.user._id };
  const conversation = await CrmChatConversation.findOne(filter);
  if (!conversation) {
    return res.status(404).json({ success: false, message: 'Chat not found' });
  }

  res.status(200).json({ success: true, conversation: formatConversation(conversation, { includeMessages: true }) });
});

const sendMessage = asyncHandler(async (req, res) => {
  if (!requireCrmChatAccess(req, res)) return;

  const content = String(req.body.message || '').trim();
  if (!content) {
    return res.status(400).json({ success: false, message: 'Message is required' });
  }

  let conversation;
  if (req.params.id === 'new') {
    conversation = await CrmChatConversation.create({
      title: buildTitle(content),
      owner: req.user._id,
      ownerName: req.user.name,
      messages: [],
    });
  } else {
    conversation = await CrmChatConversation.findOne({ _id: req.params.id, owner: req.user._id });
  }

  if (!conversation) {
    return res.status(404).json({ success: false, message: 'Chat not found' });
  }

  conversation.messages.push({ role: 'user', content });
  if (!conversation.title || conversation.title === 'New Chat') {
    conversation.title = buildTitle(content);
  }

  const crmContext = await buildCrmContext(content);
  const assistantReply = await getOpenAiReply({ crmContext, conversation, userMessage: content });

  conversation.messages.push({ role: 'assistant', content: assistantReply });
  conversation.lastMessageAt = new Date();
  await conversation.save();

  res.status(200).json({ success: true, conversation: formatConversation(conversation, { includeMessages: true }) });
});

const deleteConversation = asyncHandler(async (req, res) => {
  if (!requireCrmChatAccess(req, res)) return;
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: 'Only Admin can delete chats' });
  }

  const conversation = await CrmChatConversation.findOneAndDelete({ _id: req.params.id });
  if (!conversation) {
    return res.status(404).json({ success: false, message: 'Chat not found' });
  }

  res.status(200).json({ success: true, deletedId: req.params.id });
});

module.exports = {
  listConversations,
  createConversation,
  getConversation,
  sendMessage,
  deleteConversation,
};
