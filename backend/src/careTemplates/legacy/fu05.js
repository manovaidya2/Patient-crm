// MV-FU-05 • Medical Follow-up 05 (Day 110): Treatment Continuity & Second Tracker Preparation.
const {
  sessionInfo, greeting, safetyScreen, medicineContinuity, openIssues, parentSupport, futureConnection, closing, crmSummary,
  GREETING_LINE, CLOSING_LINE, STATUS_BRANCH, EXCEPTION_TEXT, journeyRule,
} = require('../blocks');

const A = { id: 'fsStatus', any: ['Family Session 02 Completed → Script A'] };
const B = { id: 'fsStatus', any: ['Family Session 02 Pending → Script B'] };
const DIFF = { id: 'activityStatus', any: ['Difficulty'] };

module.exports = {
  code: 'FU-05',
  key: 'MV-FU-05',
  version: 1,
  kind: 'followup',
  seq: 5,
  day: 110,
  title: 'Treatment Continuity & Second Tracker Preparation',
  subtitle: 'काउंसलर फ़ॉर्म — कॉल के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FU-05'],
    ['Scheduled', 'Day 110'],
    ['Target Duration', '5–6 मिनट'],
    ['Responsible', 'Medical Counsellor'],
    ['Previous Review', 'Family Session 02 — Day 105'],
    ['Next Review', 'Day 140 (Tracker 02: Day 120)'],
    ['Status', 'Clinical approval required before implementation'],
  ],
  sections: [
    sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (30–45 सेकंड, कॉल से पहले)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'medicine', label: 'Current Approved Medicine Schedule', from: 'prescription', hint: 'CRM Auto' },
          { id: 'openIssues', label: 'सभी Open Issues — पूरे patient के (Medicine / Family Session / Tracker / Guidance)', from: 'openIssues', hint: 'CRM Auto' },
          { id: 'fs02', label: 'Family Session 02: Completed / Pending', from: 'statusDate:FS-02', hint: 'CRM Auto' },
          { id: 'newActivities', label: 'New Home Activities / Guidance (पुरानी बनाम नई)', from: 'actions:FS-02', hint: 'CRM Auto' },
          { id: 'pendingDemo', label: 'Pending Therapy Demonstration', from: '', hint: 'CRM Auto' },
          { id: 'tracker', label: 'Development Tracker 02 Date (Day 120)', from: 'date:DT-02', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'Next Medicine Dispatch / Refill Due Date', from: 'nextDispatch', hint: 'CRM Auto' },
          { id: 'journey', label: 'Journey Card: Current Goal + Functional Purpose (Approved)', from: 'journeyGoal', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Important', tone: 'rule', text: `Family Session 02 में कोई नई activity या guidance तय हुई है तो काउंसलर को पुरानी और नई activity का अंतर पहले से दिखना चाहिए। ${STATUS_BRANCH}` },
      ],
    },
    greeting({ say: `${GREETING_LINE}\n“जी, आज बच्चे का पाँचवाँ मेडिकल फॉलो-अप है। इसमें हम दवाइयों और पिछले Family Session के बाद की गाइडेंस से जुड़ी कुछ ज़रूरी बातें चेक करेंगे। लगभग पाँच मिनट लगेंगे।”` }),
    safetyScreen({ say: '“पिछले फॉलो-अप के बाद बच्चे को कोई नई या बढ़ी हुई स्वास्थ्य-संबंधी परेशानी या दवाई के इस्तेमाल से कोई तकलीफ़ हुई?”' }),
    medicineContinuity({ say: '“बच्चे की सभी निर्धारित दवाइयाँ नियमित चल रही हैं ना? किसी दवाई का समय छूट रहा है या इस्तेमाल में परेशानी है?”' }),
    openIssues({ say: '“पिछली बार [Pending Issue] के लिए जो सहायता तय की गई थी, वह आपको मिल गई?”' }),
    {
      title: 'STEP 05 — FAMILY SESSION 02 के बाद HOME ACTION',
      time: '60 सेकंड',
      blocks: [
        { t: 'auto', id: 'activityName', label: 'Assigned Activity / Guidance Name', from: 'actions:FS-02', hint: 'CRM' },
        { t: 'text', id: 'activityModule', label: 'Module / Part' },
        { t: 'auto', id: 'fsStatusNow', label: 'Family Session 02 (CRM)', from: 'statusDate:FS-02', hint: 'CRM' },
        { t: 'one', id: 'fsStatus', label: 'CRM Status (पहले देखें, फिर सही Script चुनें)', options: ['Family Session 02 Completed → Script A', 'Family Session 02 Pending → Script B'] },
        { t: 'say', text: 'Script A: “आपका दूसरा Family Session हुआ था। उसमें जो [Assigned Activity / Guidance Name] समझाई गई थी, उसे घर पर शुरू कर पाए हैं? तरीका स्पष्ट है?”', show: A },
        { t: 'one', id: 'activityStatus', label: 'Home action', options: ['Clear & Regular', 'Partially Following', 'Difficulty', 'Not Started'], show: A },
        { t: 'say', text: 'यदि Difficulty — “सबसे ज़्यादा परेशानी किस बात में आ रही है?”', show: DIFF },
        { t: 'many', id: 'difficulty', label: 'Difficulty', options: ['Instructions Not Clear', 'Child Not Engaging', 'Child Uncomfortable', 'Time Management', 'Training Not Received', 'Other'], other: 'Other', show: DIFF },
        { t: 'note', label: 'Staff Action', tone: 'rule', text: 'Guidance unclear → Psychologist / Trainer | Activity difficulty → Therapist Review | Parent time difficulty → Practical Routine Support', show: A },
        { t: 'text', id: 'activityTask', label: 'Task ID / Owner', show: A },
        { t: 'say', text: 'Script B (Family Session 02 बाकी हो तो): “आपका दूसरा Family Session अभी बाकी दिखाई दे रहा है। हमारी टीम उसकी तारीख़ तय करने के लिए आपसे संपर्क करेगी।”', show: B },
        { t: 'text', id: 'schedulingTask', label: 'Scheduling Task', show: B },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'इस कॉल में नई activity या नया developmental goal निर्धारित नहीं करना है।' },
      ],
    },
    {
      title: 'STEP 06 — TRACKER 02 — सिर्फ़ तारीख़ की पुष्टि',
      time: '30 सेकंड',
      blocks: [
        { t: 'auto', id: 'trackerDate', label: 'Tracker Date', from: 'date:DT-02', hint: 'CRM' },
        { t: 'say', text: '“आपका दूसरा Development Tracker [Tracker Date] को है। इसके बारे में Family Session में बात हो चुकी है — यहाँ बस तारीख़ पक्की कर रहे हैं।”' },
        { t: 'one', id: 'trackerConfirm', label: 'Tracker', options: ['Tracker Date Confirmed', 'Scheduling Pending', 'Parent Needs Clarification (FS-02 बाकी हो तो)'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Family Session 02 पूरा हो चुका हो तो Tracker की explanation दोबारा नहीं। यहाँ speech, behaviour या किसी developmental outcome की पूछताछ नहीं — सिर्फ़ date confirmation या scheduling task।' },
      ],
    },
    parentSupport({
      time: '45 सेकंड',
      extra: [
        { t: 'say', text: 'यदि Parent कहें ‘अभी भी परिणाम नहीं आए’: “जी, आपकी चिंता समझ में आती है। आपके बच्चे की developmental progress को हम नियमित Tracker में निर्धारित goals के आधार पर देखते हैं। अभी हम यह सुनिश्चित कर रहे हैं कि ज़रूरी गाइडेंस में कोई परेशानी न हो। आपकी चिंता भी संबंधित clinical team तक पहुँचाई जाएगी।”' },
        { t: 'note', label: 'Exception', tone: 'info', text: EXCEPTION_TEXT },
      ],
    }),
    futureConnection({
      say: '“Family Session की guidance उस अगली skill की तैयारी है जो Tracker 02 में देखी जाएगी — इसलिए मौजूदा home actions का नियमित रहना महत्वपूर्ण है।”',
      rule: journeyRule('मौजूदा home actions का अगली skill से संबंध जोड़ें'),
    }),
    closing({
      say: [
        '“ठीक है, आज हमने बच्चे के medicine routine और Family Session के बाद की guidance से जुड़ी ज़रूरी बातें चेक कर ली हैं। जो परेशानी आपने बताई है, उसके लिए [Department] की सहायता का task बनाया जाएगा।”',
        '“अब आपका दूसरा Development Tracker लगभग Day 120 पर होगा और अगला मेडिकल फॉलो-अप Day 140 पर रहेगा।”',
        CLOSING_LINE,
      ].join('\n'),
      links: [
        { id: 'dt02Link', label: 'Tracker 02 (Day 120)', code: 'DT-02', options: ['Confirmed', 'Pending'] },
        { id: 'fu06Link', label: 'Next Follow-up (Day 140)', code: 'FU-06', options: ['Scheduled', 'Pending'] },
      ],
    }),
    crmSummary({
      title: 'Follow-up 05 Outcome',
      rows: [
        { id: 'openIssues', label: 'Open Issues (सभी विभाग)', options: ['Resolved', 'Pending', 'N/A'] },
        { id: 'medicine', label: 'Medicine Routine', options: ['Regular', 'Partial', 'Difficulty'] },
        { id: 'slot', label: 'Medicine Issue Slot', options: ['M1–M6', 'N/A'] },
        { id: 'concern', label: 'New Medical Concern', options: ['No', 'Review', 'Urgent'] },
        { id: 'fs02', label: 'Family Session 02', options: ['Completed', 'Pending'] },
        { id: 'training', label: 'Assigned Training', options: ['Regular', 'Partial', 'Difficulty'] },
        { id: 'guidance', label: 'Parent Guidance', options: ['Clear', 'Support Needed'] },
        { id: 'tracker', label: 'Tracker 02', options: ['Confirmed', 'Pending'] },
        { id: 'supportTask', label: 'New Support Task', options: ['Yes', 'No'] },
        { id: 'next', label: 'Next Follow-up', options: ['Day 140', 'Rescheduled'] },
      ],
      finals: ['Completed — No Concern', 'Completed — Support Required', 'Clinical Review Required', 'Urgent Clinical Escalation', 'Family Session / Training Pending', 'Tracker Scheduling Pending', 'Rescheduled'],
      tasks: 3,
      doNotAsk: ['“कितना improvement आया?”', '“Speech कितनी बढ़ी?”', '“Behaviour कितना ठीक हुआ?”', '“Autism कितना ठीक हुआ?”', '“दवाइयों से कितना रिजल्ट मिला?”', '“आप कितने प्रतिशत satisfied हैं?”'],
      exception: 'Parent किसी महत्वपूर्ण नई समस्या, लगातार बिगड़ती स्थिति या पहले सीखी हुई skill के खोने की जानकारी दे तो clinical assessment की व्यवस्था करें। Tracker तक न टालें।',
    }),
  ],
};
