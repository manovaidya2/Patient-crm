// MV-FU-02 • दूसरा फॉलो-अप: अभ्यास की मज़बूती और Tracker-01 की तैयारी (Day 50): Practice Consolidation & Tracker Readiness.
const B = require('./blocks');

const NO_CONCERN = 'कोई नई परेशानी नहीं';
const CONCERN = { id: 'safety', not: [NO_CONCERN] };
const MED_OK = 'सब नियमित (→ अगले Step)';
const MED_PROBLEM = { id: 'medStatus', not: [MED_OK] };
const LOW_PRACTICE = ['बहुत कम (0–1)', 'शुरू नहीं हुई'];
const SUPPORT_NEEDED = 'Support Needed → Task (नीचे)';
const OPEN_ISSUE = ['Resolved', 'In Progress → Existing Task update', 'Unresolved → Escalate'];

const FUTURE_VISION_RULE = 'यह Medical Follow-up है — इसमें next phase या आगे की care की counselling नहीं होगी। Parent कोई सुधार बताए तो सिर्फ़ एक लाइन में सराहें: “यह बहुत अच्छा कदम है — [Child Name] के पौधे में नई पत्ती जैसा। Family Session में इसे और आगे जोड़ेंगे।” और CRM में ‘Parent-reported win’ नोट करें (FS में Auto जाएगा)।';

const callInfo = B.callInfo();
callInfo.blocks.unshift({ t: 'note', tone: 'info', label: 'इस कॉल का एक ही काम', text: 'पिछले महीने की घर की practice मज़बूत करना और Tracker-01 के लिए parent को तैयार करना। Parent की परेशानी, history, papers, caregiver और diet दोबारा नहीं पूछे जाएँगे — वे FS-01 / FU-01 में दर्ज हैं (diet और body-routine FU-03 में)।' });

module.exports = {
  code: 'FU-02',
  key: 'MV-FU-02',
  version: 2,
  kind: 'followup',
  seq: 2,
  day: 50,
  title: 'दूसरा फॉलो-अप: अभ्यास की मज़बूती और Tracker-01 की तैयारी',
  subtitle: 'Practice Consolidation & Tracker Readiness',
  meta: [
    ['Template Code', 'MV-FU-02'],
    ['Scheduled', 'Day 50'],
    ['Target Duration', '6–8 मिनट'],
    ['Responsible', 'Trained Medical Counsellor'],
    ['Based On', 'Follow-up 01 (Day 20) में तय activity की सीढ़ी'],
    ['Next', 'Development Tracker 01 — Day 60 • Follow-up 03 — Day 80'],
    ['Status', 'Clinical approval required before implementation'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    callInfo,
    {
      title: 'BEFORE CALL — STAFF PREPARATION (1–2 मिनट)',
      blocks: [
        { t: 'facts', id: 'prep', rows: [
          { id: 'ladder', label: 'FU-01 में तय Activity (Issue 1 / 2) और उसकी सीढ़ी का आख़िरी स्टेप', from: 'ans:FU-01:ladder', hint: 'CRM Auto' },
          { id: 'teachBack', label: 'FU-01 का Teach-Back Result / Re-demo Task', from: 'ans:FU-01:teachBack', hint: 'CRM Auto' },
          { id: 'tracker', label: 'Tracker 01 की तारीख और भरने का तरीक़ा (Tracker System paper)', from: 'date:DT-01', hint: 'CRM Auto' },
          { id: 'medicine', label: 'Medicine Schedule', from: 'prescription', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'Refill तारीख', from: 'nextDispatch', hint: 'CRM Auto' },
          { id: 'openIssues', label: 'सभी Open Issues', from: 'openIssues', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Future Vision Rule (इस कॉल में)', tone: 'info', text: FUTURE_VISION_RULE },
      ],
    },
    B.greeting({
      time: '30 सेकंड',
      say: [
        '“नमस्ते, मैं MANOVAIDYA Clinic से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
        '“आज आपका दूसरा छोटा फॉलो-अप है। आज हम सिर्फ़ घर की practice और अगले Tracker की तैयारी देखेंगे — लगभग 6–8 मिनट।”',
      ].join('\n'),
    }),
    {
      title: 'STEP 02 — SAFETY SCREEN (सबसे पहले)',
      time: '30 सेकंड',
      blocks: [
        { t: 'say', text: '“पिछली बातचीत के बाद बच्चे को कोई नई या बढ़ी हुई शारीरिक परेशानी रही, या दवा से कोई तकलीफ़?”' },
        { t: 'one', id: 'safety', label: 'Safety', options: [NO_CONCERN, 'नई परेशानी', 'पुरानी परेशानी बढ़ी'] },
        { t: 'text', id: 'concernDetail', label: 'यदि हाँ — क्या, कब से, कितनी बार, दवा से जुड़ा लगता है?', long: true, show: CONCERN },
        { t: 'triage', id: 'triage', label: 'Triage Level (एक चुनें)', show: CONCERN, levels: [
          { value: 'Emergency', timing: 'तुरंत — कॉल के दौरान', action: 'गंभीर एलर्जी, साँस की तकलीफ़, दौरे या दूसरे emergency संकेत: तुरंत emergency medical care की सलाह और clinic escalation।' },
          { value: 'Urgent Doctor Review', timing: 'Clinical Lead के approved समय में (लक्ष्य: उसी दिन)', action: 'दवा के बाद नई / बढ़ी तकलीफ़, उल्टी, पेट ख़राब, एलर्जी, ज़्यादा सुस्ती, गंभीर नींद की समस्या, पानी की कमी, अचानक regression / skill का खोना: Doctor Review Task आज ही।' },
          { value: 'Routine Support', timing: '____ कार्यदिवस में', action: 'सिर्फ़ दवा देने की असुविधा / सामान्य सवाल। नया clinical symptom इस श्रेणी में नहीं आता।' },
        ] },
        { t: 'text', id: 'triageEscalateTo', label: 'Escalate किसे / कब', show: CONCERN },
        { t: 'note', tone: 'info', text: 'Task ID: Auto — Emergency या Urgent Doctor Review चुनने पर form save होते ही doctor को advice request अपने-आप जाती है (Task ID वहीं से)।', show: { id: 'triage', any: ['Emergency', 'Urgent Doctor Review'] } },
      ],
    },
    {
      title: 'STEP 03 — MEDICINE',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: '“दवाइयाँ ठीक चल रही हैं? कोई slot छूट रहा है?”' },
        { t: 'many', id: 'medStatus', label: 'Medicine', options: [MED_OK, 'कभी-कभी छूटती है', 'बच्चा मना करता है', 'समय / slot उलझ रहा', 'दवा रुकी / ख़त्म होने वाली'] },
        { t: 'many', id: 'medSlots', label: 'सिर्फ़ यदि परेशानी — कौन सा slot', options: ['M1', 'M2', 'M3', 'M4', 'M5 Nasya', 'M6 तेल'], show: MED_PROBLEM },
        { t: 'text', id: 'medReason', label: 'वजह', show: MED_PROBLEM },
        { t: 'note', label: 'Staff', tone: 'rule', text: 'दवा की मात्रा / समय / नाम अपनी तरफ़ से नहीं बदलना। कमी हो तो Pharmacy / Doctor को Task दें।' },
        { t: 'auto', id: 'refillDate', label: 'अगली Refill / Dispatch तारीख', from: 'nextDispatch', hint: 'CRM Auto' },
      ],
    },
    {
      title: 'STEP 04 — घर की Practice: एक महीने में क्या बदला',
      time: '3 मिनट',
      blocks: [
        { t: 'say', text: '“पिछली बार हमने [Activity] के तीन स्टेप तय किए थे। अब तक आप किस स्टेप तक पहुँचे?”' },
        { t: 'one', id: 'practiceDays', label: 'Q1 “पिछले 2 हफ़्तों में [Activity] हफ़्ते में कितने दिन हुई, और किस स्टेप तक?” (Single Select)', options: ['रोज़ (5+ दिन)', 'कुछ दिन (2–4)', ...LOW_PRACTICE] },
        { t: 'one', id: 'practiceStep', label: 'Step तक', options: ['स्टेप 1', 'स्टेप 2', 'स्टेप 3'] },
        { t: 'text', id: 'parentWin', label: 'Q2 “इस महीने बच्चे में कोई भी छोटी नई बात दिखी — जो पहले नहीं करता था?” (Open note) — Parent के शब्दों में (“पहले… अब…”)', long: true, hint: 'पहले… अब…' },
        { t: 'say', text: 'अगर बहुत कम / शुरू नहीं हुई — “कोई बात नहीं। इसे और छोटा कर देते हैं — रोज़ सिर्फ़ 2 मिनट, एक ही स्टेप।”', show: { id: 'practiceDays', any: LOW_PRACTICE } },
        { t: 'note', tone: 'warn', text: 'ज़रूरत हो तो Therapist Re-demo Task (Step 06 के Task Register में)।', show: { id: 'practiceDays', any: LOW_PRACTICE } },
        { t: 'one', id: 'nextStep', label: 'Q3 “क्या बच्चा अगला स्टेप करने को तैयार लगता है, या अभी इसी स्टेप पर और दिन चाहिए?” (Single Select)', options: ['अगला स्टेप शुरू करें', 'अभी यही स्टेप दोहराएँ', 'Activity बदलने की ज़रूरत → Clinical Clarification Task'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'नई activity इस कॉल में नहीं जोड़ी जाएगी; सिर्फ़ पुरानी का अगला स्टेप, अगर approved paper में हो। सुधार का दावा न करें — “पहले… अब…” सिर्फ़ parent के शब्द में लिखें; ये notes Tracker और FS-02 में काम आएँगे।' },
      ],
    },
    {
      title: 'STEP 05 — Tracker-01 की तैयारी',
      time: '2 मिनट',
      blocks: [
        { t: 'say', text: '“लगभग Day 60 पर बच्चे का पहला Development Tracker होगा। यह बच्चे की जाँच या ‘पास-फेल’ नहीं है — यह देखने का तरीक़ा है कि दो महीनों में किस skill में कितनी प्रगति हुई। बस इतना याद रखिए: (1) सिर्फ़ वही लिखें जो बच्चे को करते देखा है, (2) ‘कभी-कभी’ या ‘अकसर’ के लिए 10 में से कितनी बार सोचें, (3) हो सके तो 30 सेकंड का छोटा वीडियो रखें, (4) जो skill अभी शुरू नहीं हुई, उसे 0 मानें — यह बुरी बात नहीं है।”' },
        { t: 'one', id: 'trackerReady', label: 'Q4 “क्या आपको Tracker की तारीख और भरने का तरीक़ा साफ़ है?” (Single Select)', options: ['Clear', 'Needs Explanation', 'तारीख तय नहीं → Scheduling Task'] },
        { t: 'note', label: 'Open Issues (केवल अगर बाकी हों)', tone: 'info', text: 'Open Issue — केवल अगर CRM में किसी भी विभाग का कोई बाकी हो। Unresolved → Escalate' },
        { t: 'say', text: '“पिछली बार जो [Issue] बताई गई थी, उसकी अब क्या स्थिति है?”' },
        { t: 'one', id: 'openIssue', label: 'Open Issue', options: OPEN_ISSUE },
        { t: 'text', id: 'openIssueRef', label: 'Open Issue / Task ID (CRM Register से)', show: { id: 'openIssue', any: OPEN_ISSUE } },
      ],
    },
    {
      title: 'STEP 06 — SUPPORT और समापन',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'support', label: 'Q “इन सबके अलावा कोई ज़रूरी बात है जिसमें हमारी टीम की सहायता चाहिए?” (Single Select)', options: ['No Further Support', SUPPORT_NEEDED] },
        { ...B.taskRegister(3), label: 'Support / Task — Department / Owner — Task ID — Due (हर पंक्ति = एक Task)' },
        { t: 'say', text: '“ठीक है। [Activity] आगे इसी तरह (या अगले स्टेप के साथ) जारी रखिए। Tracker Day 60 के आसपास होगा, और अगला फॉलो-अप लगभग Day 80 पर — उसमें हम खान-पान, नींद और दवा-procedures की routine देखेंगे। इस बीच कोई नई या बढ़ती हुई परेशानी, दवा से तकलीफ़ या safety की चिंता हो तो इंतज़ार न करें, clinic से संपर्क करें; emergency हो तो तुरंत नज़दीकी अस्पताल जाएँ।”' },
        { t: 'one', id: 'verify', label: 'Verify: “क्या आपको साफ़ है कि अब घर पर क्या करना है और किस परेशानी में तुरंत संपर्क करना है?”', options: ['Clear', 'Needs Clarification'] },
        { t: 'link', id: 'dt01Link', label: 'Development Tracker 01 (≈ Day 60)', code: 'DT-01', options: ['Planned', 'Scheduling Pending'] },
        { t: 'link', id: 'fu03Link', label: 'Follow-up 03 (Day 80)', code: 'FU-03', options: ['Scheduled', 'Pending'] },
        { t: 'final', id: 'final', label: 'CALL OUTCOME (एक चुनें)', options: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Re-demo / Training Pending', 'Rescheduled'] },
        { t: 'text', id: 'counsellorNotes', label: 'काउंसलर के नोट्स', long: true },
        { t: 'text', id: 'parentFeedback', label: 'Parent से शिकायत / सुझाव (अगर दिया)', long: true },
      ],
    },
  ],
};
