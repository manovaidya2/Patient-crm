// MV-FU-01 • Medical Follow-up 01 (Day 10): Treatment Start, Medicine Routine & Parent Support.
const { callInfo, greeting, triage, closing, crmSummary } = require('./blocks');

const NOT_ISSUE = (id, ok) => ({ id, not: ok });
// One medicine slot of Step 3: the medicine from the approved prescription, the script, the answer and the reason.
const slot = ({ n, title, hint, say, options, ok, reason, staff }) => ({
  title,
  blocks: [
    { t: 'auto', id: `m${n}Med`, label: 'Medicine (Approved Prescription से)', from: `med:M${n}`, hint },
    ...(staff ? [{ t: 'note', label: 'Staff', tone: 'rule', text: staff }] : []),
    { t: 'say', text: say },
    { t: 'one', id: `m${n}`, label: `M${n} status`, options, req: true },
    { t: 'text', id: `m${n}Reason`, label: `यदि परेशानी: ${reason} — Reason`, show: NOT_ISSUE(`m${n}`, ok) },
  ],
});

const closingSection = closing({
  title: 'STEP 9 — NEXT SESSION & CLOSING',
  time: '45 सेकंड',
  say: [
    '“ठीक है, आज आपकी ज़रूरी चीज़ें चेक हो गई हैं। जो भी परेशानी आपने बताई है, उसे हमने नोट किया है।”',
    '“आपका पहला Family Session लगभग 15वें दिन रहेगा। उसमें बच्चे की developmental ज़रूरतें, उसका पहला लक्ष्य, उसका रोज़मर्रा में उद्देश्य और आगे की दिशा तथा घर पर किए जाने वाले काम को विस्तार से समझाया जाएगा। उसके बाद 20वें दिन आपका अगला छोटा मेडिकल फॉलो-अप होगा।”',
    '“आपके बच्चे की developmental progress का अलग structured review (Development Tracker) होगा। अभी हम यह सुनिश्चित कर रहे हैं कि treatment और home guidance सही तरीके से शुरू हो।”',
    '“अगर बीच में कोई नई परेशानी आए तो निर्धारित दिन का इंतज़ार न करें, ज़रूरत के अनुसार क्लीनिक से संपर्क करें या तुरंत चिकित्सकीय सहायता लें। धन्यवाद।”',
  ].join('\n'),
  links: [
    { id: 'fs01Link', label: 'Family Session 01 (Day 15)', code: 'FS-01', options: ['Scheduled', 'Pending'] },
    { id: 'fu02Link', label: 'Next Follow-up (Day 20)', code: 'FU-02', options: ['Day 20', 'Rescheduled'] },
  ],
});
closingSection.blocks.push(
  { t: 'note', label: 'DO NOT ASK IN FU-01', tone: 'danger', text: ['“बच्चे में कितना improvement हुआ?”', '“Speech कितनी बढ़ी?”', '“Eye contact कितना ठीक हुआ?”', '“Autism कितना ठीक हुआ?”', '“बच्चा पहले से कितना बदल गया?”'].map((q) => `• ${q}`).join('\n') },
  { t: 'note', label: 'Note', tone: 'info', text: 'Developmental outcome की समीक्षा निर्धारित Tracker में होगी। नई स्वास्थ्य समस्या और safety चिंता की जाँच हर समय लागू रहती है।' },
  { t: 'text', id: 'extraNotes', label: 'कॉल के दौरान के अतिरिक्त नोट्स / Parent के और सवाल', long: true },
);

module.exports = {
  code: 'FU-01',
  key: 'MV-FU-01',
  version: 1,
  kind: 'followup',
  seq: 1,
  day: 10,
  title: 'Treatment Start, Medicine Routine & Parent Support',
  subtitle: 'काउंसलर फ़ॉर्म — कॉल के साथ साथ भरें',
  meta: [
    ['Patient Group', 'Autism / ADHD / Child Development'],
    ['Template Code', 'MV-FU-01'],
    ['Scheduled', 'Actual treatment start के Day 10 पर'],
    ['Target Duration', '8–10 मिनट'],
    ['Responsible', 'Medical Counsellor'],
    ['Status', 'Clinical approval required before implementation'],
  ],
  sections: [
    callInfo(),
    {
      title: 'SECTION A — कॉल से पहले (Staff Only, लगभग 1 मिनट)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में यह जानकारी पहले से दिखे; देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'sectionA', rows: [
          { id: 'patientName', label: 'Patient Name', from: 'patientName', hint: 'Patient Profile' },
          { id: 'childAge', label: 'Child Age', from: 'childAge', hint: 'Patient Profile' },
          { id: 'parentName', label: 'Parent Name', from: 'parentName', hint: 'Patient Profile' },
          { id: 'treatmentStart', label: 'Treatment Start Date', from: 'treatmentStart', hint: 'Medicine Record' },
          { id: 'dueDate', label: 'Follow-up Due Date', from: 'dueDate', hint: 'CRM' },
          { id: 'prescription', label: 'Approved Prescription', from: 'prescription', hint: 'Clinical Record' },
          { id: 'explanation', label: 'Medicine Explanation', from: 'explanation', hint: 'Completed / Pending' },
          { id: 'pendingComplaint', label: 'Pending Complaint', from: 'pendingComplaint', hint: 'Yes / No' },
          { id: 'nextFamily', label: 'Next Family Session', from: 'statusDate:FS-01', hint: 'CRM' },
        ] },
        { t: 'list', id: 'counsellorChecklist', label: 'Medical Counsellor Checklist', items: [
          'मरीज़ की वर्तमान prescription खोल ली',
          'छह medicine timing slots में जो निर्धारित हैं उन्हें देख लिया',
          'Panchakarma / Nasya / Oil Paper चेक कर लिया',
          'Diet Plan और Home Therapy Paper खोल लिया',
          'पूरे patient के open issues (सभी विभाग) पढ़ लिए',
        ] },
        { t: 'note', label: 'Rule', tone: 'rule', text: 'पिछले पेपर या किसी दूसरे मरीज़ की dosing instructions इस्तेमाल नहीं करनी हैं। सिर्फ़ इसी मरीज़ की Approved Prescription के अनुसार पूछें।' },
      ],
    },
    greeting({
      title: 'STEP 1 — OPENING',
      time: '45 सेकंड',
      say: [
        '“नमस्ते, मैं MANOVAIDYA Clinic से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
        '“आज बच्चे का पहला मेडिकल फॉलो-अप है। इसमें हम बस यह चेक करेंगे कि दवाइयाँ और घर की गाइडेंस सही तरीके से चल रही हैं और आपको कोई परेशानी तो नहीं आ रही। करीब 10 मिनट लगेंगे। क्या अभी बात कर सकते हैं?”',
      ].join('\n'),
    }),
    {
      title: 'STEP 2 — TREATMENT START',
      time: '45 सेकंड',
      blocks: [
        { t: 'say', text: '“सबसे पहले यह बताइए कि बच्चे की सभी दवाइयाँ शुरू हो गई हैं ना? कोई दवाई अभी शुरू नहीं हुई हो तो बताइए।”' },
        { t: 'one', id: 'treatmentStarted', label: 'Treatment start', options: ['All Started → आगे बढ़ें', 'Partially Started', 'Not Started'], req: true },
        { t: 'note', tone: 'info', text: 'यदि कोई दवाई शुरू नहीं हुई — सिर्फ़ यहाँ चुनें; कौन सी दवाई और वजह Step 3 में उसी slot के सामने दर्ज होगी (दोबारा यहाँ नहीं पूछें)।' },
        { t: 'check', id: 'startTaskSent', label: 'संबंधित टीम को Task भेजा', show: { id: 'treatmentStarted', not: ['All Started → आगे बढ़ें'] } },
        { t: 'text', id: 'startTask', label: 'Task ID / Owner', show: { id: 'treatmentStarted', not: ['All Started → आगे बढ़ें'] } },
      ],
    },
    {
      title: 'STEP 3 — MEDICINE ROUTINE CHECK',
      time: '4 मिनट',
      blocks: [
        { t: 'say', text: '“अच्छा, अब मैं सुबह से रात तक आपकी दवाइयों का रूटीन एक बार चेक कर लेती हूँ।”' },
        { t: 'note', label: 'सभी 6 Slots का नियम', tone: 'rule', text: 'Parent कहे “सब नियमित चल रहा है” तो छह बार dose न दोहराएँ। पर किसी item के नाम, मात्रा या तरीके में confusion हो तो उस medicine का approved paper देखकर caregiver से तरीका अपने शब्दों में दोहरवाएँ, और mismatch हो तो clinical team से verify करवाएँ।' },
        { t: 'note', tone: 'info', text: 'हर Slot में: जो prescribed नहीं है उस पर “Not Prescribed / N/A” चुनें — खाली न छोड़ें।' },
      ],
    },
    slot({
      n: 1, title: 'M1 — सुबह खाली पेट वाली दवाई', hint: '[Current Prescription: Medhya Ghrita / Actual Approved Name]',
      say: '“सुबह खाली पेट जो [Medicine Name] दी गई है, वह रोज़ सही तरीके से दे पा रहे हैं?”',
      options: ['Regular', 'Sometimes Missed', 'Difficulty', 'Not Started', 'Not Prescribed / N/A'], ok: ['Regular', 'Not Prescribed / N/A'],
      reason: '“क्या परेशानी आ रही है — बच्चा लेने से मना करता है, समय में दिक्कत है या कोई दूसरी समस्या है?”',
    }),
    slot({
      n: 2, title: 'M2 — सुबह और शाम वाली दवाई', hint: '[Actual Morning–Evening Aushadhi / Churna]',
      say: '“सुबह और शाम वाली [Medicine Name] दोनों समय दे पा रहे हैं, या कभी कोई समय छूट जाता है?”',
      options: ['Both Regular', 'Morning Missed', 'Evening Missed', 'Both Irregular', 'Difficulty', 'Not Prescribed / N/A'], ok: ['Both Regular', 'Not Prescribed / N/A'],
      reason: '“किस वजह से समय छूटता है?”',
    }),
    slot({
      n: 3, title: 'M3 — दोपहर और रात वाली दवाई', hint: '[Actual Afternoon–Night Aushadhi / Churna]',
      say: '“दोपहर और रात वाली [Medicine Name] दोनों समय सही चल रही है?”',
      options: ['Both Regular', 'One Time Missed', 'Irregular', 'Difficulty', 'Not Prescribed / N/A'], ok: ['Both Regular', 'Not Prescribed / N/A'],
      reason: '“कौन सा समय छूट रहा है और क्यों?”',
    }),
    slot({
      n: 4, title: 'M4 — रात में देने वाली दवाई', hint: '[Current Prescription: Medhya Syrup / Actual Approved Name]',
      say: '“रात में जो [Medicine Name] देनी है, वह रोज़ दे पा रहे हैं?”',
      options: ['Regular', 'Sometimes Missed', 'Difficulty', 'Not Started', 'Not Prescribed / N/A'], ok: ['Regular', 'Not Prescribed / N/A'],
      reason: '“क्या परेशानी आ रही है?”',
    }),
    slot({
      n: 5, title: 'M5 — नाक में डालने वाली दवाई (Nasya)', hint: '[Actual Prescribed Nasya] — Nasya prescribed नहीं है तो यह सवाल नहीं पूछना; N/A चुनें।',
      staff: 'Nasya की मात्रा या तरीका खुद नहीं बदलना। असुविधा, irritation या दूसरी शिकायत उचित clinical reviewer को भेजें।',
      say: '“नाक में डालने वाली दवाई जो बताई गई थी, उसका इस्तेमाल दिए गए पेपर के अनुसार कर पा रहे हैं?”',
      options: ['Regular', 'Partial', 'Not Started', 'Difficulty', 'Not Prescribed / N/A'], ok: ['Regular', 'Not Prescribed / N/A'],
      reason: '“तरीका समझने में परेशानी है या बच्चे को इस्तेमाल करते समय कोई तकलीफ़ होती है?”',
    }),
    slot({
      n: 6, title: 'M6 — बाहर लगाने वाला तेल', hint: '[Actual Medhya Oil / Abhyanga Oil / Approved External Oil] — Panchakarma / Oil Paper से linked।',
      staff: 'सिर्फ़ समस्या दर्ज करें। बिना approval इस्तेमाल का नया तरीका न बताएँ।',
      say: '“बाहर लगाने वाला जो तेल दिया गया था, उसे बताए गए तरीके से इस्तेमाल कर पा रहे हैं?”',
      options: ['Regular', 'Partial', 'Not Started', 'Difficulty', 'Not Prescribed / N/A'], ok: ['Regular', 'Not Prescribed / N/A'],
      reason: '“बच्चा लगाने नहीं देता, समय की परेशानी है, या लगाने के बाद कोई तकलीफ़ होती है?”',
    }),
    {
      title: 'Confusion वाली medicine — Teach-Back (केवल ज़रूरत हो तो)',
      blocks: [
        { t: 'text', id: 'confusionMed', label: 'किस medicine में confusion था' },
        { t: 'one', id: 'teachBack', label: 'Caregiver ने approved paper के अनुसार तरीका बताया', options: ['Match — सही', 'Mismatch → Clinical team से Verify'] },
        { t: 'text', id: 'verifyTask', label: 'Verification Task ID / Owner', show: { id: 'teachBack', any: ['Mismatch → Clinical team से Verify'] } },
      ],
    },
    {
      title: 'STEP 4 — MEDICINE SAFETY',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: '“दवाइयाँ शुरू होने के बाद बच्चे को कोई नई परेशानी तो नहीं आई? जैसे उल्टी, पेट खराब होना, एलर्जी, ज़्यादा सुस्ती या दूसरी कोई असामान्य तकलीफ़?”' },
        { t: 'one', id: 'safety', label: 'Medicine safety', options: ['No New Problem', 'Yes — New Problem', 'Existing Problem Worsened'], req: true },
        { t: 'say', text: 'यदि Yes — “क्या परेशानी हुई, कब शुरू हुई और कितनी बार हुई?”', show: { id: 'safety', not: ['No New Problem'] } },
        { t: 'matrix', id: 'problem', columns: [{ id: 'value', label: 'विवरण', type: 'text' }], rows: [
          { id: 'problem', label: 'Problem' }, { id: 'startDate', label: 'Start Date' }, { id: 'frequency', label: 'Frequency' }, { id: 'medicine', label: 'Suspected Medicine (अगर)' },
        ], show: { id: 'safety', not: ['No New Problem'] } },
        ...triage({ show: { id: 'safety', not: ['No New Problem'] } }),
        { t: 'note', label: 'Action', tone: 'rule', text: 'Doctor Review Required। काउंसलर खुद दवा बदलने, रोकने या जारी रखने का clinical निर्णय नहीं देगा। गंभीर संकेत पर तत्काल emergency medical care की सलाह और clinic escalation ज़रूरी है।' },
      ],
    },
    {
      title: 'STEP 5 — ALL GUIDANCE PAPERS',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: '“अब मैं आपके दिए गए बाकी पेपर्स भी एक बार चेक कर लेती हूँ।”' },
        { t: 'note', tone: 'info', text: 'CRM में जो papers पहले से Delivered & Clear दिख रहे हैं उन्हें दोबारा न पूछें; सिर्फ़ बाकी पर Status चुनें। जो paper जारी नहीं हुआ उसके लिए “Not Issued / N/A”। (Home Therapy Paper अगले Step में एक साथ।)' },
        { t: 'auto', id: 'issuedPapersNow', label: 'Issued papers (CRM)', from: 'issuedPapers', hint: 'CRM' },
        { t: 'grid', id: 'papers', label: 'Paper — पूछना क्या है — Status (एक चुनें)', rows: [
          { id: 'diet', label: 'Diet Plan — “डाइट प्लान के अनुसार चलने में कोई परेशानी आ रही है?”', options: ['Clear', 'Difficulty', 'Not Understood', 'Not Received', 'Not Issued / N/A'] },
          { id: 'marma', label: 'Marma Points Paper — “Marma Points का तरीका आपको स्पष्ट है?”', options: ['Clear', 'Difficulty', 'Not Understood', 'Not Received', 'Not Issued / N/A'] },
          { id: 'guidance', label: 'Parent Guidance — “Parent Guidance Paper पढ़ पाए? कोई बात समझ नहीं आई?”', options: ['Clear', 'Difficulty', 'Not Understood', 'Not Received', 'Not Issued / N/A'] },
          { id: 'omkar', label: 'Omkar Jap / Special Paper — “यदि यह दिया गया है, इसका तरीका स्पष्ट है?”', options: ['Clear', 'Difficulty', 'Not Understood', 'Not Received', 'Not Issued / N/A'] },
          { id: 'panchakarma', label: 'Panchakarma / Other Guidance — “दिए गए निर्देशों में कोई confusion है?”', options: ['Clear', 'Difficulty', 'Not Understood', 'Not Received', 'Not Issued / N/A'] },
        ] },
        { t: 'text', id: 'paperTask', label: 'Not Understood → संबंधित Psychologist / Trainer / Clinical Team को clarification task: Task ID / Owner' },
      ],
    },
    {
      title: 'STEP 6 — HOME ACTIVITY CHECK',
      time: '1 मिनट',
      blocks: [
        { t: 'auto', id: 'homeTherapyName', label: 'Assigned Home Therapy / Training', from: 'homeTherapy', hint: 'Therapy Module' },
        { t: 'text', id: 'homeModule', label: 'Module / Part' },
        { t: 'say', text: '“बच्चे के लिए जो [Assigned Home Therapy / Training] का paper दिया था, वह समझ आया और activity शुरू हो पाई है?”' },
        { t: 'one', id: 'homeActivity', label: 'Home activity', options: ['Paper Clear & Started', 'Clear — Not Started', 'Paper Not Clear', 'Paper Not Received', 'Partially Started'] },
        { t: 'say', text: 'यदि शुरू हुई — “करने में आपको या बच्चे को कोई मुश्किल आ रही है?” | यदि नहीं — “सबसे बड़ी दिक्कत क्या आ रही है?”' },
        { t: 'one', id: 'homeDifficulty', label: 'दिक्कत', options: ['No difficulty', 'समय की दिक्कत', 'तरीका समझने की दिक्कत', 'बच्चा सहयोग नहीं कर पा रहा', 'Other'], other: 'Other' },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'इस कॉल में नई therapy सिखानी नहीं है। आवश्यकता होने पर संबंधित training team को task भेजें (Home Therapy Training Task)।' },
        { t: 'text', id: 'homeTask', label: 'Home Therapy Training Task ID' },
      ],
    },
    {
      title: 'STEP 7 — PARENT CONCERN',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: '“आपकी तरफ़ से कोई ऐसी बात है जो आप हमें बताना चाहते हैं — बच्चे की दिनचर्या, परेशानी या ट्रीटमेंट को लेकर?”' },
        { t: 'one', id: 'parentConcern', label: 'Parent Concern', options: ['None', 'Recorded (नीचे लिखें)'], req: true },
        { t: 'text', id: 'concernText', label: 'Parent Concern', long: true, show: { id: 'parentConcern', any: ['Recorded (नीचे लिखें)'] } },
        { t: 'say', text: 'यदि कोई बड़ी परेशानी — “जी, मैं आपकी बात रिकॉर्ड कर रही हूँ। यह किस परिस्थिति में ज़्यादा हो रही है?” → Concern को appropriate team को भेजें।' },
        { t: 'text', id: 'concernTeam', label: 'किस team को भेजा / Task ID' },
        { t: 'info', head: ['अगर Parent कहे', 'जवाब'], rows: [
          ['‘अभी रिज़ल्ट नहीं आए’', '“जी, आपकी बात समझ रही हूँ। अभी शुरुआत के दिन हैं, इसलिए हम पहले यह देख रहे हैं कि बच्चे को दी गई गाइडेंस और ट्रीटमेंट सही तरीके से चल पा रहा है या नहीं। बच्चे के developmental goals को भी आगे नियमित रूप से review करेंगे। आपकी यह चिंता हम रिकॉर्ड में रखेंगे। जहाँ अपेक्षित बदलाव नहीं दिखेगा या नई परेशानी आएगी, वहाँ संबंधित clinical team देखेगी कि आगे क्या सहायता चाहिए।”'],
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'किसी निश्चित result या improvement का वादा न करें। Parent को गलत या लापरवाह न कहें। नई गंभीर समस्या हो तो Step 4 के Triage से escalate करें।' },
      ],
    },
    {
      title: 'STEP 8 — FUTURE CONNECTION (एक वाक्य)',
      time: '30 सेकंड',
      blocks: [
        { t: 'say', text: '“अभी हमारा ध्यान इस पर है कि दवाइयाँ और घर की guidance सही तरीके से शुरू हो जाए। यही नींव है — Family Session में आपको बच्चे का पहला developmental लक्ष्य, उसका रोज़मर्रा में उद्देश्य और आगे की संभावित दिशा समझाई जाएगी।”' },
        { t: 'facts', id: 'journey', rows: [{ id: 'goal', label: 'Current Goal (Journey Card)', from: 'journeyGoal', hint: 'CRM Auto' }] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Current Goal CRM में approved न दिखे तो सिर्फ़ ऊपर की पहली पंक्ति बोलें; नया goal या परिणाम अपनी तरफ़ से न बताएँ। (Parent की सबसे बड़ी चिंता Step 7 में एक बार दर्ज हो चुकी है — यहाँ दोबारा न पूछें।)' },
      ],
    },
    closingSection,
    crmSummary({
      title: 'Follow-up 01 Outcome',
      rows: [
        { id: 'started', label: 'Treatment Started', options: ['Yes', 'Partial', 'No'] },
        { id: 'm1', label: 'Morning Empty Stomach (M1)', options: ['Regular', 'Issue', 'N/A'] },
        { id: 'm2', label: 'Morning–Evening Medicine (M2)', options: ['Regular', 'Issue', 'N/A'] },
        { id: 'm3', label: 'Afternoon–Night Medicine (M3)', options: ['Regular', 'Issue', 'N/A'] },
        { id: 'm4', label: 'Bedtime Medicine (M4)', options: ['Regular', 'Issue', 'N/A'] },
        { id: 'm5', label: 'Nasya (M5)', options: ['Regular', 'Issue', 'N/A'] },
        { id: 'm6', label: 'External Oil (M6)', options: ['Regular', 'Issue', 'N/A'] },
        { id: 'safety', label: 'Medicine Safety', options: ['Clear', 'Review', 'Emergency'] },
        { id: 'papers', label: 'Diet & Guidance Papers', options: ['Clear', 'Pending'] },
        { id: 'home', label: 'Home Training', options: ['Started', 'Partial', 'Pending'] },
        { id: 'concern', label: 'Parent Concern', options: ['None', 'Recorded'] },
        { id: 'clinicalTask', label: 'Clinical Task', options: ['No', 'Yes'] },
        { id: 'fs01', label: 'Family Session 01', options: ['Scheduled', 'Pending'] },
        { id: 'next', label: 'Next Follow-up', options: ['Day 20', 'Rescheduled'] },
      ],
      finals: ['Completed — No Concern', 'Completed — Support Task Pending', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Treatment Start Pending', 'Call Rescheduled'],
      tasks: 4,
    }),
  ],
};
