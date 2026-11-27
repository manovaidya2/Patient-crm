// MV-FU-07 • Medical Follow-up 07 (Day 170): Phase-End Preparation, Pending Tasks & Final Tracker Readiness.
const {
  sessionInfo, greeting, safetyScreen, medicineContinuity, openIssues, parentSupport, futureConnection, closing, crmSummary,
  DIFFICULTY, DIFFICULTY_ACTION, GREETING_LINE, CLOSING_LINE, STATUS_BRANCH, EXCEPTION_TEXT, journeyRule,
} = require('../blocks');

const A = { id: 'fsStatus', any: ['Family Session 03 Completed → Script A'] };
const B = { id: 'fsStatus', any: ['Family Session 03 Pending → Script B'] };
const DIFF = { id: 'activityStatus', any: ['Difficulty'] };

const closingSection = closing({
  say: [
    '“ठीक है, आज हमने दवाइयों, घर की गाइडेंस और अंतिम Tracker की तैयारी से जुड़ी ज़रूरी चीज़ें चेक कर ली हैं। जो परेशानी बताई है, उसके लिए संबंधित टीम को जानकारी भेजी जा रही है।”',
    '“अब लगभग Day 180 पर आपका अंतिम Development Tracker रहेगा। उसके बाद डॉक्टर की Final Clinical Review में छह महीने की समीक्षा और आगे की देखभाल की योजना पर बात होगी।”',
    CLOSING_LINE,
  ].join('\n'),
  links: [{ id: 'dt03Link', label: 'Tracker 03 (Day 180)', code: 'DT-03', options: ['Confirmed', 'Pending'] }],
});
closingSection.blocks.push(
  { t: 'one', id: 'finalReviewStatus', label: 'Final Clinical Review (Doctor)', options: ['Scheduled', 'Pending'] },
  { t: 'date', id: 'finalReviewOn', label: 'Final Clinical Review — तारीख' },
);

module.exports = {
  code: 'FU-07',
  key: 'MV-FU-07',
  version: 1,
  kind: 'followup',
  seq: 7,
  day: 170,
  title: 'Phase-End Preparation, Pending Tasks & Final Tracker Readiness',
  subtitle: 'काउंसलर फ़ॉर्म — कॉल के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FU-07'],
    ['Scheduled', 'Day 170'],
    ['Target Duration', '6–8 मिनट'],
    ['Responsible', 'Medical Counsellor'],
    ['Previous Review', 'Family Session 03 — Day 165'],
    ['Next Review', 'Tracker 03 — Day 180'],
    ['Status', 'Clinical approval required before implementation'],
  ],
  sections: [
    sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (45–60 सेकंड, कॉल से पहले)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'medicine', label: 'Current Approved Medicine Schedule', from: 'prescription', hint: 'CRM Auto' },
          { id: 'openIssues', label: 'सभी Open Issues — पूरे patient के (Medicine / Family Session / Tracker / Guidance)', from: 'openIssues', hint: 'CRM Auto' },
          { id: 'fs03', label: 'Family Session 03: Completed / Pending', from: 'statusDate:FS-03', hint: 'CRM Auto' },
          { id: 'fs03Actions', label: 'Family Session 03 Agreed Home Actions', from: 'actions:FS-03', hint: 'CRM Auto' },
          { id: 'homeTherapy', label: 'Assigned Home Therapy / Training', from: 'homeTherapy', hint: 'CRM Auto' },
          { id: 'pending', label: 'Pending Doctor Review / Training', from: '', hint: 'CRM Auto' },
          { id: 'tracker', label: 'Development Tracker 03 Date (Day 180)', from: 'date:DT-03', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'Next Medicine Dispatch / Refill Due Date', from: 'nextDispatch', hint: 'CRM Auto' },
          { id: 'journey', label: 'Journey Card: Current Goal + Functional Purpose (Approved)', from: 'journeyGoal', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Important', tone: 'rule', text: `यह अंतिम मेडिकल फॉलो-अप है, परिणाम घोषित करने का सत्र नहीं। अंतिम developmental outcome Tracker 03 और Doctor की Final Clinical Review के बाद ही तय होगा। ${STATUS_BRANCH}` },
      ],
    },
    greeting({ say: `${GREETING_LINE}\n“जी, आज बच्चे का सातवाँ और इस चरण का अंतिम मेडिकल फॉलो-अप है। इसमें हम दवाइयों, घर की गाइडेंस और आने वाले अंतिम Tracker की तैयारी से जुड़ी ज़रूरी बातें चेक करेंगे। लगभग 6–8 मिनट लगेंगे।”` }),
    safetyScreen({ say: '“पिछले फॉलो-अप के बाद बच्चे को कोई नई या बढ़ी हुई स्वास्थ्य-संबंधी परेशानी हुई, या किसी दवाई से तकलीफ़ हुई?”' }),
    medicineContinuity({ say: '“बच्चे की सभी निर्धारित दवाइयाँ अंतिम चरण में भी नियमित चल रही हैं ना? किसी दवाई का समय छूट रहा है, या दवाई कम / ख़त्म होने वाली है?”' }),
    openIssues({ say: '“पिछली बार [Previous Issue] के लिए जो सहायता तय हुई थी, वह आपको मिल गई?”' }),
    {
      title: 'STEP 05 — FAMILY SESSION 03 के बाद HOME ACTION',
      time: '60 सेकंड',
      blocks: [
        { t: 'auto', id: 'activityName', label: 'Assigned Activity / Guidance Name', from: 'actions:FS-03', hint: 'CRM' },
        { t: 'text', id: 'activityModule', label: 'Module / Part' },
        { t: 'auto', id: 'fsStatusNow', label: 'Family Session 03 (CRM)', from: 'statusDate:FS-03', hint: 'CRM' },
        { t: 'one', id: 'fsStatus', label: 'CRM Status (पहले देखें, फिर सही Script चुनें)', options: ['Family Session 03 Completed → Script A', 'Family Session 03 Pending → Script B'] },
        { t: 'say', text: 'Script A: “पिछले Family Session में जो [Agreed Home Action] तय हुई थी, वह घर पर चल पा रही है? तरीका स्पष्ट है?”', show: A },
        { t: 'one', id: 'activityStatus', label: 'Home action', options: ['Clear & Following', 'Partially Following', 'Difficulty', 'Not Started'], show: A },
        { t: 'say', text: 'यदि Difficulty — “सबसे ज़्यादा परेशानी किस बात में आ रही है?”', show: DIFF },
        { t: 'many', id: 'difficulty', label: 'Difficulty', options: DIFFICULTY, other: 'Other', show: DIFF },
        { t: 'note', label: 'Staff Action', tone: 'rule', text: DIFFICULTY_ACTION, show: A },
        { t: 'text', id: 'activityTask', label: 'Task ID / Owner', show: A },
        { t: 'say', text: 'Script B (Family Session 03 बाकी हो तो): “आपका तीसरा Family Session अभी बाकी दिखाई दे रहा है। उसकी तारीख़ तय करने के लिए हमारी टीम तुरंत संपर्क करेगी, ताकि अंतिम Tracker से पहले वह हो सके।”', show: B },
        { t: 'text', id: 'schedulingTask', label: 'Scheduling Task', show: B },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Session बाकी हो तो उसकी actions के बारे में न पूछें। इस कॉल में नई activity या नया developmental goal तय नहीं करना है।' },
      ],
    },
    {
      title: 'STEP 06 — TRACKER 03 और FINAL REVIEW — तारीख़ों की पुष्टि',
      time: '45 सेकंड',
      blocks: [
        { t: 'auto', id: 'trackerDate', label: 'Tracker 03 की तारीख', from: 'date:DT-03', hint: 'CRM' },
        { t: 'date', id: 'finalReviewDate', label: 'Final Review की तारीख' },
        { t: 'say', text: '“आपका अंतिम Development Tracker [Tracker 03 Date] को और उसके बाद डॉक्टर की Final Clinical Review [Review Date] को है। यह प्रक्रिया Family Session 03 में समझाई जा चुकी है — अब सिर्फ़ तारीख़ें पक्की कर रहे हैं। अगर आपने बच्चे की सामान्य observations का छोटा रिकॉर्ड या तारीख़ वाली कोई छोटी वीडियो रखी है, तो साथ ले आइए।”' },
        { t: 'many', id: 'trackerConfirm', label: 'Tracker 03 / Final Review', options: ['Tracker 03 Date Confirmed', 'Final Review Scheduled', 'Scheduling Pending', 'Parent Needs Explanation (FS-03 बाकी हो तो)'] },
        { t: 'check', id: 'prevReports', label: 'पिछले दोनों Tracker reports उपलब्ध हैं' },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Tracker के सवाल या ‘कितना सुधार हुआ’ का अनुमान यहाँ नहीं। Final Review से पहले कोई निश्चित outcome या continuation का निर्णय नहीं बताना।' },
        { t: 'list', id: 'phaseEndChecklist', label: 'Phase-End Preparation Checklist (Staff — CRM में दर्ज)', items: [
          'सभी open Task — Owner / Due Date के साथ',
          'Outstanding clinical issues clear / escalated',
          'दवा का stock / अगला dispatch तय',
          'Family Session 03 की record complete (या scheduled)',
          'Tracker 01–02 reports उपलब्ध',
          'Final Clinical Review की तारीख़ दर्ज',
        ] },
      ],
    },
    parentSupport({
      time: '45 सेकंड',
      extra: [
        { t: 'say', text: 'यदि Parent पूछे ‘कितना सुधार हुआ / आगे क्या होगा?’: “जी, आपका सवाल बिल्कुल सही है। बच्चे की छह महीने की progress का व्यवस्थित आकलन अंतिम Tracker में होगा और उसके बाद डॉक्टर की Final Clinical Review में आगे की देखभाल की योजना तय होगी। अभी हमारा काम यह देखना है कि दवाई और गाइडेंस में कोई रुकावट न हो। आपकी चिंता हम रिकॉर्ड में रखेंगे।”' },
        { t: 'note', label: 'Exception', tone: 'info', text: EXCEPTION_TEXT },
      ],
    }),
    futureConnection({
      say: '“अंतिम Tracker और Doctor Review में बच्चे की आगे की व्यक्तिगत योजना तय होगी। आपके सवाल और प्राथमिकताएँ उसमें शामिल की जाएँगी।”',
      rule: journeyRule('अंतिम review के लिए Parent के सवाल / priorities जोड़ें'),
    }),
    closingSection,
    crmSummary({
      title: 'Follow-up 07 Outcome',
      rows: [
        { id: 'openIssues', label: 'Open Issues (सभी विभाग)', options: ['Resolved', 'Pending', 'N/A'] },
        { id: 'medicine', label: 'Medicine Routine', options: ['Regular', 'Partial', 'Difficulty'] },
        { id: 'slot', label: 'Medicine Issue Slot', options: ['M1–M6', 'N/A'] },
        { id: 'concern', label: 'New Medical Concern', options: ['No', 'Review', 'Urgent'] },
        { id: 'fs03Actions', label: 'Family Session 03 Actions', options: ['Following', 'Difficulty', 'Pending'] },
        { id: 'training', label: 'Assigned Training', options: ['Regular', 'Partial', 'Not Started'] },
        { id: 'support', label: 'Parent Support Required', options: ['No', 'Yes'] },
        { id: 'tracker', label: 'Tracker 03 (Day 180)', options: ['Confirmed', 'Pending'] },
        { id: 'review', label: 'Final Clinical Review', options: ['Scheduled', 'Pending'] },
        { id: 'records', label: 'Phase-End Records', options: ['Ready', 'Pending'] },
      ],
      finals: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Tracker / Records Pending', 'Rescheduled'],
      tasks: 3,
      doNotAsk: ['“छह महीने में कितना improvement आया?”', '“Speech / eye contact कितना बढ़ा?”', '“बच्चा कितना ठीक हुआ?”', '“क्या अब आगे भी treatment लेंगे?”', '“अगला package कौन सा लेंगे?”', '“आप treatment से कितने satisfied हैं?”'],
      exception: 'नई स्वास्थ्य समस्या, गंभीर deterioration या skill का खोना बताया जाए तो Tracker / Final Review तक न टालें — तुरंत clinical review करवाएँ। Continuation या package की बात सिर्फ़ Final Clinical Review के बाद, clinical team करेगी।',
    }),
  ],
};
