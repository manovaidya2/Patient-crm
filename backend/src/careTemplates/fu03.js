// MV-FU-03 • तीसरा फॉलो-अप: शरीर की नींव और इलाज की Routine (Day 80): Diet, Gut, Sleep & Ayurvedic Procedures • FS-02 की तैयारी.
const B = require('./blocks');

const NO_CONCERN = 'कोई नई परेशानी नहीं';
const CONCERN = { id: 'safety', not: [NO_CONCERN] };
const MED_OK = 'सब नियमित (→ अगले Step)';
const MED_PROBLEM = { id: 'medStatus', not: [MED_OK] };
const DOCTOR_TASK = 'Doctor Review Task';
const TRACKER_PENDING = 'Pending → नई तारीख';
const SUPPORT_NEEDED = 'Support Needed → Task (नीचे)';
const OPEN_ISSUE = ['Resolved', 'In Progress → Existing Task update', 'Unresolved → Escalate'];
const PROC_COLUMNS = [
  { id: 'regular', label: 'नियमित?', type: 'one', options: ['हाँ', 'कभी-कभी', 'नहीं'] },
  { id: 'method', label: 'तरीक़ा सही?', type: 'one', options: ['सही', 'उलझन'] },
  { id: 'reaction', label: 'बच्चे की प्रतिक्रिया', type: 'one', options: ['ठीक', 'मना करता', 'असहज'] },
];

const FUTURE_VISION_RULE = 'यह Medical Follow-up है — इसमें next phase या आगे की care की counselling नहीं होगी। Parent कोई सुधार बताए तो सिर्फ़ एक लाइन में सराहें: “यह बहुत अच्छा कदम है — [Child Name] के पौधे में नई पत्ती जैसा। Family Session में इसे और आगे जोड़ेंगे।” और CRM में ‘Parent-reported win’ नोट करें (FS में Auto जाएगा)।';

const callInfo = B.callInfo();
callInfo.blocks.unshift({ t: 'note', tone: 'info', label: 'इस कॉल का एक ही काम', text: 'विकास की नींव — भूख-पाचन (अग्नि), मल, नींद, और Ayurvedic procedures (Nasya, तेल, Marma) घर पर सही चल रहे हैं या नहीं, यह देखना; और FS-02 के लिए parent की 1–2 मुख्य बातें पहले से जान लेना। Home activity की practice FU-02 में देखी जा चुकी है — यहाँ दोबारा नहीं।' });

module.exports = {
  code: 'FU-03',
  key: 'MV-FU-03',
  version: 2,
  kind: 'followup',
  seq: 3,
  day: 80,
  title: 'तीसरा फॉलो-अप: शरीर की नींव और इलाज की Routine',
  subtitle: 'Diet, Gut, Sleep & Ayurvedic Procedures • FS-02 की तैयारी',
  meta: [
    ['Template Code', 'MV-FU-03'],
    ['Scheduled', 'Day 80'],
    ['Target Duration', '8–10 मिनट'],
    ['Responsible', 'Trained Medical Counsellor'],
    ['Based On', 'Diet Plan • Medicine / Nasya / Oil / Marma papers • Tracker 01 (status)'],
    ['Next', 'Family Session 02 — Day 105'],
    ['Status', 'Clinical approval required before implementation'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    callInfo,
    {
      title: 'BEFORE CALL — STAFF PREPARATION (1–2 मिनट)',
      blocks: [
        { t: 'facts', id: 'prep', rows: [
          { id: 'dietPlan', label: 'Diet Plan (approved)', from: '', hint: 'CRM Auto' },
          { id: 'dietDifficulty', label: 'FS-01 में Diet की कठिनाई (Parent Guidance की ज़रूरत ✓)', from: 'ans:FS-01:guidanceNeeds', hint: 'CRM Auto' },
          { id: 'nasya', label: 'Prescribed Procedure: Nasya (M5)', from: 'med:M5', hint: 'Medicine Record' },
          { id: 'nasyaHome', label: 'Nasya Home Start Allowed', from: 'ans:FCF-04:nasyaHomeStart', hint: 'FCF-04' },
          { id: 'oil', label: 'Prescribed Procedure: तेल / अभ्यंग (M6)', from: 'med:M6', hint: 'Medicine Record' },
          { id: 'marma', label: 'Prescribed Procedure: Marma (slot)', from: '', hint: 'Medicine Record' },
          { id: 'tracker', label: 'Tracker-01 Status (Completed / Pending)', from: 'status:DT-01', hint: 'CRM Auto' },
          { id: 'interim', label: 'Doctor ने Tracker-01 review के बाद कोई interim activity दी? (हाँ / नहीं)', from: '', hint: 'Clinical Record' },
          { id: 'practice', label: 'Practice status (FU-02)', from: 'ans:FU-02:practiceStep', hint: 'FU-02' },
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
        '“आज तीसरा फॉलो-अप है। आज हम बच्चे के खान-पान, नींद और दवा के procedures देखेंगे, और अगले Family Session की तैयारी करेंगे — लगभग 8–10 मिनट।”',
      ].join('\n'),
    }),
    {
      title: 'STEP 02 — SAFETY SCREEN (सबसे पहले)',
      time: '30 सेकंड',
      blocks: [
        { t: 'say', text: '“पिछले फॉलो-अप के बाद बच्चे को कोई नई या बढ़ी हुई शारीरिक परेशानी रही — बुखार, पेट, उल्टी या दवा से कोई तकलीफ़?”' },
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
        { t: 'say', text: '“खाने वाली दवाइयाँ नियमित चल रही हैं?”' },
        { t: 'many', id: 'medStatus', label: 'Medicine', options: [MED_OK, 'कभी-कभी छूटती है', 'बच्चा मना करता है', 'समय / slot उलझ रहा', 'दवा रुकी / ख़त्म होने वाली'] },
        { t: 'many', id: 'medSlots', label: 'सिर्फ़ यदि परेशानी — कौन सा slot', options: ['M1', 'M2', 'M3', 'M4', 'M5 Nasya', 'M6 तेल'], show: MED_PROBLEM },
        { t: 'text', id: 'medReason', label: 'वजह', show: MED_PROBLEM },
        { t: 'note', label: 'Staff', tone: 'rule', text: 'दवा की मात्रा / समय / नाम अपनी तरफ़ से नहीं बदलना। कमी हो तो Pharmacy / Doctor को Task दें।' },
        { t: 'auto', id: 'refillDate', label: 'अगली Refill / Dispatch तारीख', from: 'nextDispatch', hint: 'CRM Auto' },
      ],
    },
    {
      title: 'STEP 04 — नींव की जाँच: भूख, पाचन, मल, नींद',
      time: '3 मिनट',
      blocks: [
        { t: 'say', text: '“जैसा Family Session में बताया था, विकास की नींव शरीर से शुरू होती है — भूख ठीक हो, पेट साफ़ हो और नींद पूरी हो तो ध्यान और व्यवहार पर काम आसान होता है। इसलिए आज बस चार छोटी बातें देखती हूँ।”' },
        { t: 'grid', id: 'bodyRoutine', label: 'अभी की स्थिति (एक चुनें)', rows: [
          { id: 'appetite', label: 'भूख (अग्नि)', options: ['ठीक', 'कम', 'बहुत ज़्यादा / बार-बार माँगना', 'अनियमित'] },
          { id: 'stool', label: 'मल / पेट', options: ['रोज़, सामान्य', 'कब्ज़', 'ढीला / बार-बार', 'पेट दर्द / गैस'] },
          { id: 'sleep', label: 'नींद', options: ['समय पर, पूरी', 'देर से सोना', 'रात में बार-बार उठना', 'दिन में बहुत सोना'] },
          { id: 'diet', label: 'Diet Plan का पालन', options: ['ज़्यादातर', 'आधा', 'मुश्किल'] },
        ] },
        { t: 'matrix', id: 'bodyWords', label: 'Parent के शब्द', columns: [{ id: 'words', label: 'Parent के शब्द', type: 'text' }], rows: [
          { id: 'appetite', label: 'भूख (अग्नि)' }, { id: 'stool', label: 'मल / पेट' }, { id: 'sleep', label: 'नींद' }, { id: 'diet', label: 'Diet Plan का पालन' },
        ] },
        { t: 'text', id: 'hardestMeal', label: 'सबसे मुश्किल भोजन / समय' },
        { t: 'many', id: 'bodyAction', label: 'कोई बात बिगड़ी हुई हो', options: ['सामान्य सलाह (approved diet के भीतर) दी', DOCTOR_TASK] },
        { t: 'text', id: 'bodyTask', label: 'Doctor Review Task — Task ID', show: { id: 'bodyAction', any: [DOCTOR_TASK] } },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Diet, दवा या procedure में कोई नया बदलाव Counsellor नहीं बताएगा। लगातार कब्ज़ / दस्त, वज़न गिरना, खाना पूरा बंद या गंभीर नींद की समस्या हो तो Doctor Review Task — Tracker या FS तक न टालें।' },
      ],
    },
    {
      title: 'STEP 05 — Ayurvedic Procedures: Nasya / तेल / Marma (सिर्फ़ जो prescribed हैं)',
      time: '2 मिनट',
      blocks: [
        { t: 'say', text: '“[Nasya / तेल मालिश / Marma] रोज़ हो पा रहा है? करते समय बच्चा कैसा रहता है, और तरीक़े में कोई उलझन तो नहीं?”' },
        { t: 'matrix', id: 'procedures', label: 'Procedure', columns: PROC_COLUMNS, rows: [
          { id: 'nasya', label: 'Nasya (M5)' }, { id: 'oil', label: 'बाहरी तेल (M6)' }, { id: 'marma', label: 'Marma Points' },
        ] },
        { t: 'note', tone: 'info', text: 'जो prescribed नहीं, उस पंक्ति को “लागू नहीं” मानकर छोड़ें। तरीक़े में उलझन हो → approved paper से सिर्फ़ उसी हिस्से का revision, या video demonstration Task।' },
        { t: 'text', id: 'procTask', label: 'Video demonstration Task — Task ID' },
      ],
    },
    {
      title: 'STEP 06 — Tracker-01 (सिर्फ़ status) और ज़रूरत हो तो interim activity',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'tracker01Status', label: 'Q “Tracker-01 हो गया था? कोई दिक्कत तो नहीं आई?” (Status only)', options: ['Completed', TRACKER_PENDING, 'छूट गया → Scheduling Task'] },
        { t: 'date', id: 'tracker01NewDate', label: 'नई तारीख', show: { id: 'tracker01Status', any: [TRACKER_PENDING] } },
        { t: 'note', tone: 'rule', text: 'Tracker का result इस कॉल में नहीं समझाया जाएगा। वह Doctor review के बाद Family Session 02 में approved भाषा में समझाया जाता है।' },
        { t: 'say', text: 'Parent पूछें तो: “Tracker की मुख्य बातें डॉक्टर की review के बाद Family Session में विस्तार से समझाएँगे।”' },
        { t: 'one', id: 'interim', label: 'केवल अगर Doctor ने Tracker-01 review के बाद कोई interim activity दी हो (CRM में) — नहीं तो छोड़ें', options: ['हाँ', 'नहीं'] },
        { t: 'say', text: '“डॉक्टर ने Tracker के बाद घर के लिए एक छोटी बात जोड़ी है: [Activity]। इसे [कब / कितनी देर] करना है; विस्तार से तरीक़ा Family Session में करेंगे।”', show: { id: 'interim', any: ['हाँ'] } },
      ],
    },
    {
      title: 'STEP 07 — Family Session 02 की तैयारी (parent की बात पहले से)',
      time: '1–2 मिनट',
      blocks: [
        { t: 'say', text: '“लगभग Day 105 पर आपका दूसरा Family Session होगा। उसमें Tracker की मुख्य बातें और घर की activity का अगला स्तर समझाया जाएगा। उस सेशन में आप सबसे पहले किन एक-दो बातों पर बात करना चाहेंगे? मैं अभी लिख लेती हूँ, ताकि वहाँ आपको सब दोबारा न बताना पड़े।”' },
        { t: 'text', id: 'fs02Point1', label: 'Q1 “FS-02 में आप किन 1–2 बातों पर सबसे पहले बात करना चाहेंगे?” — Point 1' },
        { t: 'text', id: 'fs02Point2', label: 'Point 2' },
        { t: 'one', id: 'fs02Attendees', label: 'Session में कौन-कौन रहेगा', options: ['Mother', 'Father', 'Both'] },
        { t: 'text', id: 'fs02Caregiver', label: 'मुख्य Caregiver' },
        { t: 'one', id: 'fs02Mode', label: 'Mode', options: ['Clinic', 'Video Call', 'Call'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'यहाँ लिखी बातें FS-02 के Step 02 में सीधे दिखेंगी — वहाँ parent से दोबारा पूरी सूची नहीं पूछी जाएगी।' },
        { t: 'note', label: 'Open Issues (केवल अगर बाकी हों)', tone: 'info', text: 'Open Issue — केवल अगर CRM में किसी भी विभाग का कोई बाकी हो। Unresolved → Escalate' },
        { t: 'say', text: '“पिछली बार जो [Issue] बताई गई थी, उसकी अब क्या स्थिति है?”' },
        { t: 'one', id: 'openIssue', label: 'Open Issue', options: OPEN_ISSUE },
        { t: 'text', id: 'openIssueRef', label: 'Open Issue / Task ID (CRM Register से)', show: { id: 'openIssue', any: OPEN_ISSUE } },
      ],
    },
    {
      title: 'STEP 08 — SUPPORT और समापन',
      time: '1–2 मिनट',
      blocks: [
        { t: 'one', id: 'support', label: 'Q “इन सबके अलावा कोई ज़रूरी बात है जिसमें हमारी टीम की सहायता चाहिए?” (Single Select)', options: ['No Further Support', SUPPORT_NEEDED] },
        { ...B.taskRegister(3), label: 'Support / Task — Department / Owner — Task ID — Due (हर पंक्ति = एक Task)' },
        { t: 'say', text: '“आज हमने बच्चे की नींव — खान-पान, पेट, नींद और procedures — देखी और आपकी दो बातें FS-02 के लिए लिख लीं। Family Session लगभग Day 105 पर होगा। इस बीच कोई नई या बढ़ती हुई परेशानी, दवा से तकलीफ़ या safety की चिंता हो तो इंतज़ार न करें, clinic से संपर्क करें; emergency हो तो तुरंत नज़दीकी अस्पताल जाएँ।”' },
        { t: 'one', id: 'verify', label: 'Verify: “क्या आपको साफ़ है कि अब घर पर क्या करना है और किस परेशानी में तुरंत संपर्क करना है?”', options: ['Clear', 'Needs Clarification'] },
        { t: 'link', id: 'fs02Link', label: 'Family Session 02 (Day 105)', code: 'FS-02', options: ['Confirmed', 'Pending'] },
        { t: 'final', id: 'final', label: 'CALL OUTCOME (एक चुनें)', options: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Re-demo / Training Pending', 'Rescheduled'] },
        { t: 'text', id: 'parentWin', label: 'Parent-reported win (Future Vision Rule — सिर्फ़ अगर parent ने कोई सुधार बताया; FS में Auto जाएगा)', long: true },
        { t: 'text', id: 'counsellorNotes', label: 'काउंसलर के नोट्स', long: true },
        { t: 'text', id: 'parentFeedback', label: 'Parent से शिकायत / सुझाव (अगर दिया)', long: true },
      ],
    },
  ],
};
