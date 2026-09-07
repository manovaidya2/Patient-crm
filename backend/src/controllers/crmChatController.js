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

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const crmChatStopWords = new Set([
  'mujhe', 'jaan', 'janna', 'hai', 'hain', 'hoga', 'hogi', 'kaise', 'kaisa', 'kaisi', 'kuch', 'nahi', 'nhi',
  'batao', 'bataye', 'bata', 'kya', 'kab', 'kis', 'kiski', 'kitni', 'kitna', 'chal', 'raha', 'rha', 'rhi',
  'patient', 'patients', 'followup', 'followups', 'follow-up', 'follow-ups', 'session', 'sessions', 'family',
  'payment', 'payments', 'medicine', 'courier', 'doctor', 'advice', 'problem', 'problems', 'issue', 'issues',
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'about', 'tell', 'show', 'what', 'when', 'how', 'many',
]);

const extractSearchTerms = (message = '') =>
  String(message)
    .split(/[^a-zA-Z0-9\u0900-\u097F]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !crmChatStopWords.has(item.toLowerCase()))
    .slice(0, 8);

const hasPatientIntent = (message = '') => /\b(patient|patients|pt-|follow[- ]?up|family session|medicine|courier|payment)\b/i.test(message);

const hasBroadListIntent = (message = '') => /\b(all|total|today|kal|yesterday|month|monthly|week|weekly|recent|latest|pending|late|delivered|income|expense|inventory|stock|worksheet|staff|counselor|doctor|manager)\b/i.test(message);

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
    },
  };
};

const summarizePatient = (patient) => ({
  id: patient._id,
  patientCode: patient.patientCode || '',
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
  ] = await Promise.all([
    Patient.countDocuments(),
    User.find({ isActive: true }).select('name role phone').sort({ name: 1 }).limit(80),
    Patient.find(patientSearch)
      .select('patientName patientCode category age number alternateNumber guardianName relativeName currentStage assignedDoctor assignedPsychologist stages activityLog createdAt')
      .populate('assignedDoctor', 'name')
      .populate('assignedPsychologist', 'name')
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
  ]);

  const sourcePatients = matchingPatients.length ? matchingPatients : broadListIntent ? recentPatients : [];
  const monthIncome = accountEntries.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const monthExpense = accountEntries.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);

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
      lowStockItems: lowStockItems.length,
    },
    queryUnderstanding: {
      searchTermsUsed: terms,
      patientIntent,
      broadListIntent,
      matchedPatients: matchingPatients.length,
      needsPatientIdentifier: patientIntent && !matchingPatients.length && !broadListIntent,
    },
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
        patientCode: entry.patient?.patientCode || '',
        stage: entry.stage,
        urgent: Boolean(entry.isUrgent),
        query: entry.query,
        requestedBy: entry.requestedByName,
        at: formatDate(entry.createdAt),
      })),
      recentGiven: givenAdvice.map((entry) => ({
        patient: entry.patient?.patientName || '',
        patientCode: entry.patient?.patientCode || '',
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
  'You can help with questions about patients, staff, payments, medicines, courier/delivery, inventory, doctor advice requests, worksheets, calls, follow-ups, family sessions, and activity timelines — summarizing relevant CRM data with dates, counts, and specific details when available.',

  // Patient identification
  'If the question needs a specific patient but none is identified (queryUnderstanding.needsPatientIdentifier is true), don\'t guess or use a random/recent patient — ask the user for the patient\'s name, ID, or phone number first.',

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
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 1400),
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
        max_output_tokens: 350,
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
