// MV-FU-04 • चौथा फॉलो-अप: Family Session 02 की नई Activity की शुरुआत (Day 110): New Activity Start, Step-by-Step & Tracker-02 Readiness.
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
const STARTED = { id: 'practiceDays', any: ['रोज़', 'कुछ दिन'] };
const NOT_STARTED = { id: 'practiceDays', any: ['शुरू नहीं हुई', 'तरीक़ा याद नहीं'] };

module.exports = {
  code: 'FU-04',
  key: 'MV-FU-04',
  version: 2,
  kind: 'followup',
  seq: 4,
  day: 110,
  title: 'चौथा फॉलो-अप: Family Session 02 की नई Activity की शुरुआत',
  subtitle: 'New Activity Start, Step-by-Step & Tracker-02 Readiness',
  meta: [
    ['Template Code', 'MV-FU-04'],
    ['Scheduled', 'Day 110 (Family Session 02 के 5 दिन बाद)'],
    ['Target Duration', '8–10 मिनट'],
    ['Responsible', 'Trained Medical Counsellor'],
    ['Based On', 'Family Session 02 (Day 105) का Updated Home Action'],
    ['Next', 'Development Tracker 02 — Day 120 • Follow-up 05 — Day 140'],
    ['Status', 'Clinical approval required before implementation'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    B.sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (1–2 मिनट)',
      blocks: [
        { t: 'note', tone: 'info', label: 'इस कॉल का एक ही काम', text: 'FS-02 में तय नई / updated activity घर पर सही से शुरू कराना और Tracker-02 की तैयारी। Tracker-01 का result, parent की परेशानी और caregiver support FS-02 में हो चुके हैं — दोबारा नहीं। अलग जगह / अलग लोगों वाली बात FU-05 में observation के रूप में होगी।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'fs02Actions', label: 'FS-02: Updated Home Action 01 / 02 + Responsible Person', from: 'actions:FS-02', hint: 'CRM Auto' },
          { id: 'fs02TeachBack', label: 'FS-02: Teach-Back / Demonstration Status / Therapist Task', from: 'ans:FS-02:teachBack', hint: 'CRM Auto' },
          { id: 'tracker02Date', label: 'Tracker-02 की तारीख', from: 'date:DT-02', hint: 'CRM Auto' },
          { id: 'medicine', label: 'Medicine Schedule', from: 'prescription', hint: 'CRM Auto' },
          { id: 'refill', label: 'Refill (अगली Refill / Dispatch)', from: 'nextDispatch', hint: 'CRM Auto' },
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
        { t: 'say', text: `${B.GREETING_LINE}\n“Family Session के बाद आज चौथा फॉलो-अप है। आज सिर्फ़ यह देखेंगे कि नई activity घर पर कैसे शुरू हुई, और Tracker की तैयारी — लगभग 8–10 मिनट।”` },
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
        { t: 'say', text: '“दवाइयाँ नियमित चल रही हैं?”' },
        { t: 'one', id: 'medRoutine', label: 'Medicine', options: [MED_OK, 'कभी-कभी छूटती है', 'बच्चा मना करता है', 'समय / slot उलझ रहा', 'दवा रुकी / ख़त्म होने वाली'] },
        { t: 'many', id: 'medSlots', label: 'सिर्फ़ यदि परेशानी — कौन सा slot', options: ['M1', 'M2', 'M3', 'M4', 'M5 Nasya', 'M6 तेल'], show: MED_PROBLEM },
        { t: 'text', id: 'medReason', label: 'वजह', show: MED_PROBLEM },
        { t: 'note', tone: 'rule', label: 'Staff', text: 'दवा की मात्रा / समय / नाम अपनी तरफ़ से नहीं बदलना। अगली Refill / Dispatch तारीख (नीचे) — कमी हो तो Pharmacy / Doctor को Task दें।' },
        { t: 'auto', id: 'refillDate', label: 'अगली Refill / Dispatch तारीख', from: 'nextDispatch', hint: 'Medicine Record' },
      ],
    },
    {
      title: 'STEP 04 — FS-02 की नई Activity: शुरुआत, स्टेप-बाय-स्टेप',
      time: '4–5 मिनट',
      blocks: [
        { t: 'one', id: 'practiceDays', label: 'Q1 “Family Session में जो नई activity तय हुई थी, वह पिछले 5 दिनों में कितने दिन हुई?”', options: ['रोज़', 'कुछ दिन', 'शुरू नहीं हुई', 'तरीक़ा याद नहीं'] },
        { t: 'one', id: 'childAttitude', label: 'Q2 “करते समय बच्चे का रवैया कैसा रहा?”', options: ['रुचि से किया', 'थोड़ी मदद से किया', 'मना / रोया', 'अभी देखा नहीं'] },
        { t: 'say', text: 'Script A — रोज़ / कुछ दिन:\n“बहुत अच्छा। अब इसे इस सीढ़ी से आगे बढ़ाइए — एक बार में एक ही स्टेप।”', show: STARTED },
        { t: 'say', text: 'Script B — शुरू नहीं हुई / तरीक़ा याद नहीं:\n“कोई बात नहीं। मैं FS-02 में बताए तीन छोटे स्टेप फिर से बताती/बताता हूँ।” → नीचे की सीढ़ी; ज़रूरत हो तो Therapist Re-demo Task।', show: NOT_STARTED },
        { t: 'matrix', id: 'ladder', label: 'अगले दिनों की सीढ़ी — parent का Reminder Card (approved paper से भरें, बोलकर समझाएँ)', columns: [
          { id: 'activity', label: 'Activity', type: 'text' },
          { id: 's1', label: 'दिन 1–3: स्टेप 1', type: 'text' },
          { id: 's2', label: 'दिन 4–7: स्टेप 2', type: 'text' },
          { id: 's3', label: 'दिन 8+: स्टेप 3', type: 'text' },
          { id: 'when', label: 'कब / कितनी देर · कौन', type: 'text' },
        ], rows: [{ id: 'a1', label: '1.' }, { id: 'a2', label: '2. (ज़रूरत हो तभी)' }] },
        { t: 'text', id: 'teachBackText', label: 'Q3 Teach-Back — “मैंने जो बताया, उसमें से आप कल सबसे पहले क्या करेंगे, और कैसे?” — Parent ने जो बताया (संक्षेप में)', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back', options: ['सही बताया', 'आंशिक — दोबारा समझाया', 'समझ नहीं आया → Therapist Re-demo Task'] },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'सिर्फ़ FS-02 में approved activity; कोई नई activity या technique न जोड़ें। “ज़्यादा देर बैठाइए” जैसी सलाह न दें।' },
      ],
    },
    {
      title: 'STEP 05 — Tracker-02 की तैयारी',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'trackerPrep', label: 'Q4 “पिछली बार Tracker भरने में कोई बात मुश्किल लगी थी, जो इस बार साफ़ कर लें?”', options: ['कोई मुश्किल नहीं', 'मुश्किल', 'तारीख तय नहीं → Scheduling Task'], other: 'मुश्किल' },
        { t: 'note', tone: 'info', text: 'सिर्फ़ याद दिलाएँ (पूरी व्याख्या नहीं — वह FU-02 में हो चुकी है): देखा हुआ लिखें • “10 में से कितनी बार” • छोटा तारीख वाला वीडियो।' },
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
      title: 'STEP 06 — SUPPORT और समापन',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'support', label: 'Q “इन सबके अलावा कोई ज़रूरी बात है जिसमें हमारी टीम की सहायता चाहिए?”', options: ['No Further Support', 'Support Needed → Task (नीचे)'] },
        { ...B.taskRegister(3), label: 'Support / Task — Department / Owner, Due, Task ID (हर पंक्ति = एक Task)' },
        { t: 'say', text: '“आज हमने नई activity के तीन स्टेप तय किए। Tracker लगभग Day 120 पर होगा और अगला फॉलो-अप लगभग Day 140 पर। इस बीच कोई नई या बढ़ती हुई परेशानी, दवा से तकलीफ़ या safety की चिंता हो तो इंतज़ार न करें, clinic से संपर्क करें; emergency हो तो तुरंत नज़दीकी अस्पताल जाएँ।”' },
        { t: 'one', id: 'verify', label: 'Verify: “क्या आपको साफ़ है कि अब घर पर क्या करना है और किस परेशानी में तुरंत संपर्क करना है?”', options: ['Clear', 'Needs Clarification'] },
        { t: 'link', id: 'dt02Link', label: 'Development Tracker 02 (≈ Day 120)', code: 'DT-02', options: ['Planned', 'Scheduling Pending'] },
        { t: 'link', id: 'fu05Link', label: 'Follow-up 05 (Day 140)', code: 'FU-05', options: ['Scheduled', 'Pending'] },
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
