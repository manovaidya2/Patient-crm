// MV-FU-06 • Medical Follow-up 06 (Day 140): Treatment Continuity, Tracker Action & Parent Support.
const {
  sessionInfo, greeting, safetyScreen, medicineContinuity, openIssues, parentSupport, futureConnection, closing, crmSummary,
  DIFFICULTY, DIFFICULTY_ACTION, GREETING_LINE, CLOSING_LINE, STATUS_BRANCH, journeyRule,
} = require('./blocks');

const A = { id: 'trackerBranch', any: ['Tracker 02 Completed & Approved → Script A'] };
const B = { id: 'trackerBranch', any: ['Tracker 02 Pending → Script B'] };
const DIFF = { id: 'activityStatus', any: ['Difficulty'] };

module.exports = {
  code: 'FU-06',
  key: 'MV-FU-06',
  version: 1,
  kind: 'followup',
  seq: 6,
  day: 140,
  title: 'Treatment Continuity, Tracker Action & Parent Support',
  subtitle: 'काउंसलर फ़ॉर्म — कॉल के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FU-06'],
    ['Scheduled', 'Day 140'],
    ['Target Duration', '6–7 मिनट'],
    ['Responsible', 'Medical Counsellor'],
    ['Previous Review', 'Development Tracker 02 — Day 120'],
    ['Next Review', 'Day 165 (FS-03) • Day 170'],
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
          { id: 'tracker', label: 'Development Tracker 02: Completed / Pending', from: 'statusDate:DT-02', hint: 'CRM Auto' },
          { id: 'trackerPlan', label: 'Tracker 02 Action Plan', from: 'trackerSummary:DT-02', hint: 'CRM Auto' },
          { id: 'homeTherapy', label: 'Assigned Home Therapy / Training', from: 'homeTherapy', hint: 'CRM Auto' },
          { id: 'pending', label: 'Pending Training / Doctor Review', from: '', hint: 'CRM Auto' },
          { id: 'nextFollowUp', label: 'Next Follow-up Date', from: 'date:FU-07', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'Next Medicine Dispatch / Refill Due Date', from: 'nextDispatch', hint: 'CRM Auto' },
          { id: 'journey', label: 'Journey Card: Current Goal + Functional Purpose (Approved)', from: 'journeyGoal', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Important', tone: 'rule', text: `Tracker में जो developmental observations दर्ज हैं, उन्हें दोबारा parent से नहीं पूछना है। केवल Tracker के बाद निर्धारित काम पूरे हो रहे हैं या नहीं, यह चेक करना है। ${STATUS_BRANCH}` },
      ],
    },
    greeting({ say: `${GREETING_LINE}\n“जी, आज बच्चे का छठा मेडिकल फॉलो-अप है। इसमें हम दवाइयों और पिछली guidance से जुड़ी कुछ ज़रूरी बातें confirm करेंगे। लगभग 6 मिनट लगेंगे।”` }),
    safetyScreen({ say: '“पिछले फॉलो-अप के बाद बच्चे को कोई नई या बढ़ी हुई स्वास्थ्य-संबंधी परेशानी हुई, या किसी दवाई के इस्तेमाल से तकलीफ़ हुई?”' }),
    medicineContinuity({ say: '“बच्चे की जो सभी निर्धारित दवाइयाँ चल रही हैं, वे नियमित दे पा रहे हैं ना? किसी दवाई का समय छूटता है या इस्तेमाल में कोई परेशानी है?”' }),
    openIssues({ say: '“पिछली बार आपने [Previous Issue] के बारे में बताया था। उसके लिए हमारी टीम की तरफ़ से जो सहायता तय हुई थी, वह मिल गई?”' }),
    {
      title: 'STEP 05 — TRACKER 02 के बाद की HOME ACTION',
      time: '90 सेकंड',
      blocks: [
        { t: 'auto', id: 'activityName', label: 'Assigned Activity / Guidance Name', from: 'homeTherapy', hint: 'CRM' },
        { t: 'text', id: 'activityModule', label: 'Module / Part' },
        { t: 'auto', id: 'trackerNow', label: 'Development Tracker 02 (CRM)', from: 'statusDate:DT-02', hint: 'CRM' },
        { t: 'one', id: 'trackerBranch', label: 'CRM Status (पहले देखें, फिर सही Script चुनें)', options: ['Tracker 02 Completed & Approved → Script A', 'Tracker 02 Pending → Script B'] },
        { t: 'say', text: 'Script A: “आपका दूसरा Development Tracker हो चुका है। उसके बाद [Assigned Activity / Guidance] के जो निर्देश दिए गए थे, वे आपको समझ में आ गए और आप घर पर कर पा रहे हैं?”', show: A },
        { t: 'one', id: 'activityStatus', label: 'Tracker action', options: ['Clear & Following', 'Partially Following', 'Difficulty', 'Not Started'], show: A },
        { t: 'say', text: 'यदि Difficulty — “सबसे ज़्यादा परेशानी किस बात में आ रही है?”', show: DIFF },
        { t: 'many', id: 'difficulty', label: 'Difficulty', options: DIFFICULTY, other: 'Other', show: DIFF },
        { t: 'note', label: 'Staff Action', tone: 'rule', text: DIFFICULTY_ACTION, show: A },
        { t: 'text', id: 'activityTask', label: 'Task ID / Owner', show: A },
        { t: 'say', text: 'Script B (Tracker 02 बाकी हो तो): “आपका दूसरा Development Tracker अभी बाकी दिखाई दे रहा है। मैं उसकी तारीख़ तय करने के लिए संबंधित टीम को जानकारी भेज रही हूँ।”', show: B },
        { t: 'text', id: 'schedulingTask', label: 'Task', show: B },
        { t: 'note', label: 'Important', tone: 'rule', text: 'Tracker बाकी हो तो उसकी guidance वाली बात न करें। काउंसलर इस कॉल पर नए developmental goals निर्धारित नहीं करेगा।' },
      ],
    },
    {
      title: 'STEP 06 — FAMILY SESSION 03 (Day 165) — तारीख़ की पुष्टि',
      time: '45 सेकंड',
      blocks: [
        { t: 'auto', id: 'fs03Date', label: 'FS-03 की तारीख / समय', from: 'date:FS-03', hint: 'CRM' },
        { t: 'say', text: '“Day 165 के आसपास आपका तीसरा Family Session होगा। उसमें हम बच्चे के अगले developmental लक्ष्य, आपकी प्राथमिकताओं और आगे की planning पर बात करेंगे। आपकी तारीख़ [FS-03 Date] है।”' },
        { t: 'one', id: 'fs03Confirm', label: 'FS-03', options: ['FS-03 Date Confirmed', 'Scheduling Pending', 'Parent Needs Explanation'] },
        { t: 'text', id: 'fs03Reminder', label: 'Reminder' },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'यहाँ सिर्फ़ तारीख़ पक्की करें और reminder सेट करें। FS-03 की सामग्री इस कॉल में दोबारा न समझाएँ। Day 165 की scheduling छूटना इस फॉर्म की सबसे आम चूक है — CRM Task ज़रूर बनाएँ।' },
      ],
    },
    parentSupport({
      time: '45 सेकंड',
      extra: [
        { t: 'say', text: 'यदि Parent improvement के बारे में पूछे: “जी, बच्चे की developmental progress को हमारी टीम उसके निर्धारित goals के आधार पर Tracker में review करती है। अगर रिपोर्ट या किसी तय activity के बारे में आपका सवाल है, तो संबंधित specialist से clarification करवाएँगे। यदि कोई नई या बढ़ती हुई समस्या है, तो उसे अभी दर्ज करके उचित clinical review भी करवाएँगे।”' },
        { t: 'note', label: 'Exception', tone: 'info', text: 'अभिभावक नई स्वास्थ्य समस्या, महत्वपूर्ण deterioration या पहले सीखी हुई skill खोने की जानकारी दे तो उसे Tracker तक न टालें — उचित clinical review करवाएँ।' },
      ],
    }),
    futureConnection({
      say: '“Day 165 के Family Session में हम अगले developmental लक्ष्य और आपकी प्राथमिकताओं पर बात करेंगे। अभी की activities उसी की तैयारी हैं।”',
      rule: journeyRule('Day 165 Future Readiness Session की तैयारी जोड़ें'),
    }),
    closing({
      say: [
        '“ठीक है, आज हमने बच्चे के medicine routine और पिछले Tracker के बाद की guidance से संबंधित ज़रूरी चीज़ें चेक कर ली हैं। जो परेशानी बताई गई है, उसके लिए [Department] को सहायता का task दिया जाएगा।”',
        '“अब Day 165 के आसपास आपका तीसरा Family Session होगा, जिसमें हम बच्चे के अगले developmental लक्ष्य और आपकी प्राथमिकताओं पर बात करेंगे। उसके बाद Day 170 पर आपका अगला मेडिकल फॉलो-अप रहेगा, फिर अंतिम Development Tracker और Doctor की समीक्षा।”',
        CLOSING_LINE,
      ].join('\n'),
      links: [
        { id: 'fs03Link', label: 'Family Session 03 (Day 165)', code: 'FS-03', options: ['Confirmed', 'Pending'] },
        { id: 'fu07Link', label: 'Next Follow-up (Day 170)', code: 'FU-07', options: ['Scheduled', 'Pending'] },
      ],
    }),
    crmSummary({
      title: 'Follow-up 06 Outcome',
      rows: [
        { id: 'openIssues', label: 'Open Issues (सभी विभाग)', options: ['Resolved', 'Pending', 'N/A'] },
        { id: 'medicine', label: 'Medicine Routine', options: ['Regular', 'Partial', 'Difficulty'] },
        { id: 'slot', label: 'Medicine Issue Slot', options: ['M1–M6', 'N/A'] },
        { id: 'concern', label: 'New Medical Concern', options: ['No', 'Review', 'Urgent'] },
        { id: 'tracker', label: 'Tracker 02', options: ['Completed', 'Pending'] },
        { id: 'trackerAction', label: 'Tracker Action', options: ['Following', 'Difficulty', 'Pending'] },
        { id: 'training', label: 'Assigned Training', options: ['Regular', 'Partial', 'Not Started'] },
        { id: 'support', label: 'Parent Support Required', options: ['No', 'Yes'] },
        { id: 'clinical', label: 'Clinical Review Required', options: ['No', 'Yes'] },
        { id: 'fs03', label: 'Family Session 03 (Day 165)', options: ['Confirmed', 'Pending'] },
        { id: 'next', label: 'Next Medical Follow-up', options: ['Day 170', 'Rescheduled'] },
      ],
      finals: ['Completed — No Concern', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Tracker / FS-03 / Training Pending', 'Rescheduled'],
      tasks: 3,
      doNotAsk: ['“अब तक कितना improvement आया?”', '“Speech कितनी बढ़ गई?”', '“बच्चे का Autism कितना ठीक हुआ?”', '“Behaviour में कितना प्रतिशत सुधार है?”', '“दवाइयों से कितने results मिले?”', '“क्या आप treatment से satisfied हैं?”'],
      exception: 'नई स्वास्थ्य समस्या, महत्वपूर्ण behavioural deterioration या पहले आती हुई developmental skills का खोना बताया जाए, तो उचित clinical assessment के लिए भेजें। इसे केवल अगली Tracker date तक न टालें।',
    }),
  ],
};
