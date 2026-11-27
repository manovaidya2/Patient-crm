// MV-FU-05 • पाँचवाँ फॉलो-अप: Activity की प्रगति, अलग जगह का Observation और FS-03 की तैयारी (Day 140): Progress, Generalisation Notes, Medicine Continuity.
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
const YPN = ['Y', 'Partly', 'N'];
const INTERIM = { id: 'interimActivity', any: ['हाँ'] };

module.exports = {
  code: 'FU-05',
  key: 'MV-FU-05',
  version: 2,
  kind: 'followup',
  seq: 5,
  day: 140,
  title: 'पाँचवाँ फॉलो-अप: Activity की प्रगति, अलग जगह का Observation और FS-03 की तैयारी',
  subtitle: 'Progress, Generalisation Notes, Medicine Continuity',
  meta: [
    ['Template Code', 'MV-FU-05'],
    ['Scheduled', 'Day 140'],
    ['Target Duration', '8–10 मिनट'],
    ['Responsible', 'Trained Medical Counsellor'],
    ['Based On', 'FU-04 की सीढ़ी • Tracker 02 (status) • Medicine Plan'],
    ['Next', 'Family Session 03 — Day 165'],
    ['Status', 'Clinical approval required before implementation'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    B.sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (1–2 मिनट)',
      blocks: [
        { t: 'note', tone: 'info', label: 'इस कॉल का एक ही काम', text: 'FS-02 वाली activity कहाँ तक पहुँची, बच्चा उसे घर से बाहर / दूसरे लोगों के साथ करता है या नहीं — इसका observation note लेना (FS-03 इसी से भरेगा), और दवा की आगे की continuity। Tracker-02 का result और parent की थकान का सवाल यहाँ नहीं — वे FS-03 / FS-02 में हैं।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'ladder', label: 'FU-04 में तय Activity और सीढ़ी का स्टेप', from: 'ans:FU-04:ladder', hint: 'CRM Auto' },
          { id: 'tracker02', label: 'Tracker-02 Status', from: 'status:DT-02', hint: 'CRM Auto' },
          { id: 'medicinePlan', label: 'Medicine Plan: बाकी अवधि, अगली Refill / Dispatch', from: 'nextDispatch', hint: 'Medicine Record' },
          { id: 'openIssues', label: 'सभी Open Issues', from: 'openIssues', hint: 'CRM Auto' },
        ] },
        { t: 'one', id: 'interimActivity', label: 'Doctor ने Tracker-02 review के बाद कोई interim activity दी? (Clinical Record)', options: ['हाँ', 'नहीं'] },
        { t: 'text', id: 'interimActivityName', label: 'Interim Activity (Clinical Record से)', show: INTERIM },
        { t: 'note', tone: 'rule', label: 'Future Vision Rule (इस कॉल में)', text: FUTURE_VISION_RULE },
        { t: 'text', id: 'parentWin', label: 'Parent-reported win (अगर Parent ने कोई सुधार बताया — एक लाइन)' },
      ],
    },
    {
      title: 'STEP 01 — GREETING',
      time: '30 सेकंड',
      blocks: [
        { t: 'say', text: `${B.GREETING_LINE}\n“आज पाँचवाँ फॉलो-अप है। आज हम activity की प्रगति, एक छोटा observation और दवा की आगे की योजना देखेंगे — लगभग 8–10 मिनट।”` },
        { t: 'response', id: 'response', label: 'Response', options: ['Available → Start', 'Busy → Schedule Again', 'Not Connected → Follow Contact SOP'] },
        { t: 'note', tone: 'info', text: 'Reschedule तारीख / समय और Attempt नं.: Busy या Not Connected चुनने पर CRM का call system (Reschedule / Record call attempt) इन्हें दर्ज करता है।', show: { id: 'response', not: ['Available → Start'] } },
      ],
    },
    {
      title: 'STEP 02 — SAFETY SCREEN (सबसे पहले)',
      time: '30 सेकंड',
      blocks: [
        { t: 'say', text: '“पिछली बातचीत के बाद बच्चे को कोई नई या बढ़ी हुई शारीरिक परेशानी रही?”' },
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
        { t: 'say', text: '“दवाइयाँ नियमित चल रही हैं? अगली दवा कब तक की है, यह स्पष्ट है?”' },
        { t: 'one', id: 'medRoutine', label: 'Medicine', options: [MED_OK, 'कभी-कभी छूटती है', 'बच्चा मना करता है', 'समय / slot उलझ रहा', 'दवा रुकी / ख़त्म होने वाली'] },
        { t: 'many', id: 'medSlots', label: 'सिर्फ़ यदि परेशानी — कौन सा slot', options: ['M1', 'M2', 'M3', 'M4', 'M5 Nasya', 'M6 तेल'], show: MED_PROBLEM },
        { t: 'text', id: 'medReason', label: 'वजह', show: MED_PROBLEM },
        { t: 'note', tone: 'rule', label: 'Staff', text: 'दवा की मात्रा / समय / नाम अपनी तरफ़ से नहीं बदलना। अगली Refill / Dispatch तारीख (नीचे) — कमी हो तो Pharmacy / Doctor को Task दें।' },
        { t: 'auto', id: 'refillDate', label: 'अगली Refill / Dispatch तारीख', from: 'nextDispatch', hint: 'Medicine Record' },
      ],
    },
    {
      title: 'STEP 04 — Activity की प्रगति (FU-04 की सीढ़ी से आगे)',
      time: '2 मिनट',
      blocks: [
        { t: 'one', id: 'practiceStep', label: 'Q1 “[Activity] अब किस स्टेप तक पहुँची, और हफ़्ते में कितने दिन हो रही है?” — स्टेप (Activity / सीढ़ी: Staff Preparation में FU-04 से)', options: ['स्टेप 1', 'स्टेप 2', 'स्टेप 3 / आदत बन गई'] },
        { t: 'one', id: 'practiceDays', label: 'हफ़्ते में कितने दिन', options: ['रोज़', 'कुछ दिन', 'बहुत कम'] },
        { t: 'one', id: 'stopReason', label: 'अगर रुक गई है — एक वजह', options: ['बीमारी / यात्रा', 'बच्चा मना करता', 'समय नहीं', 'तरीक़ा भूल गए → Re-demo Task'] },
      ],
    },
    {
      title: 'STEP 05 — Observation: घर, दूसरे व्यक्ति, दूसरी जगह',
      time: '3 मिनट',
      blocks: [
        { t: 'say', text: '“अगले Family Session में हम देखेंगे कि बच्चा जो सीखा है, उसे रोज़मर्रा में कितना इस्तेमाल करता है। इसके लिए आज बस एक छोटा observation लिख लेती हूँ — ताकि वहाँ आपसे दोबारा न पूछना पड़े।”' },
        { t: 'matrix', id: 'observation', label: 'Q2 “यह skill बच्चा घर पर, किसी दूसरे व्यक्ति (दादी, मौसी, शिक्षक) के साथ, और किसी दूसरी जगह (पार्क, रिश्तेदार का घर) पर कर पाता है?” — Observation', columns: [
          { id: 'skill', label: 'Skill / Activity', type: 'text' },
          { id: 'home', label: 'घर पर', type: 'one', options: YPN },
          { id: 'person', label: 'दूसरे व्यक्ति के साथ', type: 'one', options: YPN },
          { id: 'place', label: 'दूसरी जगह', type: 'one', options: YPN },
        ], rows: [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }] },
        { t: 'text', id: 'observationExample', label: 'एक उदाहरण (parent के शब्द)', long: true },
        { t: 'say', text: '“अगले 3 हफ़्तों में जब भी बच्चा घर से बाहर या किसी नए व्यक्ति के साथ यह करे — या करने में अटके — तो एक लाइन लिख लीजिए या 20–30 सेकंड का वीडियो रख लीजिए।”' },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'यह score या test नहीं है — सिर्फ़ observation note। “दूसरी जगह नहीं करता” को कमी या असफलता न कहें; यह अगला स्वाभाविक कदम है। FS-03 का Step 04 इसी note से भरेगा।' },
      ],
    },
    {
      title: 'STEP 06 — Tracker-02 (सिर्फ़ status) और FS-03 की तैयारी',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'tracker02Status', label: 'Q “Tracker-02 हो गया था? कोई दिक्कत तो नहीं आई?” — Status only', options: ['Completed', 'Pending → नई तारीख', 'छूट गया → Scheduling Task'] },
        { t: 'date', id: 'tracker02NewDate', label: 'नई तारीख', show: { id: 'tracker02Status', any: ['Pending → नई तारीख'] } },
        { t: 'note', tone: 'rule', text: 'Tracker का result इस कॉल में नहीं समझाया जाएगा। वह Doctor review के बाद Family Session 03 में approved भाषा में समझाया जाता है।' },
        { t: 'say', text: 'Parent पूछें तो: “Tracker की मुख्य बातें डॉक्टर की review के बाद Family Session में विस्तार से समझाएँगे।”' },
        { t: 'note', tone: 'info', text: 'केवल अगर Doctor ने Tracker-02 review के बाद कोई interim activity दी हो — नहीं तो छोड़ें।' },
        { t: 'say', text: '“डॉक्टर ने Tracker के बाद घर के लिए एक छोटी बात जोड़ी है: [Activity]। विस्तार से तरीक़ा Family Session में होगा।”', show: INTERIM },
        { t: 'say', text: '“लगभग Day 165 पर तीसरा Family Session होगा। उसमें हम आगे की skills — बोलना-जुड़ना, रोज़ के काम खुद करना, व्यवहार सँभालना — में से आपके परिवार के लिए क्या सबसे ज़रूरी है, उस पर बात करेंगे। उसके बारे में सोचकर आइए; अभी जवाब देने की ज़रूरत नहीं।”' },
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
      title: 'STEP 07 — SUPPORT और समापन',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'support', label: 'Q “इन सबके अलावा कोई ज़रूरी बात है जिसमें हमारी टीम की सहायता चाहिए?”', options: ['No Further Support', 'Support Needed → Task (नीचे)'] },
        { ...B.taskRegister(3), label: 'Support / Task — Department / Owner, Due, Task ID (हर पंक्ति = एक Task)' },
        { t: 'say', text: '“आज हमने activity की प्रगति और घर से बाहर के observation लिख लिए। Family Session 03 लगभग Day 165 पर होगा। इस बीच कोई नई या बढ़ती हुई परेशानी, दवा से तकलीफ़ या safety की चिंता हो तो इंतज़ार न करें, clinic से संपर्क करें; emergency हो तो तुरंत नज़दीकी अस्पताल जाएँ।”' },
        { t: 'one', id: 'verify', label: 'Verify: “क्या आपको साफ़ है कि अब घर पर क्या करना है और किस परेशानी में तुरंत संपर्क करना है?”', options: ['Clear', 'Needs Clarification'] },
        { t: 'link', id: 'fs03Link', label: 'Family Session 03 (Day 165)', code: 'FS-03', options: ['Confirmed', 'Pending'] },
        { t: 'auto', id: 'nextRefill', label: 'अगली Refill / Dispatch — तारीख', from: 'nextDispatch', hint: 'Medicine Record' },
        { t: 'check', id: 'pharmacyInformed', label: 'Pharmacy को बताया' },
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
