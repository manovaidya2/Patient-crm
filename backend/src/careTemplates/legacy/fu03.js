// MV-FU-03 • Medical Follow-up 03 (Day 50): Treatment Continuity & First Tracker Preparation.
const {
  sessionInfo, greeting, safetyScreen, medicineContinuity, openIssues, parentSupport, futureConnection, closing, crmSummary,
  DIFFICULTY, DIFFICULTY_ACTION, GREETING_LINE, CLOSING_LINE, journeyRule,
} = require('./blocks');

const DIFF = { id: 'activityStatus', any: ['Difficulty'] };

module.exports = {
  code: 'FU-03',
  key: 'MV-FU-03',
  version: 1,
  kind: 'followup',
  seq: 3,
  day: 50,
  title: 'Treatment Continuity & First Tracker Preparation',
  subtitle: 'काउंसलर फ़ॉर्म — कॉल के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FU-03'],
    ['Scheduled', 'Day 50'],
    ['Target Duration', '5–6 मिनट'],
    ['Responsible', 'Medical Counsellor'],
    ['Previous Review', 'FU-02 • Day 20'],
    ['Next Review', 'Day 80 (Tracker 01: Day 60)'],
    ['Status', 'Clinical approval required before implementation'],
  ],
  sections: [
    sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (30–45 सेकंड, कॉल से पहले)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'nameStart', label: 'Patient Name / Actual Treatment Start Date', from: 'patientNameStart', hint: 'CRM Auto' },
          { id: 'fu01', label: 'FU-01 Status', from: 'statusDate:FU-01', hint: 'CRM Auto' },
          { id: 'fu02', label: 'FU-02 Status', from: 'statusDate:FU-02', hint: 'CRM Auto' },
          { id: 'openIssues', label: 'सभी Open Issues — पूरे patient के (Medicine / Family Session / Tracker / Guidance)', from: 'openIssues', hint: 'CRM Auto' },
          { id: 'medicine', label: 'Current Approved Medicine Schedule', from: 'prescription', hint: 'CRM Auto' },
          { id: 'fs01', label: 'Family Session 01 Status', from: 'statusDate:FS-01', hint: 'CRM Auto' },
          { id: 'homeTherapy', label: 'Assigned Home Therapy', from: 'homeTherapy', hint: 'CRM Auto' },
          { id: 'tracker', label: 'First Development Tracker Date', from: 'date:DT-01', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'Next Medicine Dispatch / Refill Due Date', from: 'nextDispatch', hint: 'CRM Auto' },
          { id: 'journey', label: 'Journey Card: Current Goal + Functional Purpose (Approved)', from: 'journeyGoal', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'पिछली बार की कोई समस्या pending है तो उसी का reference लेकर बात करनी है। पूरी history दोबारा नहीं पूछनी।' },
      ],
    },
    greeting({ say: `${GREETING_LINE}\n“जी, आज बच्चे का तीसरा छोटा मेडिकल फॉलो-अप है। इसमें हम दवाइयों और घर की गाइडेंस से संबंधित ज़रूरी चीज़ें चेक करेंगे। लगभग पाँच मिनट लगेंगे।”` }),
    safetyScreen({ say: '“पिछले फॉलो-अप के बाद बच्चे को कोई नई या बढ़ी हुई शारीरिक परेशानी हुई, या दवाइयों से कोई तकलीफ़ हुई?”' }),
    medicineContinuity({ say: '“बच्चे की जो दवाइयाँ सुबह से लेकर रात तक निर्धारित हैं, उनका रूटीन नियमित चल रहा है ना? कोई दवाई छूट रही है या देने में परेशानी आ रही है?”' }),
    openIssues({ say: '“पिछली बार आपने [Previous Concern] बताया था। उस संबंध में हमारी टीम से आपको सहायता मिल गई थी?”' }),
    {
      title: 'STEP 05 — HOME THERAPY & GUIDANCE',
      time: '60 सेकंड',
      blocks: [
        { t: 'auto', id: 'activityName', label: 'Assigned Activity / Guidance Name', from: 'homeTherapy', hint: 'CRM' },
        { t: 'text', id: 'activityModule', label: 'Module / Part' },
        { t: 'say', text: '“जो [Assigned Home Therapy / Training Name] आपको समझाई गई थी, वह घर पर कर पा रहे हैं ना?”' },
        { t: 'one', id: 'activityStatus', label: 'Home therapy', options: ['Regular', 'Sometimes', 'Not Started', 'Difficulty', 'Training Pending'] },
        { t: 'say', text: 'यदि Difficulty — “तरीका समझने में परेशानी है, बच्चा सहयोग नहीं कर पा रहा, या समय की दिक्कत है?”', show: DIFF },
        { t: 'many', id: 'difficulty', label: 'Difficulty', options: DIFFICULTY, other: 'Other', show: DIFF },
        { t: 'note', label: 'Staff Action', tone: 'rule', text: DIFFICULTY_ACTION },
        { t: 'text', id: 'activityTask', label: 'Task ID / Owner' },
        { t: 'say', text: 'सिर्फ़ अगर पिछला paper issue open था — “पिछली बार [Diet / Marma / Parent Guidance / Therapy Paper] के बारे में जो बात बताई थी, वह clear हो गई?”' },
        { t: 'one', id: 'paperIssue', label: 'Paper issue', options: ['Yes', 'No → Task Update', 'लागू नहीं'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'सभी पेपरों के बारे में दोबारा अलग-अलग सवाल नहीं — सिर्फ़ open issue या नई बताई गई बात पर। Difficulty यहाँ एक बार दर्ज होगी; अंत में दोबारा न पूछें।' },
      ],
    },
    {
      title: 'STEP 06 — FIRST DEVELOPMENT TRACKER — तारीख़ की पुष्टि',
      time: '45 सेकंड',
      blocks: [
        { t: 'auto', id: 'trackerDate', label: 'Tracker Date', from: 'date:DT-01', hint: 'CRM' },
        { t: 'say', text: '“लगभग 60वें दिन आपके बच्चे का पहला Development Tracker होगा। इसमें डॉक्टर और टीम बच्चे के निर्धारित goals की व्यवस्थित समीक्षा करेंगे और उसी के आधार पर आगे की दिशा तय होगी। आपकी तारीख़ [Tracker Date] है।”\n“इसके लिए अलग से कोई नई तैयारी नहीं चाहिए — जो activities समझाई गई हैं, उन्हें निर्धारित तरीके से जारी रखिए। किसी में परेशानी हो तो बताइए।”' },
        { t: 'one', id: 'trackerConfirm', label: 'Tracker', options: ['Tracker Date Confirmed', 'Scheduling Pending', 'Parent Needs Explanation', 'Goal / Assessment Record Missing'] },
        { t: 'info', head: ['अगर Parent पूछे', 'जवाब'], rows: [
          ['‘अभी improvement क्यों नहीं पूछा?’', '“बच्चे की progress को सही तरीके से समझने के लिए अलग Development Tracker रखा है। उसमें शुरुआती स्थिति से तुलना होती है, इसलिए रोज़ के छोटे बदलावों की जगह पूरी अवधि का pattern साफ़ दिखता है।”'],
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'इस कॉल पर Tracker के सवाल नहीं पूछने। Date confirm / scheduling task ही।' },
      ],
    },
    parentSupport({ time: '45 सेकंड' }),
    futureConnection({
      say: '“अगली Tracker review में डॉक्टर इन्हीं approved goals को देखेंगे। अभी की activity का उद्देश्य है [Functional Purpose] के लिए नियमित अभ्यास बनाए रखना।”',
      rule: journeyRule('अगली review में किन approved goals पर ध्यान रहेगा, यह जोड़ें'),
    }),
    closing({
      say: [
        '“ठीक है, आज हमने बच्चे की दवाइयों और घर की activities से जुड़ी ज़रूरी चीज़ें चेक कर ली हैं। जो परेशानी आपने बताई है, उसके लिए संबंधित टीम को जानकारी भेज दी जाएगी।”',
        '“अब लगभग Day 60 पर आपका पहला Development Tracker रहेगा। उसमें बच्चे के निर्धारित लक्ष्यों को व्यवस्थित रूप से review किया जाएगा।”',
        CLOSING_LINE,
      ].join('\n'),
      links: [
        { id: 'dt01Link', label: 'Tracker 01 (Day 60)', code: 'DT-01', options: ['Scheduled', 'Pending'] },
        { id: 'fu04Link', label: 'Next Follow-up (Day 80)', code: 'FU-04', options: ['Scheduled', 'Pending'] },
      ],
    }),
    crmSummary({
      title: 'Follow-up 03 Outcome',
      rows: [
        { id: 'openIssues', label: 'Open Issues (सभी विभाग)', options: ['Resolved', 'Pending', 'N/A'] },
        { id: 'medicine', label: 'Medicine Routine', options: ['Regular', 'Partial', 'Difficulty'] },
        { id: 'slot', label: 'Medicine Issue Slot', options: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'N/A'] },
        { id: 'concern', label: 'New Medical Concern', options: ['No', 'Review', 'Urgent'] },
        { id: 'home', label: 'Assigned Home Therapy', options: ['Regular', 'Partial', 'Not Started'] },
        { id: 'guidance', label: 'Guidance Problem', options: ['No', 'Yes'] },
        { id: 'fs01', label: 'Family Session 01', options: ['Completed', 'Pending'] },
        { id: 'support', label: 'Parent Support', options: ['No', 'Task Required'] },
        { id: 'tracker', label: 'First Tracker Status', options: ['Scheduled', 'Pending'] },
        { id: 'next', label: 'Next Medical Follow-up', options: ['Day 80', 'Rescheduled'] },
      ],
      finals: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Tracker Scheduling Pending', 'Rescheduled'],
      tasks: 3,
      doNotAsk: ['“कितना improvement आया?”', '“बच्चे का Autism कितना ठीक हुआ?”', '“Speech कितना बढ़ा?”', '“Eye Contact कितना बढ़ा?”', '“Behaviour पहले से कितने प्रतिशत ठीक हुआ?”', '“आप treatment से कितने satisfied हैं?”'],
      exception: 'अभिभावक स्वयं skill loss, गंभीर behavioural change या दूसरी महत्वपूर्ण clinical समस्या बताए तो उसकी अनदेखी नहीं करनी — Triage करें।',
    }),
  ],
};
