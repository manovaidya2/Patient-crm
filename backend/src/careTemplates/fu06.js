// MV-FU-06 • छठा फॉलो-अप: Family Session 03 की Activity, आदतें और अनुभव (Day 170): Day-180 Home Action Start, Habits & Feedback.
const B = require('./blocks');

// ---- Local helpers (the text of this PDF differs from the shared helpers in blocks.js) ------------------------------
const NO_CONCERN = 'कोई नई परेशानी नहीं';
const CONCERN = { id: 'safety', not: [NO_CONCERN] };
const TRIAGE_LEVELS = [
  { value: 'Emergency', timing: 'तुरंत — कॉल के दौरान', action: 'गंभीर एलर्जी, साँस की तकलीफ़, दौरे या दूसरे emergency संकेत: तुरंत emergency medical care की सलाह और clinic escalation।' },
  { value: 'Urgent Doctor Review', timing: 'Clinical Lead के approved समय में (लक्ष्य: उसी दिन)', action: 'दवा के बाद नई / बढ़ी तकलीफ़, उल्टी, पेट ख़राब, एलर्जी, ज़्यादा सुस्ती, गंभीर नींद की समस्या, पानी की कमी, अचानक regression / skill का खोना: Doctor Review Task आज ही।' },
  { value: 'Routine Support', timing: '____ कार्यदिवस में', action: 'सिर्फ़ दवा देने की असुविधा / सामान्य सवाल। नया clinical symptom इस श्रेणी में नहीं आता।' },
];
const MED_OK = 'सब नियमित (→ अगले Step)';
const MED_PROBLEM = { id: 'medRoutine', not: [MED_OK] };
const FUTURE_VISION_RULE = 'यह Medical Follow-up है — इसमें next phase या आगे की care की counselling नहीं होगी। Parent कोई सुधार बताए तो सिर्फ़ एक लाइन में सराहें: “यह बहुत अच्छा कदम है — [Child Name] के पौधे में नई पत्ती जैसा। Family Session में इसे और आगे जोड़ेंगे।” और CRM में ‘Parent-reported win’ नोट करें (FS में Auto जाएगा)।';
const NOT_STARTED = { id: 'practiceDays', any: ['शुरू नहीं हुई', 'तरीक़ा याद नहीं'] };

module.exports = {
  code: 'FU-06',
  key: 'MV-FU-06',
  version: 2,
  kind: 'followup',
  seq: 6,
  day: 170,
  title: 'छठा फॉलो-अप: Family Session 03 की Activity, आदतें और अनुभव',
  subtitle: 'Day-180 Home Action Start, Habits & Feedback',
  meta: [
    ['Template Code', 'MV-FU-06'],
    ['Scheduled', 'Day 170 (Family Session 03 के 5 दिन बाद)'],
    ['Target Duration', '8–10 मिनट'],
    ['Responsible', 'Trained Medical Counsellor'],
    ['Based On', 'Family Session 03 (Day 165) का Day-180 Home Action'],
    ['Next', 'Tracker 03 — Day 180 • Doctor की Final Clinical Review'],
    ['Status', 'Clinical approval required before implementation'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    B.sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (1–2 मिनट)',
      blocks: [
        { t: 'note', tone: 'info', label: 'इस कॉल का एक ही काम', text: 'FS-03 में तय Day-180 तक की activity घर पर शुरू कराना, अब तक की कौन सी बातें आदत बन गईं यह जानना, और parent का अनुभव लेना। अंतिम Tracker और Doctor Review की प्रक्रिया FS-03 में समझाई जा चुकी है — यहाँ सिर्फ़ तारीख confirm होगी। कोई परिणाम, package या गारंटी की बात नहीं।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'fs03Actions', label: 'FS-03: Day 180 तक Home Action (अधिकतम 2) + Responsible Person', from: 'actions:FS-03', hint: 'CRM Auto' },
          { id: 'priorities', label: 'FS-03: Parent Future Priorities (recorded)', from: 'ans:FS-03:priorities', hint: 'CRM Auto' },
          { id: 'finalReviewDate', label: 'Tracker 03 + Final Clinical Review की तारीख', from: '', hint: 'Clinic में तय — लिखें' },
          { id: 'medicinePlan', label: 'Medicine Plan की स्थिति + अगली Refill', from: 'nextDispatch', hint: 'Medicine Record' },
          { id: 'openIssues', label: 'सभी Open Issues', from: 'openIssues', hint: 'CRM Auto' },
        ] },
        { t: 'note', tone: 'rule', label: 'Future Vision Rule (इस कॉल में)', text: FUTURE_VISION_RULE },
        { t: 'text', id: 'parentWin', label: 'Parent-reported win (अगर Parent ने कोई सुधार बताया — एक लाइन)' },
      ],
    },
    {
      title: 'STEP 01 — GREETING',
      time: '30 सेकंड',
      blocks: [
        { t: 'say', text: `${B.GREETING_LINE}\n“Family Session के बाद आज छठा और इस चरण का आख़िरी छोटा फॉलो-अप है — लगभग 8–10 मिनट।”` },
        { t: 'response', id: 'response', label: 'Response', options: ['Available → Start', 'Busy → Schedule Again', 'Not Connected → Follow Contact SOP'] },
        { t: 'note', tone: 'info', text: 'Reschedule तारीख / समय और Attempt नं.: Busy या Not Connected चुनने पर CRM का call system (Reschedule / Record call attempt) इन्हें दर्ज करता है।', show: { id: 'response', not: ['Available → Start'] } },
      ],
    },
    {
      title: 'STEP 02 — SAFETY SCREEN (सबसे पहले)',
      time: '30 सेकंड',
      blocks: [
        { t: 'say', text: '“Family Session के बाद बच्चे को कोई नई या बढ़ी हुई शारीरिक परेशानी या दवा से तकलीफ़ रही?”' },
        { t: 'one', id: 'safety', label: 'Safety', options: [NO_CONCERN, 'नई परेशानी', 'पुरानी परेशानी बढ़ी'] },
        { t: 'text', id: 'safetyDetail', label: 'यदि हाँ — क्या, कब से, कितनी बार, दवा से जुड़ा लगता है?', long: true, show: CONCERN },
        { t: 'triage', id: 'triage', label: 'Triage Level (एक चुनें)', levels: TRIAGE_LEVELS, show: CONCERN },
        { t: 'text', id: 'triageEscalateTo', label: 'Escalate किसे / कब', show: CONCERN },
        { t: 'note', tone: 'info', label: 'Task ID: Auto', text: 'Emergency या Urgent Doctor Review चुनने पर form save होते ही doctor को advice request अपने-आप जाती है (Task ID वहीं से)।', show: { id: 'triage', any: ['Emergency', 'Urgent Doctor Review'] } },
      ],
    },
    {
      title: 'STEP 03 — MEDICINE',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: '“दवाइयाँ नियमित चल रही हैं? Final Review तक की दवा आपके पास है?”' },
        { t: 'one', id: 'medRoutine', label: 'Medicine', options: [MED_OK, 'कभी-कभी छूटती है', 'बच्चा मना करता है', 'समय / slot उलझ रहा', 'दवा रुकी / ख़त्म होने वाली'] },
        { t: 'many', id: 'medSlots', label: 'सिर्फ़ यदि परेशानी — कौन सा slot', options: ['M1', 'M2', 'M3', 'M4', 'M5 Nasya', 'M6 तेल'], show: MED_PROBLEM },
        { t: 'text', id: 'medReason', label: 'वजह', show: MED_PROBLEM },
        { t: 'note', tone: 'rule', label: 'Staff', text: 'दवा की मात्रा / समय / नाम अपनी तरफ़ से नहीं बदलना। अगली Refill / Dispatch तारीख (नीचे) — कमी हो तो Pharmacy / Doctor को Task दें।' },
        { t: 'auto', id: 'refillDate', label: 'अगली Refill / Dispatch तारीख', from: 'nextDispatch', hint: 'Medicine Record' },
      ],
    },
    {
      title: 'STEP 04 — FS-03 की Activity: शुरुआत',
      time: '3 मिनट',
      blocks: [
        { t: 'one', id: 'practiceDays', label: 'Q1 “Family Session में Day 180 तक के लिए जो activity तय हुई थी, वह पिछले 5 दिनों में कितने दिन हुई?”', options: ['रोज़', 'कुछ दिन', 'शुरू नहीं हुई', 'तरीक़ा याद नहीं'] },
        { t: 'say', text: 'अगर शुरू नहीं हुई / तरीक़ा याद नहीं:\n“मैं तीन छोटे स्टेप फिर बताती/बताता हूँ।” → नीचे की सीढ़ी; ज़रूरत हो तो Therapist Task।', show: NOT_STARTED },
        { t: 'matrix', id: 'ladder', label: 'अगले दिनों की सीढ़ी — parent का Reminder Card (approved paper से भरें, बोलकर समझाएँ)', columns: [
          { id: 'activity', label: 'Activity', type: 'text' },
          { id: 's1', label: 'दिन 1–3: स्टेप 1', type: 'text' },
          { id: 's2', label: 'दिन 4–7: स्टेप 2', type: 'text' },
          { id: 's3', label: 'दिन 8+: स्टेप 3', type: 'text' },
          { id: 'when', label: 'कब / कितनी देर · कौन', type: 'text' },
        ], rows: [{ id: 'a1', label: '1.' }, { id: 'a2', label: '2. (ज़रूरत हो तभी)' }] },
        { t: 'text', id: 'teachBackText', label: 'Q2 Teach-Back — “मैंने जो बताया, उसमें से आप कल सबसे पहले क्या करेंगे, और कैसे?” — Parent ने जो बताया (संक्षेप में)', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back', options: ['सही बताया', 'आंशिक — दोबारा समझाया', 'समझ नहीं आया → Therapist Re-demo Task'] },
      ],
    },
    {
      title: 'STEP 05 — क्या आदत बन गई (Maintenance)',
      time: '2 मिनट',
      blocks: [
        { t: 'say', text: 'Q3 “इन छह महीनों में जो-जो सीखा, उनमें से कौन सी बात अब रोज़ की आदत बन गई है, और किसमें अब भी याद दिलाना पड़ता है?”' },
        { t: 'text', id: 'habitsFormed', label: 'Maintenance — आदत बन गई', long: true },
        { t: 'text', id: 'habitsNeedSupport', label: 'Maintenance — अब भी सहायता चाहिए', long: true },
        { t: 'say', text: '“जो आदत बन गई है, उसे छोड़ना नहीं है — वही आगे की नींव है। जो अभी याद दिलाना पड़ता है, उसे Doctor की Final Review में साथ देखेंगे।”' },
      ],
    },
    {
      title: 'STEP 06 — अंतिम Tracker / Final Review: सिर्फ़ तारीख',
      time: '1 मिनट',
      blocks: [
        { t: 'one', id: 'finalDates', label: 'Q4 “Tracker-03 और Doctor की Final Review की तारीख आपके लिए ठीक है?”', options: ['तय है', 'बदलनी है → Scheduling Task', 'यात्रा / समय की कठिनाई → Support Task'] },
        { t: 'note', tone: 'info', text: 'याद दिलाएँ: observation notes और तारीख वाली छोटी वीडियो साथ लाएँ। (प्रक्रिया FS-03 में समझाई जा चुकी है — दोबारा न समझाएँ।)' },
      ],
    },
    {
      title: 'STEP 07 — आपका अनुभव (सिर्फ़ यहीं पूछा जाता है)',
      time: '2 मिनट',
      blocks: [
        { t: 'one', id: 'feedback', label: 'Q5 “इन 6 महीनों में हमारी टीम के साथ आपका अनुभव कैसा रहा, और क्या कुछ बेहतर हो सकता था?” — Feedback', options: ['बहुत अच्छा', 'ठीक', 'सुधार चाहिए'] },
        { t: 'text', id: 'feedbackWords', label: 'Parent के शब्दों में', long: true },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'आगे का इलाज, दवा बंद / जारी रखना, package या outcome के बारे में कोई वादा न करें; “Doctor की Final Review में आपकी प्राथमिकताओं के साथ तय होगा” ही कहें। नकारात्मक feedback हो तो बहस न करें — सुनें, record करें और Team Lead को भेजें।' },
      ],
    },
    {
      title: 'Open Issues (केवल अगर बाकी हों)',
      blocks: [
        { t: 'note', tone: 'info', text: 'Open Issue — केवल अगर CRM में किसी भी विभाग का कोई बाकी हो।' },
        { t: 'auto', id: 'openIssuesNow', label: 'Open Issues (CRM — सभी विभाग)', from: 'openIssues', hint: 'CRM Auto', long: true },
        { t: 'say', text: '“पिछली बार जो [Issue] बताई गई थी, उसकी अब क्या स्थिति है?”' },
        { t: 'one', id: 'openIssue', label: 'Open Issue की स्थिति', options: ['Resolved', 'In Progress → Existing Task update', 'Unresolved → Escalate'] },
      ],
    },
    {
      title: 'STEP 08 — SUPPORT और समापन',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'support', label: 'Q “इन सबके अलावा कोई ज़रूरी बात है जिसमें हमारी टीम की सहायता चाहिए?”', options: ['No Further Support', 'Support Needed → Task (नीचे)'] },
        { ...B.taskRegister(3), label: 'Support / Task — Department / Owner, Due, Task ID (हर पंक्ति = एक Task)' },
        { t: 'say', text: '“आज हमने Day 180 तक की activity तय की और आपका अनुभव लिखा। अंतिम Tracker और Doctor की समीक्षा के बाद आगे की व्यक्तिगत योजना बताई जाएगी। इस बीच कोई नई या बढ़ती हुई परेशानी, दवा से तकलीफ़ या safety की चिंता हो तो इंतज़ार न करें, clinic से संपर्क करें; emergency हो तो तुरंत नज़दीकी अस्पताल जाएँ।”' },
        { t: 'one', id: 'verify', label: 'Verify: “क्या आपको साफ़ है कि अब घर पर क्या करना है और किस परेशानी में तुरंत संपर्क करना है?”', options: ['Clear', 'Needs Clarification'] },
        { t: 'matrix', id: 'finalSchedule', label: 'Tracker 03 + Doctor Final Review (Clinic में — CRM session नहीं)', columns: [
          { id: 'status', label: 'Status', type: 'one', options: ['Scheduled', 'Pending'] },
          { id: 'date', label: 'तारीख', type: 'date' },
        ], rows: [{ id: 'tracker03', label: 'Tracker 03 (Day 180)' }, { id: 'finalReview', label: 'Doctor Final Review' }] },
      ],
    },
    {
      title: 'CALL OUTCOME',
      blocks: [
        { t: 'final', id: 'final', label: 'CALL OUTCOME (एक चुनें)', options: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Re-demo / Training Pending', 'Rescheduled'] },
        { t: 'text', id: 'caseNote', label: 'काउंसलर के नोट्स', long: true },
        { t: 'text', id: 'parentFeedback', label: 'Parent से शिकायत / सुझाव (अगर दिया)', long: true },
      ],
    },
  ],
};
