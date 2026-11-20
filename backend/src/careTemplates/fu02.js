// MV-FU-02 • Medical Follow-up 02 (Day 20): Routine Continuity & Family Session Support.
const {
  sessionInfo, greeting, safetyScreen, medicineContinuity, openIssues, parentSupport, futureConnection, closing, crmSummary,
  DIFFICULTY, DIFFICULTY_ACTION, GREETING_LINE, CLOSING_LINE, STATUS_BRANCH, journeyRule,
} = require('./blocks');

const A = { id: 'fsStatus', any: ['Family Session 01 Completed → Script A'] };
const B = { id: 'fsStatus', any: ['Family Session 01 Pending → Script B'] };

module.exports = {
  code: 'FU-02',
  key: 'MV-FU-02',
  version: 1,
  kind: 'followup',
  seq: 2,
  day: 20,
  title: 'Routine Continuity & Family Session Support',
  subtitle: 'काउंसलर फ़ॉर्म — कॉल के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FU-02'],
    ['Scheduled', 'Day 20'],
    ['Target Duration', '4–5 मिनट'],
    ['Responsible', 'Medical Counsellor'],
    ['Previous Review', 'Family Session 01 — Day 15'],
    ['Next Review', 'Day 50'],
    ['Status', 'Clinical approval required before implementation'],
  ],
  sections: [
    sessionInfo(),
    {
      title: 'BEFORE CALL — STAFF PREPARATION (30–45 सेकंड, कॉल से पहले)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'openIssues', label: 'सभी Open Issues — पूरे patient के (Medicine / Family Session / Tracker / Guidance)', from: 'openIssues', hint: 'CRM Auto' },
          { id: 'fs01', label: 'Family Session 01 Status', from: 'statusDate:FS-01', hint: 'CRM Auto' },
          { id: 'homeActivities', label: 'Assigned Home Activities', from: 'actions:FS-01', hint: 'CRM Auto' },
          { id: 'medicine', label: 'Medicine Schedule', from: 'prescription', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'Next Medicine Dispatch / Refill Due Date', from: 'nextDispatch', hint: 'CRM Auto' },
          { id: 'journey', label: 'Journey Card: Current Goal + Functional Purpose (Approved)', from: 'journeyGoal', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Rule', tone: 'rule', text: `इस कॉल में पूरी developmental progress की समीक्षा नहीं होगी। पिछली बार की pending समस्या का ही reference लें — पूरी history दोबारा न पूछें। ${STATUS_BRANCH}` },
      ],
    },
    greeting({ say: `${GREETING_LINE}\n“आज [Child Name] का दूसरा छोटा फॉलो-अप है। बस कुछ ज़रूरी चीज़ें confirm करनी हैं।”` }),
    safetyScreen({ say: '“पिछली बातचीत के बाद बच्चे को कोई नई या बढ़ी हुई शारीरिक परेशानी हुई, या किसी दवाई से कोई तकलीफ़ हुई?”' }),
    medicineContinuity({ say: '“सभी निर्धारित दवाइयाँ पहले की तरह नियमित चल रही हैं ना? किसी दवाई का समय छूट रहा है या देने में परेशानी है?”' }),
    openIssues({ say: '“पिछली बार [Issue] बताया था। क्या उसमें सहायता मिल गई या समस्या अभी बाकी है?”', time: '45 सेकंड' }),
    {
      title: 'STEP 05 — FAMILY SESSION 01 के बाद HOME ACTIVITY',
      time: '60 सेकंड',
      blocks: [
        { t: 'auto', id: 'activityName', label: 'Assigned Activity / Guidance Name', from: 'actions:FS-01', hint: 'CRM' },
        { t: 'text', id: 'activityModule', label: 'Module / Part' },
        { t: 'auto', id: 'fsStatusNow', label: 'Family Session 01 (CRM)', from: 'statusDate:FS-01', hint: 'CRM' },
        { t: 'one', id: 'fsStatus', label: 'CRM Status (पहले देखें, फिर सही Script चुनें)', options: ['Family Session 01 Completed → Script A', 'Family Session 01 Pending → Script B'] },
        { t: 'say', text: 'Script A: “पिछले Family Session में जो [Assigned Activity] तय हुई थी, उसका तरीका आपको स्पष्ट है और वह घर पर शुरू हो गई है?”', show: A },
        { t: 'one', id: 'activityStatus', label: 'Activity', options: ['Clear & Started', 'Partially Started', 'Difficulty'], show: A },
        { t: 'say', text: 'यदि Difficulty — “किस बात में परेशानी है?”', show: { id: 'activityStatus', any: ['Difficulty'] } },
        { t: 'many', id: 'difficulty', label: 'Difficulty', options: DIFFICULTY, other: 'Other', show: { id: 'activityStatus', any: ['Difficulty'] } },
        { t: 'note', label: 'Staff Action', tone: 'rule', text: DIFFICULTY_ACTION, show: A },
        { t: 'text', id: 'activityTask', label: 'Task ID / Owner', show: A },
        { t: 'say', text: 'Script B (Family Session बाकी हो तो): “आपका पहला Family Session अभी बाकी दिखाई दे रहा है। हमारी टीम उसकी तारीख़ तय करने के लिए आपसे संपर्क करेगी।”', show: B },
        { t: 'text', id: 'schedulingTask', label: 'Scheduling Task', show: B },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Session बाकी हो तो उसमें दी जाने वाली training के बारे में न पूछें। इस कॉल में नई therapy नहीं सिखानी — ज़रूरत हो तो Psychologist / Therapist Support Task भेजें।' },
      ],
    },
    parentSupport({ title: 'STEP 06 — PARENT SUPPORT', time: '30 सेकंड' }),
    futureConnection({
      title: 'STEP 07 — FUTURE CONNECTION (एक वाक्य)',
      say: '“Family Session में जो [Current Goal] तय हुआ, उसके लिए घर की यह activity [Functional Purpose] की नींव बनाती है। इसे नियमित रखिए — आगे की review में अगली संभावित skill भी देखी जाएगी।”',
      rule: journeyRule('FS-01 में तय goal का उद्देश्य जोड़ें'),
    }),
    closing({
      title: 'STEP 08 — CLOSING',
      say: [
        '“ठीक है। आज का follow-up complete है। जो ज़रूरी बात रिकॉर्ड हुई है, उस पर संबंधित टीम सहायता करेगी।”',
        '“आपका अगला Medical Follow-up लगभग Day 50 पर रहेगा। Developmental progress के लिए अलग दो-महीने वाला Tracker होगा।”',
        CLOSING_LINE,
      ].join('\n'),
      links: [{ id: 'fu03Link', label: 'Next Follow-up (Day 50)', code: 'FU-03', options: ['Scheduled', 'Pending'] }],
    }),
    crmSummary({
      title: 'Follow-up 02 Outcome',
      rows: [
        { id: 'openIssues', label: 'Open Issues (सभी विभाग)', options: ['Resolved', 'Pending', 'N/A'] },
        { id: 'medicine', label: 'Medicine Routine', options: ['Regular', 'Difficulty'] },
        { id: 'safety', label: 'Medical Safety Concern', options: ['No', 'Review', 'Urgent'] },
        { id: 'fs01', label: 'Family Session 01', options: ['Complete', 'Pending'] },
        { id: 'home', label: 'Home Training', options: ['Started', 'Partial', 'Difficulty'] },
        { id: 'task', label: 'Task Assigned', options: ['Yes', 'No'] },
        { id: 'next', label: 'Next Session', options: ['Scheduled', 'Pending'] },
      ],
      finals: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Rescheduled'],
      tasks: 3,
      doNotAsk: ['“बच्चे में कितना improvement हुआ?”', '“Speech या eye contact कितना बढ़ा?”'],
      exception: 'इस कॉल में पूरी developmental progress की समीक्षा नहीं होगी। नई स्वास्थ्य समस्या या safety चिंता की जाँच हर समय लागू रहेगी।',
    }),
  ],
};
