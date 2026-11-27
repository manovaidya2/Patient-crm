// MV-FS-02 • Family Session 02 (Day 105): Parent Training, Tracker-Based Guidance & Problem Solving.
const {
  sessionInfo, consent, familyOpening, contactRules, taskRegister, familyCompletion,
  CONCERN_AREAS, PRE_SESSION_CHECKLIST, STAFF_SCOPE, DOS_DONTS, MANDATORY,
} = require('../blocks');

const NO_RECORD = { id: 'trackerRecord', any: ['नहीं है → Clarification Task (Psychologist)'] };

module.exports = {
  code: 'FS-02',
  key: 'MV-FS-02',
  version: 1,
  kind: 'family',
  seq: 2,
  day: 105,
  title: 'Parent Training, Tracker-Based Guidance & Problem Solving',
  subtitle: 'काउंसलर फ़ॉर्म — हर स्टेप के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FS-02'],
    ['Scheduled', 'Day 105 (तीसरे महीने के बाद लगभग 15 दिन)'],
    ['Target Duration', '25–30 मिनट'],
    ['Session Lead', 'Trained Medical Counsellor'],
    ['Specialist Support', 'Psychologist / Therapist / Doctor (ज़रूरत हो तो)'],
    ['Session Type', 'Skill Expansion, Parent Training & Mid-Course Guidance'],
    ['Based On', 'Tracker 01 (Day 60) • FS-01 (Day 15)'],
    ['Next', 'FU-05 Day 110 • Tracker 02 Day 120'],
  ],
  sections: [
    sessionInfo('सेशन की जानकारी'),
    consent({ recording: false }),
    {
      title: 'SECTION A — सेशन से पहले: Family Session Card (Staff Only, 2 मिनट)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'card', rows: [
          { id: 'profile', label: 'Child Profile & Diagnosis', from: 'doctorAssessment', hint: 'OPD / Doctor Assessment' },
          { id: 'initial', label: 'Initial Parent Concerns', from: 'initialConcerns', hint: 'Patient History' },
          { id: 'goals', label: 'Current Developmental Goals', from: 'goals', hint: 'Assessment / Clinical Plan' },
          { id: 'tracker1', label: 'Tracker 01 Summary (Day 60) — approved', from: 'trackerSummary:DT-01', hint: 'Development Tracker' },
          { id: 'home', label: 'Assigned Home Activities', from: 'homeTherapy', hint: 'Therapy / Training Module' },
          { id: 'fs01', label: 'FS-01 Agreed Home Actions & Status', from: 'actions:FS-01', hint: 'Family Session History' },
          { id: 'guidance', label: 'Parent Guidance Paper Record', from: 'issuedPapers', hint: 'Issued Paper Record' },
          { id: 'medIssues', label: 'Medicine / Diet / Marma Issues (FU-01 से 04)', from: 'openIssues', hint: 'Medical Follow-up Records' },
          { id: 'pending', label: 'Pending Complaints / Tasks', from: 'pendingComplaint', hint: 'Care Coordination CRM' },
          { id: 'tracker2', label: 'Tracker 02 Date (Day 120)', from: 'date:DT-02', hint: 'CRM' },
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'पूरी history दोबारा न पढ़ें, न दोबारा पूछें — सिर्फ़ यह Card देखें। Approved Tracker summary / goals CRM में न हों तो अनुमान से न बताएँ; Clinical Plan Clarification Task बनाकर clinician से पुष्टि करवाएँ।' },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist', items: PRE_SESSION_CHECKLIST },
        { t: 'note', label: 'Staff Scope', tone: 'info', text: STAFF_SCOPE },
      ],
    },
    familyOpening({
      say: [
        '“नमस्ते, मैं MANOVAIDYA Clinic से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
        '“आज हमारा दूसरा Family Guidance Session है। आज के सेशन में हम पहले आपकी सबसे महत्वपूर्ण एक-दो परेशानियाँ समझेंगे, फिर बच्चे की निर्धारित home activities पर guidance देंगे और आखिर में आगे की योजना तय करेंगे। यह लगभग 25–30 मिनट का सेशन रहेगा। क्या अभी आराम से बात कर सकते हैं?”',
      ].join('\n'),
    }),
    {
      title: 'STEP 02 — PARENT का अनुभव और मुख्य परेशानी',
      time: 'Target: 3 मिनट',
      blocks: [
        { t: 'note', label: 'Method (Connect → Reflect)', tone: 'info', text: 'पहले पूरी बात सुनें, बीच में रोककर लगातार सवाल न पूछें। फिर उनकी परेशानी अपने शब्दों में दोहराकर confirm करें।' },
        { t: 'one', id: 'concern1', label: 'Q1 “पिछले Family Session में जो गतिविधियाँ निर्धारित हुई थीं, उन्हें घर पर करते समय सबसे ज़्यादा मुश्किल किस बात में आती है?” (Primary Concern)', options: CONCERN_AREAS, other: 'Other', req: true },
        { t: 'text', id: 'concernDetails', label: 'Parent के अपने शब्दों में (मुख्य परेशानी 1-2)', long: true },
        { t: 'say', text: '“यानी आपकी मुख्य परेशानी यह है कि [Concern] — मैं सही समझ रही हूँ ना?”' },
        { t: 'check', id: 'concernConfirmed', label: 'Parent ने Confirm किया' },
        { t: 'text', id: 'otherProblems', label: 'बाकी / अतिरिक्त समस्याएँ (अलग Task) — Task ID' },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'यहाँ चुनी मुख्य समस्या आगे Step 04 में उठाई जाएगी — उसे Step 04 / 06 में दोबारा न पूछें, वहीं से आगे बढ़ें।' },
      ],
    },
    {
      title: 'STEP 03 — TRACKER 01 की प्राथमिकताएँ सरल भाषा में',
      time: 'Target: 5 मिनट',
      blocks: [
        { t: 'note', label: 'Purpose', tone: 'info', text: 'Day 60 के Development Tracker में पहचानी गई प्राथमिकताओं और बाकी ज़रूरतों को सरल भाषा में समझाना। सिर्फ़ approved summary बोलें — score की व्याख्या, नई diagnosis या prognosis नहीं।' },
        { t: 'auto', id: 'trackerNow', label: 'Tracker 01 Summary (CRM)', from: 'trackerSummary:DT-01', hint: 'Development Tracker' },
        { t: 'say', text: '“आपके बच्चे का पहला Development Tracker हो चुका है। उसमें डॉक्टर और टीम ने देखा कि अभी किन skills पर ज़्यादा ध्यान देना सबसे उपयोगी रहेगा। हर बच्चे में अलग skills पर अलग गति से काम होता है। आज मैं उसी रिपोर्ट की मुख्य बातें समझाऊँगी।”' },
        { t: 'matrix', id: 'priorities', label: 'Tracker 01 Priorities', columns: [
          { id: 'goal', label: 'Approved Priority / Goal (CRM से)', type: 'text' },
          { id: 'meaning', label: 'सरल भाषा में मतलब (Approved)', type: 'text' },
          { id: 'activity', label: 'Assigned Activity', type: 'text' },
        ], rows: [{ id: 'p1', label: '1' }, { id: 'p2', label: '2' }, { id: 'rest', label: 'बाकी जरूरतें' }] },
        { t: 'one', id: 'trackerRecord', label: 'Tracker Record', options: ['Approved summary CRM में है', 'नहीं है → Clarification Task (Psychologist)'] },
        { t: 'text', id: 'trackerTask', label: 'Task ID', show: NO_RECORD },
        { t: 'say', text: '“हमने पहले [Foundation Goal] पर ध्यान दिया था। अब Tracker और clinical review के अनुसार [Current Priority] पर काम करना उपयोगी रहेगा। इस skill का उद्देश्य सिर्फ़ activity करवाना नहीं, बल्कि बच्चे को रोज़मर्रा में [Functional Ability] के लिए तैयार करने में सहायता करना है।”' },
        { t: 'matrix', id: 'skillPath', label: 'Skill path', columns: [
          { id: 'foundation', label: 'Foundation Goal (FS-01)', type: 'text' },
          { id: 'current', label: 'Approved Current Priority (Tracker 01)', type: 'text' },
          { id: 'ability', label: 'Functional Ability (दैनिक जीवन में)', type: 'text' },
          { id: 'next', label: 'Next Direction (clinician)', type: 'text' },
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
        { t: 'auto', id: 'prevActions', label: 'पिछली बार तय Home Action (FS-01)', from: 'actions:FS-01', hint: 'Family Session History' },
        { t: 'matrix', id: 'actionStatus', label: 'Home Action — अभी की स्थिति', columns: [
          { id: 'action', label: 'पिछली बार तय Home Action', type: 'text' },
          { id: 'status', label: 'अभी की स्थिति', type: 'one', options: ['Regular', 'Sometimes', 'Not Started', 'Difficulty'] },
        ], rows: [{ id: 'a1', label: 'Action 01' }, { id: 'a2', label: 'Action 02' }] },
        { t: 'note', tone: 'info', text: 'Step 02 में चुनी समस्या: (दोबारा न पूछें — अब सिर्फ़ उसका कारण)' },
        { t: 'text', id: 'q3', label: 'Q3 “जब यह समस्या होती है, तब ठीक उस समय क्या हो रहा होता है — बच्चा क्या करता है और आप क्या करते हैं?”', long: true },
        { t: 'many', id: 'barriers', label: 'असल बाधा पहचानें (जो लागू हो ✓)', options: ['Activity बच्चे के लिए कठिन है', 'Sensory discomfort', 'Instruction स्पष्ट नहीं', 'समय उपयुक्त नहीं', 'बच्चा distress में', 'Parent के पास समय / थकान', 'Material / जगह की कमी', 'Other'], other: 'Other' },
        { t: 'one', id: 'medicalCheck', label: 'Medical check: “क्या बच्चे को उस समय कोई दर्द, पेट की परेशानी या नींद की समस्या रहती है?”', options: ['नहीं', 'हाँ → ऊपर Triage / Doctor Review Task'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'बच्चा activity नहीं कर रहा तो इसका मतलब यह नहीं कि parent प्रयास नहीं कर रहे। Parent को दोष न दें और तुरंत “ज़्यादा देर बैठाइए / ज़्यादा कीजिए” न कहें — पहले level, समय, बाधा और बच्चे की भागीदारी समझें।' },
      ],
    },
    {
      title: 'STEP 05 — Technique की Demonstration / Correction',
      time: 'Target: 8 मिनट • सबसे ज़रूरी हिस्सा',
      blocks: [
        { t: 'note', label: 'Method (Guide → Practice)', tone: 'info', text: 'पहले पूछें “क्या मैं इसके लिए एक छोटा तरीका समझाऊँ?” फिर approved training के अनुसार 1–2 techniques ही। कोई भी नई technique Counsellor नहीं चुनेगा।' },
        { t: 'matrix', id: 'q5', label: 'Q5 “किस activity को दोबारा समझाने या demonstrate कराने की ज़रूरत है?”', columns: [{ id: 'value', label: 'विवरण', type: 'text' }], rows: [
          { id: 'training', label: 'Activity / Training (Approved)' }, { id: 'module', label: 'Module / Part' }, { id: 'level', label: 'Current Level' },
          { id: 'when', label: 'किस समय करवाई जाती है' }, { id: 'distress', label: 'बच्चा कब परेशान होता है' }, { id: 'better', label: 'किस स्थिति में भागीदारी बेहतर' },
        ] },
        { t: 'many', id: 'demoBy', label: 'किसने समझाया / demonstration किया', options: ['Counsellor — approved steps का revision', 'Psychologist', 'Therapist', 'अलग Therapist Appointment चाहिए'] },
        { t: 'text', id: 'separateAppt', label: 'अलग appointment: तारीख / Task ID' },
        { t: 'say', text: '“आप मुझे अपने शब्दों में बताइए कि घर पर अगली बार यह activity कैसे करेंगे?” (Teach-Back)' },
        { t: 'text', id: 'teachBackText', label: 'Parent ने जो बताया', long: true },
        { t: 'grid', id: 'trainingVerification', label: 'CRM Training Verification', rows: [
          { id: 'paper', label: 'Paper Understanding', options: ['Clear', 'Partial', 'Not Clear'] },
          { id: 'demo', label: 'Demonstration', options: ['Done', 'Pending', 'Not Required'] },
          { id: 'practice', label: 'Parent Practice', options: ['Demonstrated', 'Verbal Understanding Only', 'Needs Support'] },
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Training अधूरी हो तो उसे छुपाकर Session Complete न दिखाएँ — अलग Therapist Training Appointment और Task बनाएँ। फोन पर सिर्फ़ तरीका बताना Verbal Understanding है, Demonstration नहीं। एक सेशन में 1–2 technique, पाँच-दस नई activities नहीं।' },
      ],
    },
    {
      title: 'STEP 06 — Parent Support, थकान और Routine',
      time: 'Target: 4 मिनट',
      blocks: [
        { t: 'note', tone: 'info', text: 'सिर्फ़ तब पूछें जब Step 02 / 04 में Parent या caregiver की कठिनाई, समय या थकान चुनी गई हो। कठिन routine पहले दर्ज हो चुकी है — दोबारा न पूछें; नहीं तो “Manage हो रहा है” चुनकर Step 07 पर जाएँ।' },
        { t: 'one', id: 'q7', label: 'Q7 “आप और परिवार के दूसरे सदस्य इन गतिविधियों को manage कर पा रहे हैं, या कुछ सहयोग की ज़रूरत है?”', options: ['Manage हो रहा है', 'Practical Guidance चाहिए', 'Family Support चाहिए', 'Training Support चाहिए', 'Psychological Support / Referral'] },
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
          { id: 'activity', label: 'Updated Home Action', type: 'text' },
          { id: 'person', label: 'Responsible Person', type: 'text' },
          { id: 'frequency', label: 'Duration / बार', type: 'text' },
          { id: 'review', label: 'Review Date', type: 'date' },
        ], rows: [{ id: 'a1', label: 'Action 01' }, { id: 'a2', label: 'Action 02' }] },
        { t: 'say', text: [
          '“हमने [Foundation Goal] से शुरुआत की थी। अब [Current Priority] पर काम करने से बच्चे को रोज़मर्रा में [Functional Ability] में सहायता मिलेगी — और अगली review में आगे की दिशा तय होगी।”',
          '“आपका दूसरा Development Tracker लगभग Day 120 पर होगा। उससे पहले Day 110 पर एक छोटा मेडिकल फॉलो-अप रहेगा। आप पहले से दी गई गतिविधियाँ निर्धारित तरीके से करते रहें; अलग से नई activities शुरू करने की ज़रूरत नहीं।”',
          '“सामान्य दैनिक observations का छोटा रिकॉर्ड रखिए। लेकिन कोई नई, बढ़ती या महत्वपूर्ण स्वास्थ्य समस्या, दवा से तकलीफ़ या safety concern हो तो अगली तारीख का इंतज़ार न करें — क्लीनिक से संपर्क करें या तुरंत चिकित्सकीय सहायता लें। धन्यवाद।”',
        ].join('\n') },
        contactRules(),
        { t: 'link', id: 'fu05Link', label: 'Follow-up 05 (Day 110)', code: 'FU-05', options: ['Scheduled', 'Pending'] },
        { t: 'link', id: 'dt02Link', label: 'Development Tracker 02 (Day 120)', code: 'DT-02', options: ['Confirmed', 'Pending'] },
      ],
    },
    {
      title: 'SECTION B–E — CRM Session Record & Completion',
      blocks: [
        { t: 'grid', id: 'sessionRecord', label: 'Session FS-02', rows: [
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
        taskRegister(5),
        { t: 'note', label: 'Mandatory', tone: 'warn', text: MANDATORY },
      ],
    },
    familyCompletion({
      rules: [
        'Guardian identity verified', 'Urgent issue triage हुआ', 'Parent की 1-2 मुख्य परेशानियाँ दर्ज', 'Tracker 01 की approved priorities समझाईं',
        'घर की activity की बाधा पहचानी', 'Training review / demonstration या task assigned', 'Teach-Back से Parent समझ checked',
        'Updated Home Action (अधिकतम 2) + Responsible Person दर्ज', 'Day 110 FU और Tracker 02 की तारीख बताई', 'Pending actions के अलग Task, Owner, Due Date', 'Contact Rules समझाए',
      ],
      trainingNote: 'Training Completed तभी चुनें जब इस सेशन में वास्तव में demonstration हुआ। नहीं हुआ तो “Not Applicable”।',
    }),
    { title: "Staff DO'S & DON'TS", blocks: [DOS_DONTS] },
  ],
};
