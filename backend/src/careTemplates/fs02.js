// MV-FS-02 • Family Session 02 (Day 105): Parent Training, Tracker-Based Guidance & Problem Solving.
const B = require('./blocks');

// Triage levels as printed in this form (Step 01).
const LEVELS = [
  { value: 'Emergency', timing: 'तुरंत — कॉल के दौरान', action: 'गंभीर एलर्जी, साँस की तकलीफ़, दौरे या दूसरे emergency संकेत: तुरंत emergency medical care की सलाह और clinic escalation।' },
  { value: 'Urgent Doctor Review', timing: 'Clinical Lead के approved समय में (लक्ष्य: उसी दिन)', action: 'दवा के बाद नई / बढ़ी तकलीफ़, उल्टी, पेट ख़राब, एलर्जी, ज़्यादा सुस्ती, गंभीर नींद की समस्या, पानी की कमी, अचानक regression / skill का खोना: Doctor Review Task आज ही।' },
  { value: 'Routine Support', timing: '____ कार्यदिवस में', action: 'सिर्फ़ दवा देने की असुविधा / सामान्य सवाल। नया clinical symptom इस श्रेणी में नहीं आता।' },
];
const DOCTOR = ['Emergency', 'Urgent Doctor Review'];
const ADVICE_NOTE = 'Emergency या Urgent Doctor Review चुनने पर form save होते ही doctor को advice request अपने-आप जाती है (Task ID वहीं से)।';

const PROBLEM = { id: 'safety', any: ['परेशानी है'] };
const NO_RECORD = { id: 'trackerRecord', any: ['नहीं है → Clarification Task (Psychologist)'] };
const MED_YES = { id: 'medicalCheck', any: ['हाँ → ऊपर Triage / Doctor Review Task'] };
const APPT = { id: 'demoBy', any: ['अलग Therapist Appointment चाहिए'] };

const CONTACT_RULES = {
  t: 'matrix', id: 'contactRules', label: 'Clinic Contact Rules (संचालन टीम से confirm होने के बाद ही बोलें / छापें)',
  columns: [{ id: 'detail', label: 'विवरण', type: 'text' }, { id: 'told', label: 'बताया', type: 'check' }],
  rows: [
    { id: 'hours', label: 'Clinic Contact Hours — __________ से __________ (बुधवार को क्लिनिक बंद)' },
    { id: 'helpline', label: 'Helpline 8810627477 कब उपलब्ध — __________ — सिर्फ़ clinic की वास्तविक उपलब्धता के अनुसार बताएँ; 24 घंटे का संकेत न दें।' },
    { id: 'routine', label: 'Routine संदेश / सवाल — अगले Follow-up या Tracker में review होंगे। Response समय: ____ कार्यदिवस। रोज़ के बदलावों के लिए improvement-call की ज़रूरत नहीं।' },
    { id: 'urgent', label: 'Urgent चिकित्सकीय चिंता — दवा से तकलीफ़, बढ़ती समस्या या safety concern → उसी समय clinic channel से संपर्क करें।' },
    { id: 'emergency', label: 'Emergency — तुरंत नज़दीकी अस्पताल / आपातकालीन सेवा। Clinic call का इंतज़ार न करें।' },
  ],
};

module.exports = {
  code: 'FS-02',
  key: 'MV-FS-02',
  version: 2,
  kind: 'family',
  seq: 2,
  day: 105,
  title: 'Parent Training, Tracker-Based Guidance & Problem Solving',
  subtitle: 'काउंसलर फ़ॉर्म — हर स्टेप के साथ-साथ भरें',
  meta: [
    ['Template Code', 'MV-FS-02'],
    ['Scheduled', 'Day 105 (तीसरे महीने के बाद लगभग 15 दिन)'],
    ['Target Duration', '25–30 मिनट'],
    ['Session Lead', 'Trained Medical Counsellor'],
    ['Specialist Support', 'Psychologist / Therapist / Doctor (ज़रूरत हो तो)'],
    ['Session Type', 'Skill Expansion, Parent Training & Mid-Course Guidance'],
    ['Based On', 'Tracker 01 (Day 60) • FS-01 (Day 15) • Follow-up 01–03 के नोट्स'],
    ['Next', 'Follow-up 04 — Day 110 • Tracker 02 — Day 120'],
    ['Version', '3.0 • Internal Medical Counselling SOP — Subject to Treating Clinician & Clinical Lead Approval'],
  ],
  sections: [
    {
      title: 'सेशन की जानकारी',
      blocks: [
        { t: 'facts', id: 'callIds', rows: [
          { id: 'sessionRef', label: 'Session ID', from: 'sessionRef', hint: 'Auto' },
          { id: 'patientCode', label: 'Patient ID', from: 'patientCode', hint: 'Auto' },
          { id: 'callDate', label: 'Session Date', from: 'today', hint: 'Date' },
          { id: 'counsellor', label: 'Session Lead', from: 'counsellor', hint: 'Staff Select' },
        ] },
        { t: 'note', tone: 'info', text: 'शुरू / ख़त्म / कुल समय अपने-आप दर्ज होता है: फ़ॉर्म खुलने से "Mark done" तक (Timer)।' },
        { t: 'one', id: 'mode', label: 'Delivery Mode', options: B.MODE },
        { t: 'one', id: 'spokeWith', label: 'बात किससे हुई (Guardian Attended)', options: B.SPOKE, other: 'Other' },
        { t: 'many', id: 'specialist', label: 'Specialist Involved (Multi-select)', options: ['Psychologist', 'Therapist', 'Doctor'] },
      ],
    },
    B.consent({ recording: true }),
    {
      title: 'SECTION A — सेशन से पहले: Family Session Card (Staff Only, 2 मिनट)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'card', label: 'Family Session Card', rows: [
          { id: 'profile', label: 'Child Profile & Diagnosis', from: 'doctorAssessment', hint: 'OPD / Doctor Assessment' },
          { id: 'initial', label: 'Initial Parent Concerns (FS-01) — मुख्य परेशानी', from: 'ans:FS-01:mainConcern', hint: 'Family Session History' },
          { id: 'initialWords', label: 'Initial Parent Concerns (FS-01) — Parent के शब्द', from: 'ans:FS-01:concernWords', hint: 'Family Session History' },
          { id: 'goals', label: 'Current Developmental Goals', from: '', hint: 'Assessment / Clinical Plan' },
          { id: 'tracker1', label: 'Tracker 01 Summary (Day 60) — approved', from: '', hint: 'Development Tracker' },
          { id: 'home', label: 'Assigned Home Activities', from: 'homeTherapy', hint: 'Therapy / Training Module' },
          { id: 'step', label: 'Assigned Home Activities — अभी का स्टेप (FU-02)', from: 'ans:FU-02:practiceStep', hint: 'Therapy / Training Module' },
          { id: 'fs01', label: 'FS-01 Agreed Home Actions & Status', from: 'actions:FS-01', hint: 'Family Session History' },
          { id: 'practice', label: 'Follow-up 02–03 में दर्ज practice-कठिनाई — practice हफ़्ते में कितने दिन (FU-02)', from: 'ans:FU-02:practiceDays', hint: 'Medical Follow-up Records' },
          { id: 'body', label: 'Follow-up 02–03 के body-routine notes — भूख / मल / नींद / diet (FU-03)', from: 'ans:FU-03:bodyRoutine', hint: 'Medical Follow-up Records' },
          { id: 'point1', label: 'Follow-up 03 में parent ने FS-02 के लिए जो बातें बताईं — बात 1', from: 'ans:FU-03:fs02Point1', hint: 'Medical Follow-up Records' },
          { id: 'point2', label: 'Follow-up 03 में parent ने FS-02 के लिए जो बातें बताईं — बात 2', from: 'ans:FU-03:fs02Point2', hint: 'Medical Follow-up Records' },
          { id: 'pending', label: 'Pending Complaints / Tasks', from: 'openIssues', hint: 'Care Coordination CRM' },
          { id: 'tracker2', label: 'Tracker 02 Date (Day 120)', from: 'date:DT-02', hint: 'CRM' },
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'पूरी history दोबारा न पढ़ें, न दोबारा पूछें — सिर्फ़ यह Card देखें। Approved Tracker summary / goals CRM में न हों तो अनुमान से न बताएँ; Clinical Plan Clarification Task बनाकर clinician से पुष्टि करवाएँ।' },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist', items: [
          'Family Session Card देख ली',
          'Tracker summary (approved) उपलब्ध है',
          'पिछली Family Session के Home Action देख लिए',
          'बीच के फॉलो-अप के नोट्स (कठिनाई, observation) देख लिए',
          'Pending tasks / complaints देख लिए',
          'Specialist (Psychologist / Therapist) की ज़रूरत हो तो पहले से तय किया',
          'Delivery mode और authorized guardian confirm',
        ] },
        { t: 'note', label: 'Staff Scope', tone: 'info', text: B.STAFF_SCOPE },
      ],
    },
    {
      title: 'STEP 01 — OPENING, CONSENT & SAFETY',
      time: 'Target: 2 मिनट',
      blocks: [
        { t: 'say', text: [
          '“नमस्ते, मैं MANOVAIDYA Clinic से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
          '“आज हमारा दूसरा Family Guidance Session है। आज के सेशन में हम पहले आपकी सबसे महत्वपूर्ण एक-दो परेशानियाँ समझेंगे, फिर बच्चे की निर्धारित home activities पर guidance देंगे और आख़िर में आगे की योजना तय करेंगे। यह लगभग 25–30 मिनट का सेशन रहेगा। क्या अभी आराम से बात कर सकते हैं?”',
        ].join('\n') },
        { t: 'response', id: 'response', label: 'Parent Response', family: true, options: B.RESPONSE_FAMILY },
        { t: 'text', id: 'speakerName', label: 'बात करने वाले का नाम / संबंध' },
        { t: 'check', id: 'guardianVerified', label: 'Guardian identity verified' },
        { t: 'note', label: 'Safety', tone: 'warn', text: 'एक ज़रूरी सवाल — Triage Level तय करें (Single Select)' },
        { t: 'say', text: '“शुरू करने से पहले, बच्चे को अभी कोई नई या गंभीर स्वास्थ्य-संबंधी परेशानी तो नहीं है जिसके लिए तुरंत डॉक्टर की सहायता चाहिए?”' },
        { t: 'one', id: 'safety', label: 'Safety', options: ['कोई नई / गंभीर परेशानी नहीं → Session जारी रखें', 'परेशानी है'] },
        { t: 'text', id: 'safetyProblem', label: 'अगर परेशानी है तो क्या है (जो parent ने बताया)', long: true, show: PROBLEM },
        { t: 'triage', id: 'triage', label: 'Triage Level (एक चुनें)', levels: LEVELS, show: PROBLEM },
        { t: 'text', id: 'triageEscalateTo', label: 'Escalate किसे / कब', show: PROBLEM },
        { t: 'note', tone: 'info', text: ADVICE_NOTE, show: { id: 'triage', any: DOCTOR } },
        { t: 'note', label: 'Staff Instruction', tone: 'rule', text: 'महत्वपूर्ण चिकित्सकीय परेशानी हो तो सामान्य training रोककर पहले उसकी उचित सहायता की व्यवस्था करें। नई या बढ़ती गंभीर परेशानी को सामान्य complaint limit या Tracker तक न रोकें।' },
      ],
    },
    {
      title: 'STEP 02 — PARENT का अनुभव और मुख्य परेशानी',
      time: 'Target: 3 मिनट',
      blocks: [
        { t: 'note', label: 'Method (Connect → Reflect)', tone: 'info', text: 'Follow-up 03 में parent ने इस सेशन के लिए जो 1–2 बातें बताई थीं, वे CRM में हैं — पहले उन्हें पढ़कर confirm करें, पूरी सूची दोबारा न पूछें।' },
        { t: 'facts', id: 'fu03Points', label: 'Follow-up 03 में Parent की बताई बातें (CRM)', rows: [
          { id: 'point1', label: '[Point 1]', from: 'ans:FU-03:fs02Point1', hint: 'FU-03' },
          { id: 'point2', label: '[Point 2]', from: 'ans:FU-03:fs02Point2', hint: 'FU-03' },
        ] },
        { t: 'say', text: '“पिछले फॉलो-अप में आपने बताया था कि इस सेशन में आप [Point 1] और [Point 2] पर बात करना चाहते हैं। क्या अभी भी यही दो बातें सबसे ज़रूरी हैं, या इसमें कुछ बदला है?”' },
        { t: 'one', id: 'pointsConfirm', label: 'Q1 Parent की मुख्य परेशानी (confirm)', options: ['वही बातें — confirm', 'बदली — नई मुख्य बात नीचे लिखें'] },
        { t: 'one', id: 'mainConcern', label: 'Primary Concern', options: B.CONCERN_AREAS, other: 'Other' },
        { t: 'text', id: 'concernWords', label: 'Parent के अपने शब्दों में (मुख्य परेशानी 1–2)', long: true },
        { t: 'say', text: '“यानी आपकी मुख्य परेशानी यह है कि [Concern] — मैं सही समझ रही हूँ ना?”' },
        { t: 'check', id: 'concernConfirmed', label: 'Parent ने Confirm किया' },
        { t: 'text', id: 'otherProblems', label: 'बाकी / अतिरिक्त समस्याएँ (अलग Task)' },
        { t: 'text', id: 'otherProblemsTask', label: 'Task ID' },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'यहाँ चुनी मुख्य समस्या आगे Step 04 में उठाई जाएगी — उसे Step 04 / 06 में दोबारा न पूछें, वहीं से आगे बढ़ें।' },
      ],
    },
    {
      title: 'STEP 03 — TRACKER 01 की प्राथमिकताएँ सरल भाषा में',
      time: 'Target: 5 मिनट',
      blocks: [
        { t: 'note', label: 'Purpose', tone: 'info', text: 'Day 60 के Development Tracker में पहचानी गई प्राथमिकताओं और बाकी ज़रूरतों को सरल भाषा में समझाना। Tracker का result सिर्फ़ इसी सेशन में समझाया जाता है (फॉलो-अप में नहीं)। सिर्फ़ approved summary बोलें — score की व्याख्या, नई diagnosis या prognosis नहीं।' },
        { t: 'say', text: '“आपके बच्चे का पहला Development Tracker हो चुका है। उसमें डॉक्टर और टीम ने देखा कि अभी किन skills पर ज़्यादा ध्यान देना सबसे उपयोगी रहेगा। हर बच्चे में अलग skills पर अलग गति से काम होता है। आज मैं उसी रिपोर्ट की मुख्य बातें समझाऊँगी।”' },
        { t: 'matrix', id: 'trackerPriorities', label: 'Priority', columns: [
          { id: 'goal', label: 'Approved Priority / Goal (CRM से)', type: 'text' },
          { id: 'meaning', label: 'सरल भाषा में मतलब (Approved)', type: 'text' },
          { id: 'activity', label: 'Assigned Activity', type: 'text' },
        ], rows: [{ id: 'p1', label: '1' }, { id: 'p2', label: '2' }, { id: 'rest', label: 'बाकी ज़रूरतें' }] },
        { t: 'one', id: 'trackerRecord', label: 'Tracker Record', options: ['Approved summary CRM में है', 'नहीं है → Clarification Task (Psychologist)'] },
        { t: 'text', id: 'trackerTask', label: 'Task ID', show: NO_RECORD },
        { t: 'say', text: '“हमने पहले [Foundation Goal] पर ध्यान दिया था। अब Tracker और clinical review के अनुसार [Current Priority] पर काम करना उपयोगी रहेगा। इस skill का उद्देश्य सिर्फ़ activity करवाना नहीं, बल्कि बच्चे को रोज़मर्रा में [Functional Ability] के लिए तैयार करने में सहायता करना है।”' },
        { t: 'note', label: 'FUTURE VISION POINT — Future Skill Expansion — Tracker 01 के बाद', tone: 'info', text: '3 मिनट' },
        { t: 'say', text: [
          '“मैम, Foundation में हमने बीज से वृक्ष का उदाहरण देखा था। Tracker 01 में दिखा कि [Child Name] कुछ क्षेत्रों में [Phase — जैसे अंकुर] तक पहुँचा है — यह आपकी रोज़ की मेहनत का हिस्सा है।”',
          '“अब सवाल है — आज जो skill आ रही है, उसे आगे कहाँ ले जाना है? जैसे अगर वह एक शब्द से माँगने लगा है, तो अगला कदम हो सकता है उन शब्दों से मदद माँगना और दूसरों से बात करना।”',
        ].join('\n') },
        { t: 'facts', id: 'futureRecord', label: 'Future Development Record (Doctor / Therapist approved)', rows: [
          { id: 'ability', label: 'आज की क्षमता — Current Ability', from: '', hint: 'Auto Fetch' },
          { id: 'goal', label: 'अभी का लक्ष्य — Current Approved Goal', from: '', hint: 'Auto Fetch' },
          { id: 'next', label: 'अगली संभावित क्षमता — Next Possible Ability', from: '', hint: 'Auto Fetch' },
          { id: 'benefit', label: 'भविष्य में उपयोग — Future Life Benefit', from: '', hint: 'Auto Fetch' },
        ] },
        { t: 'note', label: 'Auto Fetch', tone: 'rule', text: 'Future Development Record (Doctor / Therapist approved)। खाली हो तो अपने से न भरें → Clinical Clarification Task।' },
        { t: 'check', id: 'phaseExplained', label: 'Domain-wise Phase (Tracker 01) parent को सरल भाषा में बताया' },
        { t: 'matrix', id: 'skillPath', columns: [
          { id: 'foundation', label: 'Foundation Goal (FS-01)', type: 'text' },
          { id: 'current', label: 'Approved Current Priority (Tracker 01)', type: 'text' },
          { id: 'benefit', label: 'Future Life Benefit (दैनिक जीवन में)', type: 'text' },
          { id: 'next', label: 'Next Possible Ability (clinician)', type: 'text' },
        ], rows: [{ id: 'r1', label: '1' }] },
        { t: 'one', id: 'q2', label: 'Q2 Parent Understanding Check — “क्या आपको स्पष्ट है कि Tracker में कौन सी skills अभी प्राथमिकता हैं और घर की activity उससे कैसे जुड़ी है?”', options: ['Clear', 'Partially Clear', 'Needs Specialist Explanation'] },
        { t: 'info', head: ['अगर Parent पूछे', 'जवाब'], rows: [
          ['‘इतना सुधार क्यों नहीं दिखा?’ / ‘कब बोलेगा?’', '“आपकी चिंता बिल्कुल जायज़ है। हर बच्चे में अलग skills की गति अलग होती है, इसीलिए हम Tracker में निर्धारित goals देखते हैं। जहाँ बदलाव कम दिखता है, वहाँ clinical team देखती है कि आगे कौन-सी सहायता या बदलाव उपयोगी रहेगा। आपकी बात हम specialist तक पहुँचाएँगे।”'],
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Autism को cured न कहें; किसी निश्चित परिणाम का वादा न करें। Tracker के score या domain की अपने से व्याख्या न करें — Specialist से करवाएँ।' },
      ],
    },
    {
      title: 'STEP 04 — घर की Activities की समस्याएँ पहचानना',
      time: 'Target: 5 मिनट',
      blocks: [
        { t: 'note', tone: 'info', text: 'Follow-up 02–03 में practice की स्थिति दर्ज है — नीचे CRM से भरें, parent से सिर्फ़ असल बाधा समझें।' },
        { t: 'facts', id: 'practiceNow', label: 'Practice की स्थिति (CRM)', rows: [
          { id: 'actions', label: 'पिछली बार तय Home Action (FS-01)', from: 'actions:FS-01', hint: 'Family Session History' },
          { id: 'days', label: 'Practice — हफ़्ते में कितने दिन (FU-02)', from: 'ans:FU-02:practiceDays', hint: 'FU-02' },
          { id: 'step', label: 'किस स्टेप तक (FU-02)', from: 'ans:FU-02:practiceStep', hint: 'FU-02' },
        ] },
        { t: 'matrix', id: 'actionStatus', columns: [
          { id: 'action', label: 'पिछली बार तय Home Action', type: 'text' },
          { id: 'status', label: 'अभी की स्थिति (CRM / FU-02–03)', type: 'one', options: ['Regular', 'Sometimes', 'Not Started', 'Difficulty'] },
        ], rows: [{ id: 'a1', label: 'Action 01' }, { id: 'a2', label: 'Action 02' }] },
        { t: 'text', id: 'step2Concern', label: 'Step 02 में चुनी समस्या (दोबारा न पूछें — अब सिर्फ़ उसका कारण)' },
        { t: 'text', id: 'q3', label: 'Q3 “जब यह समस्या होती है, तब ठीक उस समय क्या हो रहा होता है — बच्चा क्या करता है और आप क्या करते हैं?”' },
        { t: 'many', id: 'barriers', label: 'असल बाधा पहचानें (जो लागू हो ✓)', options: ['Activity बच्चे के लिए कठिन है', 'Sensory discomfort', 'Instruction स्पष्ट नहीं', 'समय उपयुक्त नहीं', 'बच्चा distress में', 'Parent के पास समय / थकान', 'Material / जगह की कमी', 'Other'], other: 'Other' },
        { t: 'one', id: 'medicalCheck', label: 'Medical check: “क्या बच्चे को उस समय कोई दर्द, पेट की परेशानी या नींद की समस्या रहती है?”', options: ['नहीं', 'हाँ → ऊपर Triage / Doctor Review Task'] },
        { t: 'triage', id: 'medTriage', label: 'Triage Level (एक चुनें)', levels: LEVELS, show: MED_YES },
        { t: 'note', tone: 'info', text: ADVICE_NOTE, show: { id: 'medTriage', any: DOCTOR } },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'बच्चा activity नहीं कर रहा तो इसका मतलब यह नहीं कि parent प्रयास नहीं कर रहे। Parent को दोष न दें और तुरंत “ज़्यादा देर बैठाइए / ज़्यादा कीजिए” न कहें — पहले level, समय, बाधा और बच्चे की भागीदारी समझें।' },
      ],
    },
    {
      title: 'STEP 05 — Technique की Demonstration / Correction',
      time: 'Target: 8 मिनट • सबसे ज़रूरी हिस्सा',
      blocks: [
        { t: 'note', label: 'Method (Guide → Practice)', tone: 'info', text: 'पहले पूछें “क्या मैं इसके लिए एक छोटा तरीका समझाऊँ?” फिर approved training के अनुसार 1–2 techniques दें। कोई भी नई technique Counsellor नहीं चुनेगा।' },
        { t: 'text', id: 'q4', label: 'Q4 “किस activity को दोबारा समझाने या demonstrate कराने की ज़रूरत है?”' },
        { t: 'matrix', id: 'activityDetails', columns: [{ id: 'value', label: 'विवरण', type: 'text' }], rows: [
          { id: 'training', label: 'Activity / Training (Approved)' }, { id: 'module', label: 'Module / Part' },
          { id: 'level', label: 'Current Level' }, { id: 'when', label: 'किस समय करवाई जाती है' },
          { id: 'distress', label: 'बच्चा कब परेशान होता है' }, { id: 'better', label: 'किस स्थिति में भागीदारी बेहतर' },
        ] },
        { t: 'many', id: 'demoBy', label: 'किसने समझाया / demonstration किया', options: ['Counsellor — approved steps का revision', 'Psychologist', 'Therapist', 'अलग Therapist Appointment चाहिए'] },
        { t: 'date', id: 'separateApptDate', label: 'अलग Therapist Appointment — तारीख', show: APPT },
        { t: 'text', id: 'separateApptTask', label: 'Task ID', show: APPT },
        { t: 'say', text: '“आप मुझे अपने शब्दों में बताइए कि घर पर अगली बार यह activity कैसे करेंगे?” (Teach-Back)' },
        { t: 'text', id: 'teachBack', label: 'Parent ने जो बताया (Teach-Back)', long: true },
        { t: 'grid', id: 'trainingVerification', label: 'CRM Training Verification', rows: [
          { id: 'paper', label: 'Paper Understanding', options: ['Clear', 'Partial', 'Not Clear'] },
          { id: 'demo', label: 'Demonstration', options: ['Done', 'Pending', 'Not Required'] },
          { id: 'practice', label: 'Parent Practice', options: ['Demonstrated', 'Verbal Understanding Only', 'Needs Support'] },
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Training अधूरी हो तो उसे छुपाकर Session Complete न दिखाएँ — अलग Therapist Training Appointment और Task बनाएँ। फ़ोन पर सिर्फ़ तरीका बताना Verbal Understanding है, Demonstration नहीं। एक सेशन में 1–2 technique, पाँच-दस नई activities नहीं।' },
      ],
    },
    {
      title: 'STEP 06 — Parent Support, थकान और Routine',
      time: 'Target: 4 मिनट',
      blocks: [
        { t: 'note', tone: 'info', text: 'सिर्फ़ तब पूछें जब Step 02 / 04 में parent या caregiver की कठिनाई, समय या थकान चुनी गई हो। कठिन routine पहले दर्ज हो चुकी है — दोबारा न पूछें; नहीं तो “Manage हो रहा है” चुनकर Step 07 पर जाएँ। Parent की थकान / सहारे का सवाल इसी सेशन में होता है — फॉलो-अप में दोबारा नहीं।' },
        { t: 'one', id: 'q5', label: 'Q5 “आप और परिवार के दूसरे सदस्य इन गतिविधियों को manage कर पा रहे हैं, या कुछ सहयोग की ज़रूरत है?”', options: ['Manage हो रहा है', 'Practical Guidance चाहिए', 'Family Support चाहिए', 'Training Support चाहिए', 'Psychological Support / Referral'] },
        { t: 'text', id: 'mainCaregiver', label: 'मुख्य Caregiver' },
        { t: 'text', id: 'otherHelpers', label: 'मदद करने वाले अन्य' },
        { t: 'say', text: '“रोज़मर्रा की ज़िम्मेदारियों के साथ यह सब संभालना आसान नहीं होता। हम ऐसा routine तय करने में सहायता करेंगे जो बच्चे के लिए निर्धारित training के अनुरूप और आपके परिवार के लिए व्यावहारिक हो।”' },
        { t: 'one', id: 'caregiverSupport', label: 'Caregiver Support', options: ['Adequate', 'Needs Help'] },
        { t: 'one', id: 'specialistSupport', label: 'Additional Specialist Support', options: ['Yes', 'No'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Parent बहुत ज़्यादा थके हुए, निराश या खुद को नुकसान जैसी बात कहें तो उसी दिन Psychologist / Doctor को सूचित करें (Safety Triage)। ज़्यादा समय या ज़्यादा activities से अपने-आप ज़्यादा improvement का दावा न करें।' },
      ],
    },
    {
      title: 'STEP 07 — अगला Action Plan और Tracker 02 की तैयारी',
      time: 'Target: 3 मिनट',
      blocks: [
        { t: 'note', label: 'Method (Close)', tone: 'info', text: '“तो अभी हम [Selected Activity] पर ध्यान देंगे। [Responsible Person] इसकी सहायता करेगा और [Date] पर समीक्षा होगी।”' },
        { t: 'matrix', id: 'homeActions', label: 'Updated Home Action (Approved, अधिकतम 2)', columns: [
          { id: 'activity', label: 'Updated Home Action (Approved, अधिकतम 2)', type: 'text' },
          { id: 'person', label: 'Responsible Person', type: 'text' },
          { id: 'frequency', label: 'Duration / बार', type: 'text' },
          { id: 'review', label: 'Review Date', type: 'date' },
        ], rows: [{ id: 'a1', label: 'Action 01' }, { id: 'a2', label: 'Action 02' }] },
        { t: 'say', text: [
          '“हमने [Foundation Goal] से शुरुआत की थी। अब [Current Priority] पर काम करने से बच्चे को रोज़मर्रा में [Functional Ability] में सहायता मिलेगी — और अगली review में आगे की दिशा तय होगी।”',
          '“पाँच दिन बाद, Day 110 पर, एक छोटा मेडिकल फॉलो-अप होगा — उसमें आज की नई activity घर पर कैसे शुरू हुई, यह देखेंगे। आपका दूसरा Development Tracker लगभग Day 120 पर होगा। आप पहले से दी गई गतिविधियाँ निर्धारित तरीके से करते रहें; अलग से नई activities शुरू करने की ज़रूरत नहीं।”',
          '“सामान्य दैनिक observations का छोटा रिकॉर्ड रखिए। लेकिन कोई नई, बढ़ती या महत्वपूर्ण स्वास्थ्य समस्या, दवा से तकलीफ़ या safety concern हो तो अगली तारीख का इंतज़ार न करें — क्लिनिक से संपर्क करें या तुरंत चिकित्सकीय सहायता लें। धन्यवाद।”',
        ].join('\n') },
        CONTACT_RULES,
        { t: 'link', id: 'fu04Link', label: 'Follow-up 04 (Day 110)', code: 'FU-04', options: ['Scheduled', 'Pending'] },
        { t: 'link', id: 'dt02Link', label: 'Development Tracker 02 (Day 120)', code: 'DT-02', options: ['Confirmed', 'Pending'] },
      ],
    },
    {
      title: 'SECTION B–E — CRM Session Record & Completion',
      blocks: [
        { t: 'grid', id: 'sessionRecord', label: 'Session — FS-02', rows: [
          { id: 'skill', label: 'Skill Expansion Connection (Foundation → Current)', options: ['Explained', 'Pending'] },
          { id: 'understanding', label: 'Parent Understanding', options: ['Clear', 'Partial', 'Needs Training'] },
          { id: 'activity', label: 'Assigned Activity Status', options: ['Started', 'Difficulty', 'Not Started'] },
          { id: 'barrier', label: 'Main Barrier', options: ['Time', 'Understanding', 'Child Distress', 'Other'] },
          { id: 'demo', label: 'Training Demonstration', options: ['Done', 'Needed', 'Not Applicable'] },
          { id: 'support', label: 'Parent Support Need', options: ['None', 'Basic', 'Specialist'] },
          { id: 'clinical', label: 'Pending Clinical Concern', options: ['Yes', 'No'] },
          { id: 'tracker', label: 'Tracker Record Available', options: ['Yes', 'No → Task'] },
          { id: 'review', label: 'Next Review', options: ['Scheduled', 'Pending'] },
        ] },
        B.taskRegister(5),
        { t: 'note', label: 'Mandatory', tone: 'warn', text: B.MANDATORY },
      ],
    },
    {
      title: 'Session Completion Rules & Final Status',
      blocks: [
        { t: 'list', id: 'completionRules', label: 'Session Completion Rules (सब ✓ होने पर ही Session Delivery Complete)', items: [
          'Guardian identity verified',
          'Urgent issue triage हुआ',
          'Parent की 1–2 मुख्य परेशानियाँ confirm',
          'Tracker 01 की approved priorities समझाईं',
          'घर की activity की बाधा पहचानी',
          'Training review / demonstration या task assigned',
          'Teach-Back से Parent समझ checked',
          'Updated Home Action (अधिकतम 2) + Responsible Person दर्ज',
          'Day 110 Follow-up 04 और Tracker 02 की तारीख बताई',
          'Pending actions के अलग Task, Owner, Due Date',
          'Contact Rules समझाए',
        ] },
        { t: 'note', label: 'Session Completed और Training Completed अलग हैं', tone: 'info', text: 'Training pending हो तब भी Session Delivery Complete हो सकता है — बशर्ते Training Task Owner और Due Date के साथ दर्ज हो।' },
        { t: 'final', id: 'final', label: 'Final Status — दोनों अलग चुनें • 1. Session Delivery Status', options: B.DELIVERY_STATUS },
        { t: 'one', id: 'trainingStatus', label: '2. Home Training Status', options: B.TRAINING_STATUS },
        { t: 'note', tone: 'rule', text: 'Training Completed तभी चुनें जब इस सेशन में वास्तव में demonstration हुआ। नहीं हुआ तो “Not Applicable”।' },
        { t: 'text', id: 'sessionNotes', label: 'सेशन के अंत में काउंसलर के नोट्स', long: true },
        { t: 'text', id: 'doctorMessage', label: 'Doctor / Clinical Lead के लिए संदेश (अगर कोई)', long: true },
        { t: 'facts', id: 'signOff', rows: [
          { id: 'name', label: 'Counsellor नाम', from: 'counsellor', hint: 'Staff' },
          { id: 'date', label: 'तारीख', from: 'today', hint: 'Date' },
        ] },
      ],
    },
    {
      title: "Staff DO'S & DON'TS",
      blocks: [
        { t: 'info', head: ['DO', "DON'T"], rows: [
          ['शांत और सम्मानजनक भाषा।', '“15 दिन में कितना improvement आया” जैसे सवाल न पूछें।'],
          ['पहले सुनें, फिर guidance दें।', 'Parent को guilt या blame न दें।'],
          ['1–2 प्राथमिक मुद्दों पर काम करें।', 'Cure या परिणाम की guarantee न दें।'],
          ['Approved goals / Tracker summary का reference लें।', 'Doctor के बिना medicine / clinical plan न बदलें।'],
          ['Teach-Back से समझ जाँचें।', 'नई technique खुद prescribe न करें।'],
          ['परेशानी हो तो सही department को अलग Task दें।', 'नई या बढ़ती परेशानी को Tracker तक postpone न करें।'],
          ['', 'अगले treatment phase का दबाव न डालें।'],
        ] },
      ],
    },
  ],
};
