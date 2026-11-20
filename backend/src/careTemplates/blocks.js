// Building blocks of the follow-up / family session / tracker forms (the clinic's MV-FU / MV-FS paper templates).
// A template is plain data: the backend validates and stores answers with it, the frontend renders it
// (frontend/src/components/care/CareForm.jsx). Answers are kept by block id: { [id]: value }.
//
// Template:  { code: 'FU-01', key: 'MV-FU-01', version, kind: 'followup' | 'family' | 'tracker', seq, day, title,
//              subtitle, meta: [[label, value], ...], sections: [{ title, time, blocks: [...] }] }
//
// Blocks (t = type). `show: { id, any: [values] }` shows a block only when that answer is one of the values
// (`not: [values]`: when it is answered and is none of them). `req: true` = must be filled before "Mark done".
//   say     { text }                        script the counsellor speaks ("काउंसलर बोले"); [Child Name], [Parent Name],
//                                           [Counsellor Name] are filled from the CRM.
//   note    { label, text, tone }           rule / info box (tone: rule | info | warn | danger)
//   response{ id }                          Step 1 call response: Available -> form goes on; Busy -> reschedule;
//                                           Not Connected -> call attempt (the call system of the session does it)
//   one     { id, label, options, other }   single choice ("other": the option that opens a text box)
//   many    { id, label, options, other }   multiple choice
//   text    { id, label, long, hint }       text (long = several lines)
//   date    { id, label }   time { id, label }
//   check   { id, label }                   one tick box
//   list    { id, label, items }            tick list (answer: the ticked items)
//   auto    { id, label, from, hint }       filled from the CRM (`from`, see careContext.js), staff can correct it
//   facts   { id, label, rows: [{ id, label, from, hint }] }   a table of auto rows (Section A / staff preparation)
//   grid    { id, label, rows: [{ id, label, options, other }] }  one single choice per row (CRM summary, papers)
//   matrix  { id, label, columns: [{ id, label, type: text|one|date, options }], rows: [{ id, label }] }
//   tasks   { id, rows }                    CRM task register (each row an issue, owner, due date, type, status)
//   triage  { id, problem }                 triage level (Emergency / Urgent Doctor Review / Routine Support); an
//                                           Emergency or Urgent answer sends the doctor an advice request
//   info    { head: [...], rows: [[...]] }  read-only table (what to answer when the parent asks ...)
//   link    { id, label, code, options }    status + date of another session of the schedule (filled from it)
//   final   { id, label, options, req }     the final status (single choice)

const MODE = ['Call', 'Video Call', 'WhatsApp', 'Clinic में'];
const SPOKE = ['Mother', 'Father', 'Both', 'Other'];
const RECORDING = ['Given', 'Not Given', 'लागू नहीं'];
const TASK_STATUS = ['Open', 'In Progress', 'Resolved'];
// Step 1 call response (the 'response' block). The first option lets the form go on; the others are handled by the
// session's call system (reschedule / call attempt).
const RESPONSE = ['Available → Start', 'Busy → Schedule Again', 'Not Connected → Follow Contact SOP'];
const RESPONSE_FAMILY = ['Available → Continue', 'Busy → Reschedule', 'Different Guardian → Authorization verify', 'Technical problem → Reschedule / Reconnect'];
const responseOptions = (block) => (Array.isArray(block?.options) && block.options.length ? block.options : block?.family ? RESPONSE_FAMILY : RESPONSE);

// ---- Call / session information ---------------------------------------------------------------------------------
const callInfo = ({ family = false, specialist = false } = {}) => ({
  title: family ? 'सेशन की जानकारी' : 'कॉल की जानकारी',
  blocks: [
    { t: 'facts', id: 'callIds', rows: [
      { id: 'sessionRef', label: family ? 'Session / Call ID' : 'Call / Session ID', from: 'sessionRef', hint: 'Auto' },
      { id: 'patientCode', label: 'Patient ID', from: 'patientCode', hint: 'Auto' },
      { id: 'callDate', label: family ? 'Session Date' : 'तारीख', from: 'today', hint: 'Date' },
      { id: 'counsellor', label: family ? 'Session Lead' : 'Counsellor', from: 'counsellor', hint: 'Staff' },
    ] },
    { t: 'note', tone: 'info', text: 'शुरू / ख़त्म / कुल समय अपने-आप दर्ज होता है: फ़ॉर्म खुलने से "Mark done" तक (Timer)।' },
    { t: 'one', id: 'mode', label: family ? 'Delivery Mode' : 'Mode', options: MODE, req: true },
    { t: 'one', id: 'spokeWith', label: family ? 'बात किससे हुई (Guardian Attended)' : 'बात किससे हुई', options: SPOKE, other: 'Other', req: true },
    { t: 'check', id: 'guardianVerified', label: 'Guardian identity verified' },
    ...(family ? [] : [{ t: 'one', id: 'recording', label: 'Recording Permission', options: RECORDING }]),
    ...(specialist ? [{ t: 'text', id: 'specialist', label: 'Specialist Involved', hint: 'Psychologist / Therapist / Doctor (ज़रूरत हो तो)' }] : []),
  ],
});

// Family sessions: consent before the session starts.
const consent = ({ recording = true } = {}) => ({
  title: 'Consent & Data Access',
  time: 'सेशन शुरू होने से पहले',
  blocks: [
    { t: 'note', tone: 'info', text: 'Call recording, Video या WhatsApp से बच्चे की जानकारी ली / दी जानी हो तो पहले अनुमति लें। Recording की अनुमति न मिले तो भी सेशन सामान्य रूप से document किया जा सकता है।' },
    { t: 'one', id: 'guardianConsent', label: 'Guardian Consent', options: ['Given', 'Not Given'] },
    ...(recording ? [{ t: 'one', id: 'recording', label: 'Recording Permission', options: ['Given', 'Not Given', 'Recording लागू नहीं'] }] : []),
    { t: 'one', id: 'dataSharing', label: 'Data Access / Sharing (WhatsApp, Video आदि)', options: ['Allowed', 'Limited', 'Not Allowed'], other: 'Limited' },
  ],
});

// ---- Step 1: greeting and the parent's response (drives the call system) -------------------------------------------
const greeting = ({ title = 'STEP 01 — GREETING', time = 'लगभग 30 सेकंड', say, family = false }) => ({
  title, time,
  blocks: [
    { t: 'say', text: say },
    { t: 'response', id: 'response', label: family ? 'Parent Response' : 'Response', family, req: true },
  ],
});

// ---- Triage (safety) ---------------------------------------------------------------------------------------------
const URGENT_TEXT = 'दवा के बाद नई / बढ़ी तकलीफ़, उल्टी, पेट खराब, एलर्जी, ज़्यादा सुस्ती, गंभीर या लगातार नींद की समस्या, पानी की कमी के संकेत, पेशाब-शौच की बड़ी दिक्कत, अचानक regression / skill का खोना: Doctor Review Task आज ही। इन्हें अगले follow-up तक अपने-आप न टालें।';
const TRIAGE_LEVELS = [
  { value: 'Emergency', timing: 'तुरंत — कॉल के दौरान ही', action: 'गंभीर एलर्जी, साँस की तकलीफ़, दौरे या दूसरे emergency संकेत: परिवार को तुरंत emergency medical care की सलाह दें और clinic escalation करें।' },
  { value: 'Urgent Doctor Review', timing: 'Clinical Lead के approved समय-सीमा के अनुसार (लक्ष्य: उसी दिन)', action: URGENT_TEXT },
  { value: 'Routine Support', timing: '____ कार्यदिवस में (Clinical Lead तय करें)', action: 'सिर्फ़ दवा देने के तरीके / समय की असुविधा या सामान्य सवाल: अगले निर्धारित contact में। कोई नया clinical symptom इस श्रेणी में नहीं आता।' },
];
const triage = ({ id = 'triage', show, family = false } = {}) => [
  { t: 'triage', id, label: 'Triage Level (एक चुनें)', levels: family ? TRIAGE_LEVELS.map((l) => (l.value === 'Urgent Doctor Review' ? { ...l, value: 'Urgent Doctor Review' } : l)) : TRIAGE_LEVELS, show },
  { t: 'text', id: `${id}EscalateTo`, label: 'Escalate किसे / कब', show: show || { id, any: ['Emergency', 'Urgent Doctor Review', 'Routine Support'] } },
  { t: 'note', tone: 'info', text: 'Emergency या Urgent Doctor Review चुनने पर form save होते ही doctor को advice request अपने-आप जाती है (Task ID वहीं से)।', show: show || { id, any: ['Emergency', 'Urgent Doctor Review'] } },
];

// FU-02 ... FU-07: the safety screen asked first.
const NEW_CONCERN = ['No New Concern', 'New Concern', 'Existing Concern Worsened'];
const safetyScreen = ({ say, rule = true }) => ({
  title: 'STEP 02 — SAFETY SCREEN (सबसे पहले)',
  time: '30–40 सेकंड',
  blocks: [
    { t: 'say', text: say },
    { t: 'one', id: 'safety', label: 'Safety', options: NEW_CONCERN, req: true },
    { t: 'say', text: 'यदि Yes — “क्या परेशानी है, कब से है और कितनी बार हो रही है?”', show: { id: 'safety', not: ['No New Concern'] } },
    { t: 'matrix', id: 'concern', columns: [{ id: 'value', label: 'विवरण', type: 'text' }], rows: [
      { id: 'symptom', label: 'Symptom' }, { id: 'onset', label: 'Onset / Frequency' }, { id: 'severity', label: 'Severity' }, { id: 'medicine', label: 'Suspected Medicine' },
    ], show: { id: 'safety', not: ['No New Concern'] } },
    ...triage({ show: { id: 'safety', not: ['No New Concern'] } }),
    ...(rule ? [{ t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Medicine dose, timing या procedure अपनी तरफ़ से नहीं बदलना। गंभीर लक्षण या emergency संकेत पर तत्काल चिकित्सकीय सहायता की सलाह और clinical escalation करें।' }] : []),
  ],
});

// ---- Medicine continuity (FU-02 ... FU-07) ---------------------------------------------------------------------
const SLOTS = ['M1 सुबह खाली पेट', 'M2 सुबह–शाम', 'M3 दोपहर–रात', 'M4 रात की दवाई', 'M5 Nasya', 'M6 बाहरी तेल'];
const MED_ROUTINE = ['All Regular', 'Sometimes Missed', 'Difficulty', 'Medicine Interrupted / Stopped', 'Prescription Confusion'];
const medicineContinuity = ({ say, title = 'STEP 03 — MEDICINE CONTINUITY', time = '45–60 सेकंड' }) => ({
  title, time,
  blocks: [
    { t: 'auto', id: 'prescriptionNow', label: 'Current Approved Prescription', from: 'prescription', hint: 'Medicine Record', long: true },
    { t: 'say', text: say },
    { t: 'one', id: 'medRoutine', label: 'Medicine routine', options: MED_ROUTINE, req: true },
    { t: 'say', text: 'यदि परेशानी — “कौन सी दवाई में परेशानी है और उसकी वजह क्या है?” (केवल prescribed slots; current doctor-approved prescription से असली दवा का नाम)', show: { id: 'medRoutine', not: ['All Regular'] } },
    { t: 'many', id: 'medSlots', label: 'Slot', options: SLOTS, show: { id: 'medRoutine', not: ['All Regular'] } },
    { t: 'matrix', id: 'medIssues', label: 'Medicine issues', columns: [
      { id: 'name', label: 'Medicine Name (Prescription से)', type: 'text' }, { id: 'slot', label: 'Slot', type: 'one', options: SLOTS.map((s) => s.split(' ')[0]) }, { id: 'reason', label: 'वजह / Reason', type: 'text' },
    ], rows: [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }], show: { id: 'medRoutine', not: ['All Regular'] } },
    { t: 'note', label: 'Staff', tone: 'rule', text: 'दवा अपने स्तर पर बंद, शुरू, कम या ज़्यादा करने की सलाह नहीं देनी है। सब Regular है तो अगले Step पर जाएँ।' },
  ],
});

// ---- Open issues (all departments) ---------------------------------------------------------------------------------
const OPEN_ISSUE = ['Resolved', 'Partially Resolved', 'Still Pending', 'Problem Worsened', 'कोई Open Issue नहीं (यह Step छोड़ें)'];
const openIssues = ({ say, time = '40 सेकंड' }) => ({
  title: 'STEP 04 — OPEN ISSUES (सभी विभागों के unresolved — केवल अगर हों)',
  time,
  blocks: [
    { t: 'auto', id: 'openIssuesNow', label: 'Open-Issue Register (CRM)', from: 'openIssues', hint: 'CRM Auto', long: true },
    { t: 'say', text: say },
    { t: 'one', id: 'openIssue', label: 'Open issue', options: OPEN_ISSUE },
    { t: 'text', id: 'openIssueRef', label: 'Open Issue / Task ID (CRM Register से)', show: { id: 'openIssue', not: ['कोई Open Issue नहीं (यह Step छोड़ें)'] } },
    { t: 'note', label: 'Staff Action', tone: 'rule', text: 'मौजूदा Task को update करें (नया duplicate Task नहीं); ज़रूरत हो तो संबंधित team को escalate करें। कोई Open Issue नहीं हो तो यह Step छोड़ दें। पूरे patient का Open-Issue Register देखें (Medicine, Family Session, Tracker, Guidance — सभी विभाग), सिर्फ़ पिछली कॉल की समस्या नहीं।' },
  ],
});

// ---- Home action difficulty (the reasons and where they go) ------------------------------------------------------
const DIFFICULTY = ['Activity not understood / Instructions not clear', 'Child not engaging', 'Child uncomfortable', 'Parent time difficulty', 'Training not received', 'Other'];
const DIFFICULTY_ACTION = 'Activity unclear → Psychologist / Trainer | Child uncomfortable → Therapist Review | Training pending → Scheduling Team | Parent time difficulty → Practical Routine Support';

// ---- Parent support ----------------------------------------------------------------------------------------------
const parentSupport = ({ title = 'STEP 07 — PARENT SUPPORT', time = '45 सेकंड', extra = [] } = {}) => ({
  title, time,
  blocks: [
    { t: 'say', text: '“इन सबके अलावा कोई ज़रूरी बात है जिसमें हमारी टीम की सहायता चाहिए?”' },
    { t: 'one', id: 'support', label: 'Parent support', options: ['No Further Support Needed', 'Support Needed → Task (नीचे)'], req: true },
    { t: 'say', text: 'यदि हाँ — “किस बात में सहायता चाहिए?” → Concern record करके Responsible Team को assign करें', show: { id: 'support', any: ['Support Needed → Task (नीचे)'] } },
    { t: 'text', id: 'supportConcern', label: 'Concern', long: true, show: { id: 'support', any: ['Support Needed → Task (नीचे)'] } },
    { t: 'text', id: 'supportTeam', label: 'Team / Owner (Task Register में भी दर्ज करें)', show: { id: 'support', any: ['Support Needed → Task (नीचे)'] } },
    ...extra,
  ],
});

// ---- Future connection (one sentence + the approved journey card) -----------------------------------------------
const futureConnection = ({ title = 'STEP 08 — FUTURE CONNECTION (एक वाक्य)', time = '20–30 सेकंड', say, rule }) => ({
  title, time,
  blocks: [
    { t: 'say', text: say },
    { t: 'facts', id: 'journey', rows: [
      { id: 'goal', label: 'Current Goal (Journey Card)', from: 'journeyGoal', hint: 'CRM Auto' },
      { id: 'purpose', label: 'Functional Purpose (Approved)', from: 'journeyPurpose', hint: 'CRM Auto' },
    ] },
    { t: 'note', label: 'Staff Rule', tone: 'rule', text: rule },
  ],
});

// ---- Clinic contact rules + the next sessions -------------------------------------------------------------------
const contactRules = ({ routine = false } = {}) => ({
  t: 'matrix', id: 'contactRules', label: 'Clinic Contact Rules (संचालन टीम से confirm होने के बाद ही बोलें / छापें)',
  columns: [{ id: 'detail', label: 'विवरण', type: 'text' }, { id: 'told', label: 'बताया', type: 'check' }],
  rows: [
    { id: 'hours', label: 'Clinic Contact Hours (बुधवार को क्लिनिक बंद)' },
    { id: 'helpline', label: 'Helpline 8810627477 कब उपलब्ध (सिर्फ़ clinic की वास्तविक उपलब्धता — 24 घंटे का संकेत न दें)' },
    ...(routine ? [
      { id: 'routine', label: 'Routine संदेश / सवाल — अगले Follow-up या Tracker में review होंगे। Response समय: ____ कार्यदिवस।' },
      { id: 'urgent', label: 'Urgent चिकित्सकीय चिंता — दवाई से तकलीफ़, बढ़ती समस्या या safety concern → उसी समय clinic channel से संपर्क करें।' },
    ] : []),
    { id: 'emergency', label: 'Emergency — तुरंत नज़दीकी अस्पताल / आपातकालीन सेवा। Clinic call का इंतज़ार न करें।' },
  ],
});
const closing = ({ title = 'STEP 09 — CLOSING', time = '30–40 सेकंड', say, links = [], routine = false }) => ({
  title, time,
  blocks: [
    { t: 'say', text: say },
    contactRules({ routine }),
    ...links.map((link) => ({ t: 'link', ...link })),
  ],
});

// ---- Staff CRM summary, final status, case note, task register --------------------------------------------------
const taskRegister = (rows = 3) => ({ t: 'tasks', id: 'tasks', rows, label: 'CRM Task Register — हर unresolved issue का अलग Task (हर पंक्ति = एक Task)' });
const MANDATORY = 'किसी भी unresolved issue के लिए Responsible Person और Due Date दर्ज करना होगा। सिर्फ़ “हम देख लेंगे” लिखकर मामला बंद नहीं करना है।';
const crmSummary = ({ title, rows, finals, tasks = 3, doNotAsk = [], exception = '' }) => ({
  title: `STAFF CRM SUMMARY — ${title}`,
  blocks: [
    { t: 'grid', id: 'summary', rows },
    { t: 'final', id: 'final', label: 'Final Status (एक चुनें)', options: finals, req: true },
    { t: 'text', id: 'caseNote', label: 'Case Note (अधिकतम 2-3 लाइन, clinical concern को छोड़कर)', long: true },
    taskRegister(tasks),
    { t: 'note', label: 'Mandatory', tone: 'warn', text: MANDATORY },
    ...(doNotAsk.length ? [{ t: 'note', label: 'DO NOT ASK', tone: 'danger', text: doNotAsk.map((q) => `• ${q}`).join('\n') }] : []),
    ...(exception ? [{ t: 'note', label: 'Exception', tone: 'info', text: exception }] : []),
  ],
});

// Family sessions: completion rules + the two final statuses + notes.
const DELIVERY_STATUS = ['Completed — Guidance Clear', 'Completed — Support Task Pending', 'Clinical Review Required', 'Urgent Escalation', 'Rescheduled / Incomplete'];
const TRAINING_STATUS = ['Training Completed (Parent ने सही demonstrate किया)', 'Training Pending — Task दर्ज', 'Training Referral Pending', 'Not Applicable'];
const familyCompletion = ({ rules, trainingNote = '' }) => ({
  title: 'Session Completion Rules & Final Status',
  blocks: [
    { t: 'list', id: 'completionRules', label: 'Session Completion Rules (सब ✓ होने पर ही Session Delivery Complete)', items: rules },
    { t: 'note', tone: 'info', label: 'Session Completed और Training Completed अलग हैं', text: 'Training pending हो तब भी Session Delivery Complete हो सकता है — बशर्ते Training Task (Task Register में) Owner और Due Date के साथ दर्ज हो।' },
    { t: 'final', id: 'final', label: '1. Session Delivery Status', options: DELIVERY_STATUS, req: true },
    { t: 'one', id: 'trainingStatus', label: '2. Home Training Status', options: TRAINING_STATUS, req: true },
    ...(trainingNote ? [{ t: 'note', tone: 'rule', text: trainingNote }] : []),
    { t: 'text', id: 'sessionNotes', label: 'सेशन के अंत में काउंसलर के नोट्स', long: true },
    { t: 'text', id: 'doctorMessage', label: 'Doctor / Clinical Lead के लिए संदेश (अगर कोई)', long: true },
  ],
});
const DOS_DONTS = {
  t: 'info', head: ['DO', "DON'T"], rows: [
    ['शांत और सम्मानजनक भाषा।', 'Parent को guilt या blame न दें।'],
    ['पहले सुनें, फिर guidance दें।', 'Cure या परिणाम की guarantee न करें।'],
    ['1-2 प्राथमिक मुद्दों पर काम करें।', 'Doctor के बिना medicine / clinical plan न बदलें।'],
    ['Approved goals / Tracker summary का reference लें।', 'नई technique खुद prescribe न करें।'],
    ['Teach-Back से समझ जाँचें।', 'नई या बढ़ती परेशानी को Tracker तक postpone न करें।'],
    ['परेशानी हो तो सही department को अलग Task दें।', 'अगले treatment phase का दबाव न डालें।'],
  ],
};

// Family sessions 02 / 03: opening + consent question + safety triage in one step.
const familyOpening = ({ say }) => ({
  title: 'STEP 01 — OPENING, CONSENT & SAFETY',
  time: 'Target: 2 मिनट',
  blocks: [
    { t: 'say', text: say },
    { t: 'response', id: 'response', label: 'Parent Response', family: true, req: true },
    { t: 'text', id: 'speakerName', label: 'बात करने वाले का नाम / संबंध' },
    { t: 'say', text: '“शुरू करने से पहले, बच्चे को अभी कोई नई या गंभीर स्वास्थ्य-संबंधी परेशानी तो नहीं है जिसके लिए तुरंत डॉक्टर की सहायता चाहिए?”' },
    { t: 'one', id: 'safety', label: 'Safety', options: ['कोई नई / गंभीर परेशानी नहीं → Session जारी रखें', 'परेशानी है'], req: true },
    { t: 'text', id: 'safetyProblem', label: 'अगर परेशानी है तो क्या है', long: true, show: { id: 'safety', any: ['परेशानी है'] } },
    ...triage({ show: { id: 'safety', any: ['परेशानी है'] }, family: true }),
    { t: 'note', label: 'Staff Instruction', tone: 'rule', text: 'महत्वपूर्ण चिकित्सकीय परेशानी हो तो सामान्य training रोककर पहले उसकी उचित सहायता की व्यवस्था करें। Skill का खोना या बढ़ती परेशानी को Tracker तक न रोकें।' },
  ],
});

const PRE_SESSION_CHECKLIST = [
  'Family Session Card देख ली', 'Tracker summary (approved) उपलब्ध है', 'पिछली Family Session के Home Action देख लिए',
  'Pending tasks / complaints देख लिए', 'Specialist (Psychologist / Therapist) की ज़रूरत हो तो पहले से तय किया', 'Delivery mode और authorized guardian confirm',
];
const STAFF_SCOPE = 'प्रशिक्षित Medical Counsellor structured questions, basic parent education, approved guidance की पुष्टि, coordination और documentation कर सकता है। नई therapy technique चुनना, जटिल behavioural analysis, mental-health counselling या clinical treatment बदलना योग्य Psychologist / Therapist / Doctor की ज़िम्मेदारी है — वहाँ referral या अलग specialist segment जोड़ें।';
const CONCERN_AREAS = ['Communication', 'Behaviour / Distress', 'Attention / Participation', 'Sleep / Daily Routine', 'Feeding / Toilet', 'Sensory Difficulties', 'Daily Living', 'Parent / Caregiver Difficulty', 'Other'];

module.exports = {
  MODE, SPOKE, RECORDING, TASK_STATUS, RESPONSE, RESPONSE_FAMILY, responseOptions, TRIAGE_LEVELS, NEW_CONCERN, SLOTS, MED_ROUTINE, OPEN_ISSUE, DIFFICULTY, DIFFICULTY_ACTION, MANDATORY,
  DELIVERY_STATUS, TRAINING_STATUS, DOS_DONTS, PRE_SESSION_CHECKLIST, STAFF_SCOPE, CONCERN_AREAS,
  callInfo, consent, greeting, triage, safetyScreen, medicineContinuity, openIssues, parentSupport, futureConnection, contactRules, closing,
  taskRegister, crmSummary, familyCompletion, familyOpening,
};

// ---- Shared texts of the follow-up templates (added with the templates) ----------------------------------------
const GREETING_LINE = '“नमस्ते, मैं MANOVAIDYA Clinic से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”';
const CLOSING_LINE = '“बीच में कोई नई या महत्वपूर्ण स्वास्थ्य समस्या हो तो अगली निर्धारित तारीख का इंतज़ार न करें, ज़रूरत के अनुसार क्लीनिक से संपर्क करें या तुरंत चिकित्सकीय सहायता लें। धन्यवाद।”';
const STATUS_BRANCH = 'Status Branch: जिस Tracker / Session की बात करनी है उसका CRM Status देखें — Completed हो तभी उसके बाद की guidance वाली Script A बोलें; Pending हो तो सिर्फ़ Script B (scheduling) बोलें।';
const EXCEPTION_TEXT = 'अभिभावक नई स्वास्थ्य समस्या, महत्वपूर्ण deterioration या पहले सीखी हुई skill खोने की जानकारी दे तो उसे Tracker तक न टालें — उचित clinical review करवाएँ।';
const journeyRule = (what) => `यह एक छोटा, CRM में approved संदेश है — ${what}। CRM में approved Journey Card न दिखे तो यह Step छोड़ दें; अपनी तरफ़ से नया goal, भविष्य की skill या परिणाम न बताएँ।`;
// "Session / Call ID" header of FU-02 … FU-07 and FS-02 / FS-03 (same blocks as callInfo()).
const sessionInfo = (title = 'कॉल की जानकारी') => {
  const section = callInfo();
  section.title = title;
  section.blocks[0].rows[0].label = 'Session / Call ID';
  return section;
};
Object.assign(module.exports, { GREETING_LINE, CLOSING_LINE, STATUS_BRANCH, EXCEPTION_TEXT, journeyRule, sessionInfo });
