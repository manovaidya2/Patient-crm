// MV-FS-03 • Family Session 03 (Day 165): Continuity, Independence & Future Developmental Readiness.
const {
  sessionInfo, consent, familyOpening, contactRules, taskRegister, familyCompletion,
  CONCERN_AREAS, PRE_SESSION_CHECKLIST, STAFF_SCOPE, DOS_DONTS, MANDATORY,
} = require('./blocks');

const YPN = ['Y', 'Partly', 'N'];
const NO_RECORDS = { id: 'trackerRecords', any: ['नहीं हैं → Clarification Task'] };

module.exports = {
  code: 'FS-03',
  key: 'MV-FS-03',
  version: 1,
  kind: 'family',
  seq: 3,
  day: 165,
  title: 'Continuity, Independence & Future Developmental Readiness',
  subtitle: 'काउंसलर फ़ॉर्म — हर स्टेप के साथ साथ भरें',
  meta: [
    ['Template Code', 'MV-FS-03'],
    ['Scheduled', 'Day 165 (छह महीने पूरे होने से लगभग 15 दिन पहले)'],
    ['Target Duration', '25–30 मिनट'],
    ['Session Lead', 'Trained Medical Counsellor'],
    ['Specialist Support', 'Psychologist / Therapist / Doctor (ज़रूरत हो तो)'],
    ['Session Type', 'Continuity, Independence & Future Readiness'],
    ['Based On', 'Tracker 01 (Day 60) • Tracker 02 (Day 120)'],
    ['Next', 'FU-07 Day 170 • Tracker 03 Day 180 • Final Clinical Review'],
  ],
  sections: [
    sessionInfo('सेशन की जानकारी'),
    consent({ recording: false }),
    {
      title: 'SECTION A — सेशन से पहले: Family Session Card (Staff Only, 2 मिनट)',
      blocks: [
        { t: 'note', tone: 'info', text: 'CRM में दिख रही जानकारी देखकर संक्षेप में लिखें।' },
        { t: 'facts', id: 'card', rows: [
          { id: 'profile', label: 'Child Profile & Diagnosis', from: 'doctorAssessment', hint: 'OPD / Doctor Assessment' },
          { id: 'goals', label: 'Current Developmental Goals', from: 'goals', hint: 'Assessment / Clinical Plan' },
          { id: 'tracker1', label: 'Tracker 01 Summary — approved', from: 'trackerSummary:DT-01', hint: 'Development Tracker' },
          { id: 'tracker2', label: 'Tracker 02 Summary — approved', from: 'trackerSummary:DT-02', hint: 'Development Tracker' },
          { id: 'home', label: 'Assigned Home Activities', from: 'homeTherapy', hint: 'Therapy / Training Module' },
          { id: 'fsActions', label: 'FS-01 / FS-02 Agreed Actions & Status', from: 'actions:FS-02', hint: 'Family Session History' },
          { id: 'medIssues', label: 'Medicine / Diet / Marma Issues (FU-01 से 06)', from: 'openIssues', hint: 'Medical Follow-up Records' },
          { id: 'pending', label: 'Pending Complaints / Tasks', from: 'pendingComplaint', hint: 'Care Coordination CRM' },
          { id: 'tracker3', label: 'Tracker 03 Date (Day 180)', from: 'date:DT-03', hint: 'CRM' },
          { id: 'review', label: 'Final Clinical Review Date', from: '', hint: 'CRM' },
        ] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'पूरी history दोबारा न पढ़ें, न दोबारा पूछें — सिर्फ़ यह Card देखें। Approved Tracker summary / goals CRM में न हों तो अनुमान से न बताएँ; Clinical Plan Clarification Task बनाकर clinician से पुष्टि करवाएँ।' },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist', items: PRE_SESSION_CHECKLIST },
        { t: 'note', label: 'Staff Scope', tone: 'info', text: STAFF_SCOPE },
      ],
    },
    familyOpening({
      say: [
        '“नमस्ते, मैं MANOVAIDYA Clinic से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
        '“आज हमारा तीसरा Family Guidance Session है। आज के सेशन में हम पहले आपकी सबसे महत्वपूर्ण एक-दो परेशानियाँ समझेंगे, फिर बच्चे की निर्धारित home activities पर guidance देंगे और आखिर में आगे की योजना तय करेंगे। यह लगभग 25–30 मिनट का सेशन रहेगा। क्या अभी आराम से बात कर सकते हैं?”',
      ].join('\n'),
    }),
    {
      title: 'STEP 02 — वर्तमान प्राथमिकताएँ और परिवार की चिंता',
      time: 'Target: 3 मिनट',
      blocks: [
        { t: 'note', label: 'Method (Connect → Reflect)', tone: 'info', text: 'पहले पूरी बात सुनें; फिर उनकी चिंता अपने शब्दों में दोहराएँ।' },
        { t: 'one', id: 'concern1', label: 'Q1 “बच्चे के रोज़मर्रा के जीवन में अभी आपको किस काम में सबसे ज़्यादा सहायता देनी पड़ती है?” (Primary Concern)', options: CONCERN_AREAS, other: 'Other', req: true },
        { t: 'text', id: 'concernDetails', label: 'Parent के अपने शब्दों में (1-2 मुख्य बातें)', long: true },
        { t: 'check', id: 'concernConfirmed', label: 'Parent ने Confirm किया' },
        { t: 'text', id: 'otherProblems', label: 'बाकी समस्याएँ (अलग Task) / Task ID' },
        { t: 'note', label: 'Single Parent-Concern Record', tone: 'rule', text: 'यह चिंता Step 05 (priorities) और Step 06–07 (Doctor Review) तीनों जगह इस्तेमाल होगी — उन Steps में दोबारा न पूछें, यहीं से उठाएँ।' },
      ],
    },
    {
      title: 'STEP 03 — TRACKER 01–02 के मुख्य निष्कर्ष',
      time: 'Target: 5 मिनट',
      blocks: [
        { t: 'note', label: 'Purpose', tone: 'info', text: 'पिछली दोनों Tracker reports की approved मुख्य बातें समझाना। Day 180 का अंतिम Tracker अभी बाकी है — उसके परिणाम पहले से न बताएँ।' },
        { t: 'say', text: '“आपके बच्चे के दो Development Tracker हो चुके हैं। उनमें निर्धारित goals की व्यवस्थित समीक्षा हुई है। आज मैं उनकी मुख्य बातें और घर की गतिविधियों से उनका संबंध समझाऊँगी। अंतिम Tracker उसके बाद आएगा।”' },
        { t: 'matrix', id: 'trackerFindings', label: 'Tracker 01–02 findings', columns: [
          { id: 'domain', label: 'Domain / Goal', type: 'text' },
          { id: 't1', label: 'Tracker 01 (Approved Note)', type: 'text' },
          { id: 't2', label: 'Tracker 02 (Approved Note)', type: 'text' },
          { id: 'focus', label: 'आगे का ध्यान', type: 'text' },
        ], rows: [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }, { id: 'r3', label: '3' }] },
        { t: 'one', id: 'trackerRecords', label: 'Tracker Records', options: ['दोनों approved summaries CRM में हैं', 'नहीं हैं → Clarification Task'] },
        { t: 'text', id: 'trackerTask', label: 'Task ID', show: NO_RECORDS },
        { t: 'one', id: 'q2', label: 'Q2 Parent Understanding Check — “क्या आपको स्पष्ट है कि दोनों Tracker में कौन सी skills पर ध्यान दिया गया और घर की activities उनसे कैसे जुड़ी हैं?”', options: ['Clear', 'Partially Clear', 'Needs Specialist Explanation'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Score की व्याख्या, नई diagnosis या prognosis अपने से न दें। अगर Tracker 02 में कोई गंभीर गिरावट / skill का खोना दर्ज है तो उसे सामान्य बातचीत में न टालें — Doctor Review Task बनाएँ।' },
      ],
    },
    {
      title: 'STEP 04 — सीखी हुई Skills का रोज़मर्रा में उपयोग (Generalisation)',
      time: 'Target: 5 मिनट',
      blocks: [
        { t: 'one', id: 'q3', label: 'Q3 “जो activity घर में सिखाई गई है, उसे परिवार के दूसरे सदस्य भी उसी तरीके से करवा पा रहे हैं?”', options: ['Yes', 'Partly', 'No'] },
        { t: 'one', id: 'q4', label: 'Q4 “क्या बच्चे को कोई सीखी हुई activity अलग जगह या अलग व्यक्ति के साथ करने में परेशानी होती है?”', options: ['No difficulty', 'अलग व्यक्ति के साथ कठिनाई', 'अलग जगह पर कठिनाई', 'दोनों में कठिनाई'] },
        { t: 'matrix', id: 'generalisation', label: 'Skill / Activity — Generalisation', columns: [
          { id: 'skill', label: 'Skill / Activity (Approved)', type: 'text' },
          { id: 'home', label: 'घर पर', type: 'one', options: YPN },
          { id: 'person', label: 'दूसरे व्यक्ति के साथ', type: 'one', options: YPN },
          { id: 'place', label: 'दूसरी जगह', type: 'one', options: YPN },
          { id: 'support', label: 'Support चाहिए?', type: 'one', options: ['Y', 'N'] },
        ], rows: [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }, { id: 'r3', label: '3' }] },
        { t: 'text', id: 'barrierWords', label: 'बाधा / Parent के शब्द', long: true },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'यहाँ नई therapy नहीं सिखानी। कठिनाई specialist-level हो तो Psychologist / Therapist Support Task बनाएँ। इसे Tracker की तरह formal score / rating न दें — यह सिर्फ़ बातचीत का रिकॉर्ड है।' },
      ],
    },
    {
      title: 'STEP 05 — अगली Developmental Skills की तैयारी',
      time: 'Target: 6 मिनट',
      blocks: [
        { t: 'note', label: 'Purpose', tone: 'info', text: 'उम्र और ज़रूरत के अनुसार अगली महत्वपूर्ण skills की पहचान। ये सभी लक्ष्य हर बच्चे के लिए अनिवार्य नहीं हैं — सिर्फ़ clinician-approved सूची में से ही बताएँ; Counsellor खुद लक्ष्य नहीं चुनेगा।' },
        { t: 'say', text: '“अब हम अगले developmental लक्ष्यों की planning की ओर बढ़ रहे हैं। आपके लिए बच्चे की communication, daily living, participation या कोई और क्षमता सबसे महत्वपूर्ण होगी? आपकी प्राथमिकताओं को हम Final Tracker और Doctor Review में शामिल करेंगे, ताकि आगे की ज़रूरत के अनुसार उपयुक्त care plan तय हो सके।”' },
        { t: 'matrix', id: 'q5', label: 'Q5 “स्कूल, घर या दैनिक जीवन में अगली कौन सी skill परिवार के लिए सबसे उपयोगी होगी?” (Parent Priority • Multi-select)', columns: [
          { id: 'approved', label: 'Clinician Approved', type: 'check' },
          { id: 'parent', label: 'Parent की प्राथमिकता', type: 'check' },
        ], rows: [
          { id: 'communication', label: 'Communication — जरूरत बताना, functional communication, AAC जहाँ उपयुक्त' },
          { id: 'learning', label: 'Learning — Attention, participation, सरल learning routines' },
          { id: 'social', label: 'Social Participation — परिवार, स्कूल और अन्य वातावरण में सहभागिता' },
          { id: 'daily', label: 'Daily Living — Toilet, dressing, feeding, hygiene' },
          { id: 'behaviour', label: 'Behaviour & Regulation — Distress समझना, communication और coping support' },
          { id: 'independence', label: 'Independence — उम्र और क्षमता के अनुरूप अधिक स्वायत्तता' },
        ] },
        { t: 'text', id: 'priorityReason', label: 'चुनी हुई 1–2 प्राथमिकताएँ और Parent का कारण', long: true },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'Parent की प्राथमिकता दर्ज करें — वह Parent Priority है, final clinical goal नहीं; goal तभी बनेगा जब clinician approve करे। जो लक्ष्य clinician-approved सूची में नहीं है उसे बच्चे की प्राथमिकता न बताएँ; Clarification Task बनाएँ। किसी परिणाम का वादा न करें।' },
      ],
    },
    {
      title: 'STEP 06 — अंतिम Tracker और Doctor Review की प्रक्रिया समझाना',
      time: 'Target: 4 मिनट',
      blocks: [
        { t: 'say', text: '“Day 170 के आसपास आपका अंतिम मेडिकल फॉलो-अप होगा, फिर लगभग Day 180 पर अंतिम Development Tracker होगा। उसमें छह महीने के निर्धारित goals की शुरुआती स्थिति से तुलना की जाएगी। उसके बाद डॉक्टर की Final Clinical Review में आगे की देखभाल की योजना तय होगी।”\n“ये छह महीने आगे की planning की मज़बूत नींव हैं। Final Review में डॉक्टर बच्चे के अगले व्यक्तिगत लक्ष्य और ज़रूरी सहयोग तय करेंगे — और उसमें आपकी बताई प्राथमिकताएँ भी शामिल होंगी।”' },
        { t: 'one', id: 'processClear', label: 'Parent को प्रक्रिया स्पष्ट है', options: ['Clear', 'Partially Clear', 'Needs Explanation'] },
        { t: 'one', id: 'tracker3Told', label: 'Tracker 03 की तारीख बताई', options: ['Yes', 'Pending'] },
        { t: 'auto', id: 'tracker3Date', label: 'Tracker 03 की तारीख', from: 'date:DT-03', hint: 'CRM' },
        { t: 'one', id: 'reviewTold', label: 'Final Clinical Review बताई', options: ['Yes', 'Pending'] },
        { t: 'date', id: 'reviewDate', label: 'Final Clinical Review की तारीख' },
        { t: 'one', id: 'bringNotes', label: 'साथ रखने को कहा (observation notes, तारीख वाली छोटी वीडियो)', options: ['Yes', 'लागू नहीं'] },
        { t: 'text', id: 'doctorReviewPoints', label: 'Doctor Review में जाने वाली बातें: Step 02 की Parent Concern और Step 05 की priorities अपने-आप जाएँगी। कुछ नया जोड़ना हो तभी लिखें', long: true },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'यह सत्र छह महीने ख़त्म होने के बाद अगला package लेने की बात नहीं है। न तुरंत continuation का दबाव बनाएँ, न यह कहें कि छह महीने में सभी difficulties समाप्त हो जाएँगी।' },
      ],
    },
    {
      title: 'STEP 07 — दीर्घकालीन सहायता, Questions और अगले Actions',
      time: 'Target: 5 मिनट',
      blocks: [
        { t: 'many', id: 'q7', label: 'Q7 “आगे की देखभाल में आपके लिए समय, training या किसी अन्य सहायता की क्या ज़रूरत होगी?”', options: ['Home plan जारी रखने में सहायता', 'Additional Therapist / Trainer Support', 'School / बाहर की जगह के लिए guidance', 'Family / Caregiver Support', 'Doctor / Clinical Team तय करे', 'कोई ज़रूरत नहीं'] },
        { t: 'matrix', id: 'homeActions', label: 'Day 180 तक Home Action (Approved, अधिकतम 2)', columns: [
          { id: 'activity', label: 'Home Action', type: 'text' },
          { id: 'person', label: 'Responsible Person', type: 'text' },
          { id: 'review', label: 'Review Date', type: 'date' },
        ], rows: [{ id: 'a1', label: 'Action 01' }, { id: 'a2', label: 'Action 02' }] },
        { t: 'say', text: '“तो अभी हम [Selected Activity] जारी रखेंगे, और अंतिम Tracker तथा Doctor की समीक्षा में आपकी बताई प्राथमिकताएँ शामिल करके आगे की व्यक्तिगत योजना तय होगी। बीच में कोई नई, बढ़ती या महत्वपूर्ण स्वास्थ्य समस्या हो तो अगली तारीख का इंतज़ार न करें। धन्यवाद।”' },
        contactRules(),
        { t: 'link', id: 'fu07Link', label: 'Follow-up 07 (Day 170)', code: 'FU-07', options: ['Scheduled', 'Pending'] },
        { t: 'link', id: 'dt03Link', label: 'Tracker 03 (Day 180)', code: 'DT-03', options: ['Confirmed', 'Pending'] },
        { t: 'one', id: 'finalReviewStatus', label: 'Final Clinical Review', options: ['Scheduled', 'Pending'] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'आगे की therapy / package की बात आज तय नहीं होगी। Parent पूछें तो: “यह अंतिम Tracker और Doctor की समीक्षा के बाद, बच्चे की ज़रूरत के अनुसार तय होगा।”' },
      ],
    },
    {
      title: 'SECTION B–E — CRM Session Record & Completion',
      blocks: [
        { t: 'grid', id: 'sessionRecord', label: 'Session FS-03', rows: [
          { id: 'priorities', label: 'Parent Future Priorities', options: ['Recorded (Clinician Review Pending)', 'None'] },
          { id: 'understanding', label: 'Parent Understanding', options: ['Clear', 'Partial', 'Needs Training'] },
          { id: 'activity', label: 'Assigned Activity Status', options: ['Started', 'Difficulty', 'Not Started'] },
          { id: 'barrier', label: 'Main Barrier', options: ['Time', 'Understanding', 'Child Distress', 'Other'] },
          { id: 'demo', label: 'Training Demonstration', options: ['Done', 'Needed', 'Not Applicable'] },
          { id: 'support', label: 'Parent Support Need', options: ['None', 'Basic', 'Specialist'] },
          { id: 'clinical', label: 'Pending Clinical Concern', options: ['Yes', 'No'] },
          { id: 'tracker', label: 'Tracker Record Available', options: ['Yes', 'No → Task'] },
          { id: 'scheduled', label: 'Tracker 03 / Final Review Scheduled', options: ['Scheduled', 'Pending'] },
        ] },
        taskRegister(5),
        { t: 'note', label: 'Mandatory', tone: 'warn', text: MANDATORY },
      ],
    },
    familyCompletion({
      rules: [
        'Guardian identity verified', 'Urgent issue triage हुआ', 'Parent की 1-2 मुख्य चिंताएँ दर्ज', 'Tracker 01–02 की approved बातें समझाईं', 'Generalisation की बाधा दर्ज',
        'Clinician-approved अगली skills की प्राथमिकता दर्ज', 'अंतिम Tracker और Final Clinical Review की प्रक्रिया समझाई', 'Day 180 तक Home Action (अधिकतम 2) दर्ज',
        'Parent के सवाल Doctor के लिए दर्ज', 'Pending actions के अलग Task, Owner, Due Date', 'कोई continuation / package का दबाव नहीं डाला',
      ],
      trainingNote: 'Training Completed तभी चुनें जब इस सेशन में वास्तव में demonstration हुआ। नहीं हुआ तो “Not Applicable”।',
    }),
    { title: "Staff DO'S & DON'TS", blocks: [DOS_DONTS] },
  ],
};
