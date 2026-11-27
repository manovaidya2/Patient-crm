// MV-FU-04 • Medical Follow-up 04 (Day 80): Treatment Continuity & Family Session Preparation.
const {
  sessionInfo, greeting, safetyScreen, medicineContinuity, openIssues, parentSupport, futureConnection, closing, crmSummary,
  DIFFICULTY, DIFFICULTY_ACTION, GREETING_LINE, CLOSING_LINE, STATUS_BRANCH, EXCEPTION_TEXT, journeyRule,
} = require('../blocks');

const A = { id: 'trackerBranch', any: ['Tracker 01 Completed & Approved → Script A'] };
const B = { id: 'trackerBranch', any: ['Tracker 01 Pending → Script B'] };

module.exports = {
  code: 'FU-04',
  key: 'MV-FU-04',
  version: 1,
  kind: 'followup',
  seq: 4,
  day: 80,
  title: 'Treatment Continuity & Family Session Preparation',
  subtitle: 'काउंसलर फ़ॉर्म — कॉल के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FU-04'],
    ['Scheduled', 'Day 80'],
    ['Target Duration', '6–8 मिनट'],
    ['Responsible', 'Medical Counsellor'],
    ['Previous Review', 'Development Tracker 01 — Day 60'],
    ['Next Review', 'Day 110 (Family Session 02: Day 105)'],
    ['Status', 'Clinical approval required before implementation'],
  ],
  sections: [
    sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (45–60 सेकंड, कॉल से पहले)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'medicine', label: 'Current Medicine Prescription', from: 'prescription', hint: 'CRM Auto' },
          { id: 'openIssues', label: 'सभी Open Issues — पूरे patient के (Medicine / Family Session / Tracker / Guidance)', from: 'openIssues', hint: 'CRM Auto' },
          { id: 'tracker', label: 'Development Tracker 01: Completed / Pending', from: 'statusDate:DT-01', hint: 'CRM Auto' },
          { id: 'trackerReco', label: 'Tracker Recommendations', from: 'trackerSummary:DT-01', hint: 'CRM Auto' },
          { id: 'homeTherapy', label: 'Assigned Home Therapy', from: 'homeTherapy', hint: 'CRM Auto' },
          { id: 'pendingTraining', label: 'Pending Training / Guidance', from: '', hint: 'CRM Auto' },
          { id: 'fs02', label: 'Family Session 02 Date (Day 105)', from: 'date:FS-02', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'Next Medicine Dispatch / Refill Due Date', from: 'nextDispatch', hint: 'CRM Auto' },
          { id: 'journey', label: 'Journey Card: Current Goal + Functional Purpose (Approved)', from: 'journeyGoal', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: `Tracker की पूरी रिपोर्ट दोबारा नहीं पूछनी। केवल उसके अनुसार कोई कार्रवाई या सहायता pending है तो उसकी स्थिति चेक करनी है। ${STATUS_BRANCH}` },
      ],
    },
    greeting({ say: `${GREETING_LINE}\n“जी, आज बच्चे का चौथा मेडिकल फॉलो-अप है। इसमें कुछ ज़रूरी चीज़ें confirm करनी हैं ताकि आपका treatment और home guidance सही तरीके से चलती रहे। लगभग 6–8 मिनट लगेंगे।”` }),
    safetyScreen({ say: '“पिछले फॉलो-अप के बाद बच्चे को कोई नई या बढ़ी हुई स्वास्थ्य-संबंधी परेशानी, या दवा के इस्तेमाल से कोई तकलीफ़ तो नहीं हुई?”' }),
    medicineContinuity({ say: '“बच्चे की सभी निर्धारित दवाइयाँ सुबह से रात तक नियमित चल रही हैं ना? किसी दवाई का समय छूट रहा है या देने में कोई परेशानी है?”' }),
    openIssues({ say: '“पिछली बार [Pending Issue] के संबंध में जो सहायता तय हुई थी, वह आपको मिल गई?”', time: '45 सेकंड' }),
    {
      title: 'STEP 05 — TRACKER 01 के बाद की HOME ACTION',
      time: '90 सेकंड',
      blocks: [
        { t: 'auto', id: 'activityName', label: 'Assigned Activity / Guidance Name', from: 'homeTherapy', hint: 'CRM' },
        { t: 'text', id: 'activityModule', label: 'Module / Part' },
        { t: 'auto', id: 'trackerNow', label: 'Development Tracker 01 (CRM)', from: 'statusDate:DT-01', hint: 'CRM' },
        { t: 'one', id: 'trackerBranch', label: 'CRM Status (पहले देखें, फिर सही Script चुनें)', options: ['Tracker 01 Completed & Approved → Script A', 'Tracker 01 Pending → Script B'] },
        { t: 'say', text: 'Script A: “आपका पहला Development Tracker हो चुका है। उसके बाद [Assigned Activity / Guidance] के जो निर्देश दिए गए थे, वे आपको समझ में आ गए और आप उन्हें follow कर पा रहे हैं?”', show: A },
        { t: 'one', id: 'activityStatus', label: 'Tracker action', options: ['Clear & Following', 'Partially Following', 'Difficulty', 'Training Pending'], show: A },
        { t: 'say', text: 'यदि Difficulty — “सबसे ज़्यादा परेशानी किस बात में है?”', show: { id: 'activityStatus', any: ['Difficulty'] } },
        { t: 'many', id: 'difficulty', label: 'Difficulty', options: DIFFICULTY, other: 'Other', show: { id: 'activityStatus', any: ['Difficulty'] } },
        { t: 'note', label: 'Staff Action', tone: 'rule', text: DIFFICULTY_ACTION, show: A },
        { t: 'text', id: 'activityTask', label: 'Task ID / Owner', show: A },
        { t: 'say', text: 'Script B (Tracker 01 बाकी हो तो): “आपका पहला Development Tracker अभी बाकी दिखाई दे रहा है। उसकी तारीख़ तय करने के लिए हमारी टीम आपसे संपर्क करेगी।”', show: B },
        { t: 'text', id: 'schedulingTask', label: 'Tracker Scheduling Task', show: B },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Tracker बाकी हो तो उसकी recommendations वाली बात न करें। इस कॉल में नए developmental goals नहीं बनाने हैं — यह संबंधित clinician का काम है।' },
      ],
    },
    parentSupport({
      title: 'STEP 06 — PARENT SUPPORT',
      time: '60 सेकंड',
      extra: [
        { t: 'say', text: '“जी, आपके बच्चे की progress को हम उसके Development Tracker और निर्धारित goals के आधार पर review करते हैं। अगले Family Session में Psychologist आपके साथ उस रिपोर्ट और आगे की activities पर बात करेंगे। अगर कोई नई परेशानी या पहले आती हुई skill में कमी हुई है, तो उसे हम अभी ही clinical team तक पहुँचाएँगे।”' },
        { t: 'note', label: 'Exception', tone: 'info', text: EXCEPTION_TEXT },
      ],
    }),
    futureConnection({
      title: 'STEP 07 — FUTURE CONNECTION (एक वाक्य)',
      say: '“Tracker के बाद जो home actions तय हुई हैं, वे आगे [Next Priority] की तरफ़ बढ़ने में काम आएँगी। जितनी नियमितता रहेगी, अगली review में उतना साफ़ दिशा-निर्देश मिल पाएगा।”',
      rule: journeyRule('Tracker से तय home actions आगे कैसे काम आएँगी, यह जोड़ें'),
    }),
    closing({
      title: 'STEP 08 — CLOSING',
      say: [
        '“ठीक है। आज हमने आपके treatment routine और guidance से संबंधित ज़रूरी चीज़ें चेक कर ली हैं।”',
        '“आपका अगला Family Session लगभग 105वें दिन रहेगा। उसमें आपके बच्चे के पहले Development Tracker के आधार पर आगे की training और ज़रूरी guidance समझाई जाएगी। उसके बाद Day 110 पर आपका अगला मेडिकल फॉलो-अप होगा।”',
        CLOSING_LINE,
      ].join('\n'),
      links: [
        { id: 'fs02Link', label: 'Family Session 02 (Day 105)', code: 'FS-02', options: ['Confirmed', 'Pending'] },
        { id: 'fu05Link', label: 'Next Follow-up (Day 110)', code: 'FU-05', options: ['Scheduled', 'Pending'] },
      ],
    }),
    crmSummary({
      title: 'Follow-up 04 Outcome',
      rows: [
        { id: 'openIssues', label: 'Open Issues (सभी विभाग)', options: ['Resolved', 'Pending', 'N/A'] },
        { id: 'medicine', label: 'Medicine Routine', options: ['Regular', 'Partial', 'Difficulty'] },
        { id: 'slot', label: 'Medicine Issue Slot', options: ['M1–M6', 'N/A'] },
        { id: 'concern', label: 'New Medical Concern', options: ['No', 'Review', 'Urgent'] },
        { id: 'tracker', label: 'Development Tracker 01', options: ['Complete', 'Pending'] },
        { id: 'trackerAction', label: 'Tracker Action Status', options: ['Following', 'Difficulty', 'Pending'] },
        { id: 'training', label: 'Assigned Home Training', options: ['Regular', 'Partial', 'Not Started'] },
        { id: 'support', label: 'Parent Support Required', options: ['No', 'Yes'] },
        { id: 'fs02', label: 'Family Session 02', options: ['Confirmed', 'Pending'] },
        { id: 'next', label: 'Next Follow-up', options: ['Day 110', 'Rescheduled'] },
      ],
      finals: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Clinical Review Required', 'Urgent Clinical Escalation', 'Tracker / Training Pending', 'Rescheduled'],
      tasks: 3,
      doNotAsk: ['“बच्चे में कितना improvement हुआ?”', '“Speech कितनी बढ़ी?”', '“Eye contact कितना ठीक हुआ?”', '“Autism कितना कम हुआ?”', '“पिछले दो महीने में कितना रिजल्ट आया?”', '“आप treatment से कितने satisfied हैं?”'],
      exception: 'Parent स्वयं नई समस्या, महत्वपूर्ण deterioration या पहले मौजूद skill के खोने की जानकारी दे तो उसे Tracker तक स्थगित नहीं करना। उचित Clinical Review होगा।',
    }),
  ],
};
