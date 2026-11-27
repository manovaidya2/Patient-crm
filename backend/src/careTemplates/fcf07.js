// MV-FCF-07 • Family Care Foundation Program — Session 07 / 07 (Day 7): Parent Guidance & Integrated Daily Routine Session
// (closes the Foundation Program).
const B = require('./blocks');

// ---- Shared header of the foundation sessions ("सेशन की जानकारी — Auto Fetch + Timer") --------------------------
const sessionInfo = () => ({
  title: 'सेशन की जानकारी',
  time: 'Auto Fetch + Timer',
  blocks: [
    { t: 'facts', id: 'callIds', rows: [
      { id: 'sessionRef', label: 'Session ID', from: 'sessionRef', hint: 'Auto' },
      { id: 'patientCode', label: 'Patient ID', from: 'patientCode', hint: 'Auto' },
      { id: 'callDate', label: 'Date', from: 'today', hint: 'Auto' },
      { id: 'counsellor', label: 'Counsellor', from: 'counsellor', hint: 'Staff (Auto: logged-in)' },
      { id: 'nameAge', label: 'Patient Name / Age', from: 'patientNameAge', hint: 'Auto' },
    ] },
    { t: 'note', tone: 'info', text: 'शुरू / ख़त्म / कुल समय अपने-आप दर्ज होता है: फ़ॉर्म खुलने से "Mark done" तक (Timer)। Call Recording और Call Duration — Auto Fetch (integration हो तो)।' },
    { t: 'one', id: 'mode', label: 'Mode', options: ['Call', 'Video Call', 'Clinic में'] },
    { t: 'text', id: 'speakerName', label: 'बात करने वाले का नाम' },
    { t: 'one', id: 'spokeWith', label: 'संबंध', options: B.SPOKE, other: 'Other' },
    { t: 'one', id: 'authorized', label: 'Authorized Guardian?', options: ['Yes', 'No → Verify'] },
  ],
});

const SAFE = 'कोई परेशानी नहीं → आगे बढ़ें';
const SAFETY_ISSUE = { id: 'safety', not: [SAFE] };
const PERSON = ['माँ', 'पिता', 'दादा-दादी / नाना-नानी', 'अन्य'];
const YES_NO = ['नहीं', 'हाँ'];
const LINK = ['Scheduled', 'Pending'];

// Step 16: the Foundation sessions (CRM status + "parent को दोबारा समझना है?").
const FOUNDATION = [
  { id: 'f1', label: '01 · परिचय (Orientation)', from: 'status:FCF-01', hint: 'CRM Status (Auto)' },
  { id: 'f2', label: '02 · Customised Medicine', from: 'status:FCF-02', hint: 'CRM Status (Auto)' },
  { id: 'f3', label: '03 · Nutrition & Lifestyle', from: 'status:FCF-03', hint: 'CRM Status (Auto)' },
  { id: 'f4', label: '04 · Panchakarma Home Care', from: 'status:FCF-04', hint: 'Done / N/A' },
  { id: 'f5', label: '05 · Sensory & Verbal Imitation Therapy', from: 'status:FCF-05', hint: 'Done / N/A' },
  { id: 'f6', label: '06 · Home Activity Training', from: 'status:FCF-06', hint: 'CRM Status (Auto)' },
  { id: 'papers', label: 'अन्य Training Papers (Marma, Toilet, Seating आदि)', from: 'issuedPapers', hint: 'Issued / N/A' },
];

// Step 20: the six-month schedule (Journey Card). Day 180 (Tracker 03 + Final Review) is in the clinic, not a CRM session.
const JOURNEY = [
  ['jFs01', 'Family Session 01 — Day 15', 'FS-01'],
  ['jFu01', 'Follow-up 01 — Day 20', 'FU-01'],
  ['jFu02', 'Follow-up 02 — Day 50', 'FU-02'],
  ['jDt01', 'Development Tracker 01 — Day 60', 'DT-01'],
  ['jFu03', 'Follow-up 03 — Day 80', 'FU-03'],
  ['jFs02', 'Family Session 02 — Day 105', 'FS-02'],
  ['jFu04', 'Follow-up 04 — Day 110', 'FU-04'],
  ['jDt02', 'Development Tracker 02 — Day 120', 'DT-02'],
  ['jFu05', 'Follow-up 05 — Day 140', 'FU-05'],
  ['jFs03', 'Family Session 03 — Day 165', 'FS-03'],
  ['jFu06', 'Follow-up 06 — Day 170', 'FU-06'],
];

module.exports = {
  code: 'FCF-07',
  key: 'MV-FCF-07',
  version: 1,
  kind: 'foundation',
  seq: 7,
  day: 7,
  title: 'Parent Guidance & Integrated Daily Routine Session',
  subtitle: 'Part A: बच्चे को उसकी आज की क्षमता से समझना · Part B: सब कुछ एक दिनचर्या में + आगे की यात्रा',
  meta: [
    ['Program', 'Family Care Foundation Program • Session 07'],
    ['Session Code', 'MV-FCF-07'],
    ['CRM Schedule', 'Foundation Day 7'],
    ['Session Name', 'Parent Guidance & Integrated Daily Routine'],
    ['हिंदी नाम', 'माता-पिता मार्गदर्शन एवं समग्र दिनचर्या'],
    ['Conducted By', 'Trained Medical Counsellor'],
    ['Mode', 'Call / Video Call / Clinic में'],
    ['Reference Paper', 'माता-पिता के लिए मार्गदर्शन (Section 01–10) + CRM Auto ‘Daily Care Routine Card’ और ‘Journey Card’'],
    ['Applicability', 'Always (Foundation Program का समापन)'],
    ['Prerequisite', 'FCF-01…06 Completed / N/A'],
    ['Next Session (Auto)', 'MV-FS-01 · Family Session 01 (Day 15)'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    sessionInfo(),
    {
      title: 'SECTION A — सेशन से पहले (CRM Auto)',
      time: 'Auto Fetch / Read Only',
      blocks: [
        { t: 'note', tone: 'info', text: 'काउंसलर कॉल से पहले यह स्क्रीन देखे। ये fields parent से दोबारा नहीं पूछे जाते।' },
        { t: 'facts', id: 'sectionA', rows: [
          { id: 'age', label: 'बच्चे की उम्र', from: 'childAge', hint: 'Patient Profile' },
          { id: 'ability', label: 'Doctor / Therapist के अनुसार वर्तमान क्षमता (domain-wise Phase)', from: '', hint: 'Future Development Record' },
          { id: 'behaviour', label: 'Behaviour concerns (History) — रोना, गुस्सा, खुद को / दूसरों को चोट', from: 'clinicalConcerns', hint: 'Clinical History' },
          { id: 'family', label: 'परिवार — कौन-कौन साथ रहता है, बच्चे की देखभाल कौन करता है', from: 'ans:FCF-01:familyMembers', hint: 'Patient Profile (FCF-01)' },
          { id: 'activityPerson', label: 'Activity करवाने वाला (FCF-06)', from: 'ans:FCF-06:activityPerson', hint: 'FCF-06' },
          { id: 'activityTime', label: 'Activity का समय (FCF-06)', from: 'ans:FCF-06:activityTime', hint: 'FCF-06' },
          { id: 'foundation', label: 'FCF-01…06 का Status', from: 'foundationStatus', hint: 'Foundation Program' },
          { id: 'pending', label: 'Pending Tasks', from: 'openIssues', hint: 'Foundation Program' },
        ] },
        { t: 'note', tone: 'info', text: 'उठने का समय · School समय · Medicine slots · Diet · पंचकर्म · Therapy समय (Carry Forward FCF-02…06) → Step 17 का Auto draft। आगे के सभी Follow-up / FS / Tracker की तारीखें (Auto Schedule) → Step 20।' },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist (सब ✓ होने पर ही Session शुरू करें)', items: [
          'वर्तमान क्षमता / Phase देख लिया (उम्र के साथ तुलना के लिए)',
          'Behaviour history पढ़ ली — जो लिखा है वह दोबारा नहीं पूछना',
          'ख़तरनाक व्यवहार का record देखा',
          'Draft Daily Care Routine Card खोल लिया',
          'Parents Guidance paper भेजा',
          'FS-01 का slot उपलब्ध है',
        ] },
        { t: 'note', tone: 'rule', label: 'इस सेशन का स्वर', text: 'Parent को कभी गलत, लापरवाह या दोषी महसूस न कराएँ। हर बात ‘आप ऐसा करते हैं’ नहीं, ‘बहुत से parents ऐसा करते हैं — और यह स्वाभाविक है’ से शुरू करें। Parent अपने बच्चे को सबसे अच्छी तरह जानते हैं — हम सिर्फ़ तरीका जोड़ रहे हैं।' },
      ],
    },
    {
      title: 'STEP 01 — सेशन की शुरुआत + पिछले सेशन से जोड़',
      blocks: [
        { t: 'say', text: [
          '“नमस्ते मैम/सर, मैं MANOVAIDYA Clinic की Medical Care Team से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
          '“आज आपके बच्चे का Parent Guidance & Integrated Daily Routine Session है। आज हम दो हिस्से हैं — पहले, घर में [Child Name] को कैसे समझें, कैसे बात करें और परिवार की प्रतिक्रिया कैसी हो; फिर, अब तक की सारी बातों को [Child Name] की एक दिनचर्या में जोड़ेंगे और आगे की यात्रा देखेंगे। माता-पिता के लिए मार्गदर्शन वाला paper सामने रख लीजिए।”',
          '“इसमें लगभग 30–40 मिनट लगेंगे — बीच में ज़रूरत हो तो छोटा ब्रेक ले सकते हैं। क्या अभी आप आराम से बात कर सकते हैं?”',
        ].join('\n') },
        { t: 'response', id: 'response', label: 'Parent Availability', options: [
          'Available → Continue', 'Busy → Reschedule (Date/Time)', 'Network समस्या → Reconnect / Reschedule', 'दूसरे Guardian → Authorization verify',
        ] },
        { t: 'one', id: 'safety', label: 'Quick Health Check — “कल से बच्चे को कोई नई परेशानी या दवा से कोई तकलीफ़ तो नहीं हुई?”', options: [
          SAFE, 'हल्की परेशानी → नोट + Medical Review Task', 'गंभीर / Emergency संकेत → सेशन रोकें, Triage',
        ] },
        { t: 'text', id: 'safetyProblem', label: 'नोट — क्या परेशानी है (जो parent ने बताया)', long: true, show: SAFETY_ISSUE },
        ...B.triage({ show: SAFETY_ISSUE }),
        { t: 'note', tone: 'info', text: 'यह इकलौता सवाल है जो हर Foundation सेशन में आता है — क्योंकि दवा अभी-अभी शुरू हुई है। विस्तार से history दोबारा न पूछें।' },
        { t: 'say', text: '“कल हमने activities सीखीं — क्या करवाना है। आज उससे भी ज़रूरी बात — कैसे साथ रहना है। क्योंकि बच्चा activity से नहीं, आपके साथ रिश्ते से सीखता है।”' },
      ],
    },
    {
      title: 'STEP 02 — सबसे पहले — आप अकेले नहीं हैं',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'सम्मान और भरोसा — बाकी सेशन इसी पर टिकता है।' },
        { t: 'say', text: [
          '“मैम, सबसे पहले एक बात — जो परिवार इस राह पर चलता है, उसे बहुत कुछ एक साथ सँभालना पड़ता है: बच्चे की देखभाल, घर, काम, और ऊपर से लोगों की बातें। जो थकान या उलझन आप कभी महसूस करती हैं, वह बिल्कुल स्वाभाविक है।”',
          '“आप अपने बच्चे को दुनिया में सबसे अच्छी तरह जानती हैं। आज हम आपको कुछ तरीके देंगे — ताकि वही प्यार सही दिशा में ज़्यादा असर करे।”',
        ].join('\n') },
      ],
    },
    {
      title: 'STEP 03 — उम्र नहीं — आज की क्षमता देखें',
      blocks: [
        { t: 'note', tone: 'info', label: 'PART A — माता-पिता मार्गदर्शन', text: 'Parents Guidance Paper' },
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'इस सेशन का सबसे ज़रूरी विचार। बहुत से parents बच्चे को उसकी उम्र के हिसाब से समझते और उम्मीद करते हैं।' },
        { t: 'say', text: [
          '“मैम, एक बहुत ज़रूरी बात समझनी है। हम अक्सर बच्चे को उसकी उम्र से देखते हैं — ‘6 साल का है, इतना तो करना चाहिए।’ लेकिन [Child Name] की आज की क्षमता कुछ क्षेत्रों में उसकी उम्र से अलग है। कई बच्चे हमारे पास बिल्कुल शुरुआत से आते हैं — और यह कोई कमी या शर्म की बात नहीं; यह बस शुरुआती बिंदु है।”',
          '“बीज से वृक्ष वाला उदाहरण याद कीजिए — हम पौधे को उसके साल से नहीं, उसकी आज की ऊँचाई से देखते हैं और उसी हिसाब से पानी-धूप देते हैं। बच्चे के साथ भी — उसकी उम्र नहीं, आज वह क्या कर पाता है, उसी से शुरू करना है।”',
        ].join('\n') },
        { t: 'info', head: ['उम्र सोचकर parent अक्सर…', 'आज की क्षमता देखकर सही तरीका'], rows: [
          ['लंबे निर्देश देते हैं — ‘जाओ, जूते पहनकर बैग लाओ’', 'एक छोटा निर्देश + इशारा — ‘जूते’ (और जूते दिखाएँ)'],
          ['‘इतना बड़ा होकर भी नहीं बोलता’ — गुस्सा या शर्म', 'आज इशारा करता है → अगला कदम एक शब्द'],
          ['उम्र वाले खिलौने / पढ़ाई थोपते हैं', 'जिस खेल में आज रुचि और क्षमता है, वहीं से'],
          ['गलती को ‘जान-बूझकर’ मानते हैं', 'सोचें — क्या उसने समझा? क्या वह कर सकता है?'],
          ['दूसरे इसी उम्र के बच्चों से तुलना', 'सिर्फ़ अपने बच्चे की पिछले महीने से तुलना'],
        ] },
        { t: 'facts', id: 'abilityNow', label: 'बच्चे की उम्र और आज की मुख्य क्षमता', rows: [
          { id: 'age', label: 'उम्र (वर्ष)', from: 'childAge', hint: 'Patient Profile' },
          { id: 'ability', label: 'आज की मुख्य क्षमता (Auto, सरल भाषा)', from: '', hint: 'Future Development Record' },
        ] },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'क्षमता की ‘उम्र’ (जैसे ‘2 साल जैसी’) अपने से न बोलें — सिर्फ़ Future Development Record में doctor / therapist की लिखी सरल भाषा बोलें।' },
      ],
    },
    {
      title: 'STEP 04 — शुरुआत ज़ीरो से — पहले रिश्ता, फिर सिखाना',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'बच्चा जिस व्यक्ति के साथ सुरक्षित महसूस करता है, उसी से सीखता है।' },
        { t: 'say', text: [
          '“जो बच्चा बिल्कुल शुरुआत से है, उसके साथ parent का पहला काम ‘सिखाना’ नहीं — भरोसे का रिश्ता बनाना है। ये पाँच बातें रोज़ —',
          '1. सुरक्षित महसूस कराएँ: धीमी आवाज़, शांत चेहरा; डाँट, झटका या डर नहीं।',
          '2. रोज़ 10–15 मिनट सिर्फ़ उसके साथ: मोबाइल दूर, बिना कुछ सिखाए — बस उसके पास, उसकी पसंद के खेल में।',
          '3. उसकी रुचि में जुड़ें: वह जो कर रहा है, आप भी वही कीजिए — उसे बदलने की जल्दी नहीं।',
          '4. कम शब्द, साफ़ शब्द: एक बार में एक-दो शब्द।',
          '5. हर छोटी कोशिश पर खुशी दिखाएँ: देखना, हाथ बढ़ाना, आवाज़ — सब कोशिश है।”',
          '“जब बच्चा आपके साथ सुरक्षित और खुश महसूस करेगा, तब वह आपकी नकल करेगा, आपकी बात सुनेगा — यही सीखने की जड़ है।”',
        ].join('\n') },
        { t: 'list', id: 'relationTold', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          'सुरक्षित महसूस — डर / डाँट नहीं',
          'रोज़ 10–15 मिनट सिर्फ़ उसके साथ',
          'उसकी रुचि में जुड़ना',
          'कम शब्द, साफ़ शब्द',
          'हर छोटी कोशिश पर खुशी',
        ] },
      ],
    },
    {
      title: 'STEP 05 — Paper 01 — सबसे पहले बच्चे को समझें',
      blocks: [
        { t: 'say', text: [
          '“• बच्चा क्या बताना चाह रहा है? बोलकर न बता पाए तो वह रोकर, हाथ पकड़कर, इशारा करके या दूर भागकर बताता है। पहले देखें — भूख, प्यास, नींद, दर्द, शोर, डर या ध्यान की ज़रूरत।',
          '• हर बच्चे की गति अलग: तुलना नहीं; आज कल से किस छोटे काम में बेहतर हुआ, उस पर ध्यान।',
          '• पहले जुड़ें, फिर समझाएँ: पास बैठें, नाम लेकर आराम से बात करें, जवाब का समय दें; आँखों में देखने के लिए मजबूर न करें।”',
        ].join('\n') },
        { t: 'list', id: 'paper01Told', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          'व्यवहार = बच्चे की बात (भूख, दर्द, डर…)',
          'तुलना नहीं — कल से आज',
          'पहले जुड़ें, फिर समझाएँ; eye contact ज़बरदस्ती नहीं',
        ] },
      ],
    },
    {
      title: 'STEP 06 — Paper 02 — जब बच्चा ज़िद करे, रोए या गुस्सा हो — 4 कदम',
      blocks: [
        { t: 'say', text: [
          '1 · सुरक्षा और शांति — “अपनी आवाज़ धीमी रखिए। चोट पहुँचाने वाली चीज़ हटाइए। झकझोरना, धमकाना या मारना नहीं।”',
          '2 · वजह खोजें — “देखिए वह क्या चाहता था — काम कठिन लगा, अचानक बदलाव हुआ, या माहौल बहुत तेज़ / भीड़ वाला था। हर बार इसे जान-बूझकर की गई ज़िद न मानें।”',
          '3 · छोटे विकल्प दें — “‘तुम पानी चाहते हो या थोड़ा आराम?’ — सिर्फ़ दो विकल्प, बच्चे की समझ के अनुसार।”',
          '4 · शांत होने के बाद सिखाएँ — “गुस्से के बीच भाषण नहीं। शांत होने पर ‘मदद’, ‘ब्रेक’, ‘नहीं चाहिए’ — शब्द या इशारा सिखाइए, कोशिश की तारीफ़ कीजिए।”',
        ].join('\n') },
      ],
    },
    {
      title: 'STEP 07 — Paper 03 — रोज़ की बातचीत और काम कैसे करवाएँ',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: '‘काम करवाना’ भी आज की क्षमता से — पूरा करवाने के लिए मदद की सीढ़ी।' },
        { t: 'say', text: [
          '“• कम शब्द, स्पष्ट बात: एक समय पर एक आसान निर्देश — ‘जूते यहाँ रखो।’ फिर कुछ सेकंड इंतज़ार; ज़रूरत हो तो इशारा या चित्र।',
          '• बच्चे की बात सुनें: इशारे, चित्र, आवाज़ और चेहरे के भाव भी बात हैं।',
          '• छोटे प्रयास की तारीफ़: ‘तुमने खिलौना वापस रखा, अच्छा किया!’ — खास काम की तारीफ़।”',
          '“और जब कोई काम करवाना हो, तो मदद की सीढ़ी —',
          '1. पहले खुद करके दिखाइए।',
          '2. फिर हल्का हाथ पकड़कर साथ में कराइए।',
          '3. फिर सिर्फ़ इशारा कीजिए।',
          '4. फिर सिर्फ़ शब्द।',
          '5. फिर बच्चा खुद।',
          'हर कदम पर तारीफ़ — और जब एक कदम आसान हो जाए, तभी मदद कम कीजिए।”',
        ].join('\n') },
        { t: 'list', id: 'paper03Told', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          'एक छोटा निर्देश + इंतज़ार + इशारा',
          'इशारा / आवाज़ / भाव भी बात हैं',
          'खास काम की तारीफ़',
          'मदद की सीढ़ी — दिखाना → हाथ से → इशारा → शब्द → खुद',
        ] },
      ],
    },
    {
      title: 'STEP 08 — Paper 04–05 — दिनचर्या, बदलाव, स्क्रीन, नींद, संवेदनशीलता',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'खाने की विस्तृत बात Diet सेशन में हो चुकी है — यहाँ सिर्फ़ व्यवहार वाला हिस्सा।' },
        { t: 'say', text: [
          '“• अनुमान लगाने योग्य दिनचर्या: सोना, उठना, भोजन, खेल का क्रम रोज़ एक जैसा; चित्रों का छोटा chart मदद करता है।',
          '• बदलाव पहले बताएँ: ‘पाँच मिनट बाद खिलौने रखेंगे।’',
          '• स्क्रीन: अचानक न छीनें — पहले सूचना, फिर पसंद का दूसरा विकल्प। हर रोने पर मोबाइल देना समाधान नहीं।',
          '• खाने के समय दबाव नहीं, ज़बरदस्ती मुँह खोलकर नहीं।',
          '• सोने से पहले शांत समय: हल्की रोशनी, कहानी, स्क्रीन से दूरी।',
          '• आवाज़, रोशनी, कपड़े: तेज़ आवाज़, भीड़, गंध या कपड़े की बनावट परेशान कर सकती है — ज़बरदस्ती सहन न कराएँ।”',
        ].join('\n') },
        { t: 'list', id: 'paper04Told', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          'एक जैसी दिनचर्या',
          'बदलाव पहले बताना',
          'स्क्रीन — सूचना + विकल्प',
          'खाने में दबाव नहीं',
          'सोने से पहले शांत समय',
          'Sensory परेशानी — ज़बरदस्ती नहीं',
        ] },
      ],
    },
    {
      title: 'STEP 09 — Paper 06 — घर और परिवार का एक जैसा व्यवहार',
      blocks: [
        { t: 'say', text: [
          '“घर के बड़े लोग मिलकर तय करें कि कठिन स्थिति में क्या कहना है। एक व्यक्ति डाँटे और दूसरा तुरंत मोबाइल दे दे — तो बच्चे को नियम समझना मुश्किल होता है।”',
          '“भाई-बहनों को उम्र के हिसाब से समझाइए; साथ खेलने का मौका दीजिए, पर देखभाल की पूरी ज़िम्मेदारी उन पर नहीं। स्कूल को बताइए कि बच्चे को क्या अच्छा लगता है और क्या परेशान करता है।”',
        ].join('\n') },
        { t: 'many', id: 'guidanceReach', label: '“यह guidance घर के और किन सदस्यों तक पहुँचनी चाहिए?”', options: ['पिता', 'माता', 'दादा-दादी / नाना-नानी', 'अन्य caregiver'], other: 'अन्य caregiver' },
        { t: 'check', id: 'guidancePaperSent', label: 'Paper WhatsApp पर उन्हें भेजा' },
      ],
    },
    {
      title: 'STEP 10 — रिश्तेदारों और आसपास के लोगों की बातें',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parents सबसे ज़्यादा यहीं उलझते हैं — सुनी-सुनाई बातों से बच्चे की असली स्थिति और plan भूल जाते हैं।' },
        { t: 'say', text: '“मैम, बहुत से parents बताते हैं कि रिश्तेदार, पड़ोसी या जान-पहचान वाले अलग-अलग बातें कहते हैं — और फिर मन में उलझन होने लगती है। लोग अक्सर प्यार से कहते हैं, पर वे [Child Name] की असली स्थिति और उसका plan नहीं जानते। उसे आप और हमारी टीम जानती है।”' },
        { t: 'info', head: ['अक्सर सुनने वाली बात', 'सच्चाई — parent क्या सोचें / कह सकते हैं'], rows: [
          ['‘अपने आप बोलने लगेगा, फलाने का बच्चा भी देर से बोला था’', '“हर बच्चे की स्थिति अलग है। इंतज़ार करने से बेहतर है कि अभी से सही मदद मिले — हम वही कर रहे हैं।”'],
          ['‘तुमने लाड़ में बिगाड़ दिया है’', '“यह परवरिश की गलती नहीं; बच्चे को समझने और बताने में कठिनाई है। हम तरीका सीख रहे हैं।”'],
          ['‘डाँटो / मारो, सब ठीक हो जाएगा’', 'डर से बच्चा सीखता नहीं, सहमता है — शांत, एक जैसा तरीका ही काम करता है।'],
          ['‘इतना बड़ा होकर भी…’ (उम्र से तुलना)', '“हम उसकी आज की क्षमता से चल रहे हैं — हर महीने छोटा कदम आगे।”'],
          ['‘दवा बंद कर दो / यह दूसरी चीज़ दे दो’', 'Doctor से पूछे बिना कोई दवा बंद या नई चीज़ शुरू नहीं — पहले हमसे बात।'],
          ['‘नज़र लगी है / यह उपाय करो’', 'कोई भी उपाय जो बच्चे को डराए, दर्द दे या भूखा रखे — बिल्कुल नहीं। संदेह हो तो हमसे पूछें।'],
        ] },
        { t: 'note', tone: 'rule', label: 'जब मन उलझे — 3 सवाल पूछें (parent को सिखाएँ)', text: '1. क्या यह बात मेरे बच्चे के doctor / टीम ने कही है?\n2. क्या यह मेरे बच्चे की आज की क्षमता के हिसाब से है?\n3. क्या इससे मेरा बच्चा सुरक्षित रहेगा?\n— किसी का भी जवाब ‘नहीं’ या ‘पता नहीं’ हो, तो पहले हमारी टीम से पूछें।' },
        { t: 'say', text: '“आपको किसी से बहस करने की ज़रूरत नहीं — बस इतना कह सकती हैं: ‘धन्यवाद, हम doctor की सलाह से चल रहे हैं।’ और जब भी कोई बात मन में अटके, उसे हमारे साथ Follow-up या Family Session में ज़रूर पूछिए।”' },
        { t: 'many', id: 'heardWorries', label: '“आसपास से अक्सर कौन-सी बात सुनने को मिलती है जो आपको परेशान करती है?” (Carry Forward → FS-01)', options: [
          'अपने आप बोलेगा', 'लाड़ / परवरिश', 'डाँटने-मारने की सलाह', 'उम्र से तुलना', 'दवा / उपाय की सलाह', 'कोई नहीं',
        ] },
        { t: 'text', id: 'heardWorriesNote', label: 'Parent के शब्दों में / और कोई बात', long: true },
      ],
    },
    {
      title: 'STEP 11 — Paper 07 — गलतियाँ जो नहीं करनी हैं',
      blocks: [
        { t: 'info', head: ['गलती', 'इसकी जगह'], rows: [
          ['चिल्लाना, मारना, शर्मिंदा करना — ‘तुम कभी नहीं सुधरोगे’', 'शांत आवाज़, एक छोटा निर्देश'],
          ['एक ही दिन में बहुत अपेक्षा', 'एक छोटा, संभव लक्ष्य — और समय'],
          ['बहुत दूर का लक्ष्य एक साथ देखना', 'सिर्फ़ अगला एक कदम'],
          ['उम्र के हिसाब से उम्मीद', 'आज की क्षमता के हिसाब से'],
          ['हर व्यवहार को जानबूझकर मानना', 'दर्द, थकान, संचार की कठिनाई, sensory overload भी देखें'],
          ['हर समय test लेना — ‘ये बोलो, वो करो’', 'सामान्य खेल, बातचीत और आराम भी'],
          ['दूसरों की सलाह पर plan बदल देना', 'पहले doctor / टीम से पूछें'],
          ['समस्या छिपाना, सहायता देर से लेना', 'छोटे सुधार और कठिनाइयाँ — दोनों ईमानदारी से बताएँ'],
        ] },
      ],
    },
    {
      title: 'STEP 12 — Paper 08 — आपकी अपनी देखभाल',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'यहाँ सिर्फ़ guidance — parent wellbeing पर विस्तृत सवाल Family Session 02 में होते हैं।' },
        { t: 'say', text: '“मैम, बच्चे की देखभाल करते हुए अपनी नींद, भोजन और थोड़े आराम का भी ध्यान रखिए — माली थका होगा तो बगीचा भी थकेगा। परिवार से साफ़ शब्दों में मदद माँगिए — ‘रोज़ शाम 20 मिनट बच्चे के साथ रहिए, मैं आराम कर लूँ।’ हर कठिन दिन आपकी परवरिश का मूल्यांकन नहीं है। लगातार बहुत तनाव या उदासी लगे तो हमें बताइए — मदद मिल सकती है।”' },
      ],
    },
    {
      title: 'STEP 13 — Paper 09–10 — सुधार कैसे पहचानें + छोटी जीत',
      blocks: [
        { t: 'say', text: [
          '“• छोटी प्रगति देखिए — पहले 10 मिनट रोता था, अब 5 मिनट में शांत; पहले इशारा नहीं, अब पानी के लिए संकेत।',
          '• रोज़ सिर्फ़ तीन बातें — आज क्या अच्छा हुआ? किस बात पर परेशानी? किस तरीके से मदद मिली?',
          '• सुधार सीधी रेखा में नहीं होता — कुछ दिन आसान, कुछ कठिन।',
          '• Paper के Section 10 में ‘इस हफ़्ते की मेरी बच्चे की छोटी जीत’ लिखने की जगह है — अगली Family Session में हम सबसे पहले वही सुनेंगे।”',
        ].join('\n') },
      ],
    },
    {
      title: 'FUTURE VISION POINT — माली की भूमिका',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: '“बीज से वृक्ष में — आपकी शांत प्रतिक्रिया, छोटा साफ़ निर्देश और हर कोशिश की तारीफ़ — ये पौधे की धूप और पानी हैं। हर नई क्षमता एक नई पत्ती है — उसे देखिए, और सोचिए कि अगला छोटा कदम क्या हो सकता है।”' },
        { t: 'list', id: 'maliTold', label: '✓ करें', items: ['बोला गया', '‘छोटी जीत’ लिखने को कहा'] },
      ],
    },
    {
      title: 'STEP 14 — तीन आम स्थितियाँ + Situation Teach-Back',
      blocks: [
        { t: 'info', head: ['स्थिति', 'क्या करें (paper)'], rows: [
          ['दुकान में खिलौने के लिए रोए', 'सुरक्षा और शांति; सरल सीमा — ‘आज खिलौना नहीं लेंगे’; साथ चलने / पानी का विकल्प; रोना बंद कराने के लिए हर बार नियम न बदलें'],
          ['बात नहीं माने', 'पहले देखें कि उसने समझा और सुना; एक छोटा निर्देश, इशारा, समय; सफल होने पर तुरंत तारीफ़'],
          ['अचानक चीखे या चीज़ें फेंके', 'दूरी और सुरक्षा; शोर, दर्द, थकान, निराशा देखें; शांत होने पर मदद माँगने का तरीका; बार-बार हो तो विशेषज्ञ से योजना'],
        ] },
        { t: 'say', text: 'Teach-Back — “अगर किसी दिन [Child Name] बहुत रो रहा है और बात नहीं मान रहा — आज की guidance के अनुसार आप सबसे पहले क्या करेंगी?”' },
        { t: 'text', id: 'teachBackText', label: 'Teach-Back — Parent ने अपने शब्दों में क्या बताया', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back Result', options: ['सही बताया', 'आंशिक — दोबारा समझाया', 'समझ नहीं आया → Repeat Explanation Task'] },
        { t: 'text', id: 'specialSituation', label: '“घर की ऐसी कौन-सी एक स्थिति है जिसमें आपको खास मार्गदर्शन चाहिए?” (Carry Forward → FS-01 Step 02)', long: true },
        { t: 'one', id: 'dangerBehaviour', label: 'क्या कोई ख़तरनाक व्यवहार है — खुद को चोट, दूसरों को चोट, घर से भाग जाना? (Integrated Care)', options: ['नहीं', 'हाँ → Specialist Review Task (Priority)'] },
        { t: 'note', tone: 'warn', text: 'Specialist Review Task (Priority) — नीचे Task Register में Owner और Due Date के साथ दर्ज करें।', show: { id: 'dangerBehaviour', any: ['हाँ → Specialist Review Task (Priority)'] } },
      ],
    },
    {
      title: 'STEP 15 — Part A से Part B तक — जोड़',
      blocks: [
        { t: 'note', tone: 'info', label: 'PART B', text: 'सब कुछ एक दिनचर्या में + आगे की यात्रा' },
        { t: 'say', text: '“मैम, अभी हमने समझा कि [Child Name] के साथ कैसे रहना है। पिछले छह सेशन में आपने दवा, आहार, पंचकर्म, थेरेपी और activities — क्या करना है, वह सीखा। अब इन सबको एक दिनचर्या में जोड़ते हैं — कोई नई चीज़ नहीं जोड़ेंगे।”' },
      ],
    },
    {
      title: 'STEP 16 — Foundation Sessions की पुष्टि',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'CRM status Auto दिखेगा — parent से सिर्फ़ इतना पूछें कि किसी विषय को दोबारा समझना है या नहीं।' },
        { t: 'facts', id: 'foundationCrm', label: 'Foundation Session — CRM Status (Auto)', rows: FOUNDATION },
        { t: 'say', text: '“मैम, इनमें से किसी विषय में कोई बात है जो आप दोबारा समझना चाहेंगी?”' },
        { t: 'grid', id: 'reExplain', label: 'Parent को दोबारा समझना है?', rows: FOUNDATION.map(({ id, label }) => ({ id, label, options: YES_NO })) },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'छोटी बात हो तो 1–2 मिनट में साफ़ करें। पूरा विषय दोबारा समझाना हो तो आज न करें — ‘Repeat Explanation Task’ बनाएँ, ताकि आज का routine सेशन लंबा न हो।' },
      ],
    },
    {
      title: 'STEP 17 — पूरे दिन की योजना — Daily Care Routine Card',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'CRM पहले के सेशन से Auto-draft बनाता है; काउंसलर parent के साथ पढ़कर adjust करता है।' },
        { t: 'say', text: '“मैम, अब [Child Name] का पूरा दिन एक साथ देख लेते हैं। यह सब आपने पिछले सेशन में बताया था — मैं बस जोड़कर पढ़ रही हूँ, जहाँ बदलना हो, बताइए।”' },
        { t: 'facts', id: 'routineDraft', label: 'Auto draft from earlier sessions (FCF-01…06)', rows: [
          { id: 'wake', label: 'उठने का समय (Wake Time)', from: 'ans:FCF-02:wakeTime', hint: 'FCF-02' },
          { id: 'medTimes', label: 'Medicine slots — कब दी जाती हैं', from: 'ans:FCF-02:medicineTimes', hint: 'FCF-02' },
          { id: 'm1', label: 'M1 सुबह खाली पेट', from: 'med:M1', hint: 'Prescription' },
          { id: 'm2', label: 'M2 सुबह–शाम', from: 'med:M2', hint: 'Prescription' },
          { id: 'm3', label: 'M3 दोपहर–रात', from: 'med:M3', hint: 'Prescription' },
          { id: 'm4', label: 'M4 रात की दवाई', from: 'med:M4', hint: 'Prescription' },
          { id: 'm5', label: 'M5 Nasya', from: 'med:M5', hint: 'Prescription' },
          { id: 'm6', label: 'M6 तेल / अभ्यंग', from: 'med:M6', hint: 'Prescription' },
          { id: 'school', label: 'School / Play-school समय', from: 'ans:FCF-03:schoolTime', hint: 'FCF-03' },
          { id: 'panchakarma', label: 'पंचकर्म — तेल / नस्य का समय', from: 'ans:FCF-04:panchakarmaTime', hint: 'FCF-04' },
          { id: 'therapy', label: 'Therapy समय (Sensory / ध्वनि-अनुकरण)', from: 'ans:FCF-05:therapyTime', hint: 'FCF-05' },
          { id: 'activityPerson', label: 'Home Activity करवाने वाला', from: 'ans:FCF-06:activityPerson', hint: 'FCF-06' },
          { id: 'activityTime', label: 'Home Activity समय', from: 'ans:FCF-06:activityTime', hint: 'FCF-06' },
          { id: 'family', label: 'परिवार — मुख्य caregiver', from: 'ans:FCF-01:familyMembers', hint: 'FCF-01' },
          { id: 'foundation', label: 'FCF-01…06 Status', from: 'foundationStatus', hint: 'Foundation Program' },
        ] },
        { t: 'info', head: ['समय', 'Medicine (Auto)', 'आहार (Auto)', 'पंचकर्म (Auto)', 'Therapy / Activity'], rows: [
          ['उठने के बाद [Wake Time]', 'M1 खाली पेट', 'शौच, दाँत', 'AB अभ्यंग + सेक → स्नान → M5 सिर पर', ''],
          ['सुबह', 'M2', 'नाश्ता 7–7:30', 'M6 नस्य (doctor का समय) + सेक', 'Sensory (यदि सुबह) → ध्वनि-अनुकरण 5–10 मिनट'],
          ['दोपहर', 'M3', 'भोजन 10–2 के बीच', '', 'ध्वनि-अनुकरण 5–10 मिनट · आराम'],
          ['शाम', 'M2', 'भोजन 7 बजे तक', 'M5 / M6 (यदि शाम)', 'ध्वनि-अनुकरण · Home Activity [Time] · टहलना'],
          ['रात', 'M3', '—', 'सर्दियों में: AB + सेक / गर्म कपड़ा', ''],
          ['सोते समय (10 बजे तक)', 'M4 सिरप', '', '', 'शांत समय, कहानी'],
        ] },
        { t: 'note', tone: 'warn', text: 'ऊपर paper का नमूना card है। Paper में M5 = सिर का तेल और M6 = नस्य लिखा है, जबकि CRM में M5 = Nasya और M6 = तेल / अभ्यंग है — card भरते समय ऊपर के Auto draft (Prescription) की असली दवा का नाम और समय लिखें।' },
        { t: 'matrix', id: 'routineCard', label: 'Daily Care Routine Card — parent के साथ पढ़कर भरें / adjust करें', columns: [
          { id: 'medicine', label: 'Medicine', type: 'text' },
          { id: 'diet', label: 'आहार', type: 'text' },
          { id: 'panchakarma', label: 'पंचकर्म', type: 'text' },
          { id: 'therapy', label: 'Therapy / Activity', type: 'text' },
        ], rows: [
          { id: 'wake', label: 'उठने के बाद (Wake Time)' },
          { id: 'morning', label: 'सुबह' },
          { id: 'noon', label: 'दोपहर' },
          { id: 'evening', label: 'शाम' },
          { id: 'night', label: 'रात' },
          { id: 'bed', label: 'सोते समय (10 बजे तक)' },
        ] },
        { t: 'say', text: '“इस पूरी routine में हमारी कोशिश है कि [Child Name] की सामान्य ज़िंदगी — पढ़ाई, खेल और आराम — भी चलती रहे और तय की गई care भी व्यवस्थित रहे।”' },
        { t: 'one', id: 'routineCardStatus', label: 'Routine Card', options: ['Parent ने स्वीकार किया → Final', 'बदलाव के साथ Final', 'Clinical timing clarification चाहिए → Task'] },
        { t: 'note', tone: 'info', text: 'Routine Card ‘Final’ होने पर उसका एक-पेज PDF parent को WhatsApp पर भेजें।' },
        { t: 'check', id: 'routineCardSent', label: 'Daily Care Routine Card parent को WhatsApp पर भेजा' },
      ],
    },
    {
      title: 'STEP 18 — ज़िम्मेदारियाँ',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Activity वाला व्यक्ति FCF-06 से Auto है — यहाँ सिर्फ़ बाकी ज़िम्मेदारियाँ।' },
        { t: 'auto', id: 'activityBy', label: 'Activity करवाने वाला', from: 'ans:FCF-06:activityPerson', hint: 'FCF-06 Auto' },
        { t: 'one', id: 'medicineBy', label: '“बच्चे को medicines देने की मुख्य ज़िम्मेदारी किसकी रहेगी?”', options: PERSON, other: 'अन्य' },
        { t: 'one', id: 'trackerBy', label: '“Medicine, Diet और Panchakarma trackers कौन भरेगा?”', options: ['वही व्यक्ति', 'अन्य'], other: 'अन्य' },
        { t: 'text', id: 'backupCaregiver', label: '“किसी दिन मुख्य व्यक्ति घर पर न हो, तो परिवार में दूसरा कौन संभालेगा?”' },
      ],
    },
    {
      title: 'STEP 19 — सबसे कठिन क्या लग रहा है?',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Barrier को अभी पकड़ना — ताकि परिवार अकेले न जूझे।' },
        { t: 'many', id: 'hardest', label: '“अब तक की सब बातों में आपको सबसे कठिन क्या लग रहा है?”', options: [
          'दवा का समय', 'आहार बदलना', 'तेल / नस्य', 'Activities के लिए समय', 'बच्चे को सँभालना', 'कुछ नहीं',
        ] },
        { t: 'text', id: 'hardestNote', label: 'विवरण (Parent के शब्दों में)', long: true },
        { t: 'say', text: '“जो भी routine घर पर लागू करना कठिन लगे, अभी बताइए — हम संबंधित टीम से बात करके उसका व्यावहारिक हल निकालेंगे।”' },
      ],
    },
    {
      title: 'STEP 20 — आगे की 6 महीने की यात्रा · FUTURE VISION POINT — पूरी 8-दिशा विकास यात्रा',
      time: '3–5 मिनट · सबसे ज़रूरी Future Vision सेशन',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'यह journey का एकमात्र पूरा परिचय है — FS-01 और आगे के follow-ups में इसे दोबारा विस्तार से नहीं समझाया जाएगा।' },
        { t: 'say', text: '“मैम, शुरुआत में हमने बीज से वृक्ष का उदाहरण सुना था। आज वह पूरा पेड़ एक चित्र में देखते हैं।”' },
        { t: 'info', head: ['#', 'Phase', 'बीज से वृक्ष'], rows: [
          ['01', 'Seed Preparation', 'बीज और मिट्टी की तैयारी'],
          ['02', 'Root Development', 'जड़ों का विकास'],
          ['03', 'Early Growth', 'अंकुर निकलना'],
          ['04', 'Skill Expansion', 'पत्तियों का विकास'],
          ['05', 'Functional Strength', 'तने की मज़बूती'],
          ['06', 'Social Expansion', 'शाखाओं का विस्तार'],
          ['07', 'Life Skill Development', 'फूलों का विकास'],
          ['08', 'Independence & Life Readiness', 'विकसित वृक्ष'],
        ] },
        { t: 'say', text: [
          '“पहला — मिट्टी और बीज: स्वास्थ्य, पोषण, नींद। दूसरा — जड़ें: सहज होना, जुड़ना। तीसरा — अंकुर: इशारे, नकल, ज़रूरत बताना। चौथा — पत्तियाँ: समझना, नई चीज़ें सीखना। पाँचवाँ — तना: सीखी चीज़ें रोज़ के कामों में, कम मदद से। छठा — शाखाएँ: घर से बाहर, स्कूल, परिवार में। सातवाँ — फूल: पसंद बताना, मदद माँगना, ज़िम्मेदारी। आठवाँ — वृक्ष: अपनी क्षमता के अनुसार आत्मनिर्भरता।”',
          '“दो बातें ज़रूर याद रखिए — ये विकास की दिशाएँ हैं, हर बच्चे को हर phase लेना ज़रूरी नहीं। और हर क्षेत्र की अपनी गति होती है — हो सकता है [Child Name] खाने में आगे हो और बोलने में अभी अंकुर पर। यह सामान्य है।”',
        ].join('\n') },
        { t: 'say', text: 'Parent’s Future Vision — “मैम, एक साल बाद आप [Child Name] को कौन-सा एक काम खुद करते देखना चाहेंगी?”' },
        { t: 'text', id: 'futureVision', label: 'Parent’s Future Vision (Carry Forward → FS-01, FS-03, Final Review)', long: true },
        { t: 'say', text: '“यह आपका सपना है — और हमारी दिशा भी। हम हर review में देखेंगे कि उस ओर अगला कदम क्या है।”' },
        { t: 'note', tone: 'info', text: 'Journey Card (बीज से वृक्ष) — parent को WhatsApp पर भेजें।' },
        { t: 'check', id: 'journeyCardSent', label: 'Journey Card (बीज से वृक्ष) WhatsApp पर भेजा' },
      ],
    },
    {
      title: 'STEP 20 (जारी) — Foundation के बाद का संपर्क + 6 महीने का Schedule (Journey Card)',
      blocks: [
        { t: 'say', text: [
          '“मैम, आज [Child Name] की treatment journey का Foundation Stage पूरा हो रहा है। आगे हमारी टीम अलग-अलग तरीके से आपके संपर्क में रहेगी —',
          '• Family Sessions में बच्चे की developmental priorities, home training और परिवार की ज़रूरतों पर गहराई से काम होगा।',
          '• Medical Follow-ups में medicines, treatment के निर्देश और उनसे जुड़ी परेशानियों की समीक्षा होगी।',
          '• लगभग हर दो महीने में Development Tracker से बच्चे के तय goals की व्यवस्थित समीक्षा होगी।”',
          '“ये छह महीने एक structured शुरुआती care phase हैं। उसके बाद [Child Name] को किस तरह की सहायता चाहिए, यह उसकी ज़रूरत और clinical review के आधार पर तय होगा।”',
        ].join('\n') },
        { t: 'note', tone: 'info', text: 'Contact — Day (Auto Date): तारीखें Treatment Start Date से अपने-आप (बुधवार पड़े तो अगले कार्य-दिवस पर)। यही तालिका parent को ‘Journey Card’ के रूप में WhatsApp पर भेजें।' },
        ...JOURNEY.map(([id, label, code]) => ({ t: 'link', id, label, code, options: LINK })),
        { t: 'date', id: 'finalReviewDate', label: 'Tracker 03 + Final Review — Day 180 (clinic में; CRM session नहीं) — तारीख' },
      ],
    },
    {
      title: 'STEP 21 — संपर्क के नियम',
      blocks: [
        { t: 'say', text: '“बीच में कोई परेशानी आए तो अगले सेशन का इंतज़ार नहीं करना है — हमारी Medical Care Team से helpline 8810627477 पर संपर्क कीजिए। बुधवार को clinic बंद रहता है। कोई emergency हो तो तुरंत नज़दीकी अस्पताल जाइए।”' },
        { t: 'list', id: 'contactTold', label: 'संपर्क नियम बताए', items: ['Helpline', 'बुधवार बंद', 'Emergency नियम', 'Journey Card भेजा'] },
      ],
    },
    {
      title: 'STEP 22 — Foundation Program का समापन',
      blocks: [
        { t: 'say', text: [
          '“मैम, आज [Child Name] का Family Care Foundation Program पूरा हो रहा है। अब आपको पता है कि medicines कैसे देनी हैं, भोजन और routine कैसा रखना है, घर पर कौन-सी activities करनी हैं, और किसी परेशानी में हमारी किस टीम से संपर्क करना है।”',
          '“हमारा अगला मुख्य सेशन Family Session 01 — लगभग Day 15, [Date] को रहेगा। उसमें हम खास तौर पर [Child Name] की developmental priorities और घर पर उसकी learning पर काम करेंगे।”',
          '“आपने इन दिनों जिस धैर्य से हर सेशन में समय दिया, उसके लिए धन्यवाद। हमारी पूरी कोशिश रहेगी कि इस यात्रा में आपको सही समय पर साफ़ मार्गदर्शन मिलता रहे।”',
        ].join('\n') },
        { t: 'link', id: 'fs01Booking', label: 'Family Session 01 Booking — Date / Time (Auto Schedule + Edit)', code: 'FS-01', options: LINK },
        { t: 'text', id: 'fs01Staff', label: 'Staff' },
        { t: 'check', id: 'fs01Confirmed', label: 'Parent ने confirm किया' },
      ],
    },
    {
      title: 'SESSION COMPLETION RULES & FINAL STATUS — MV-FCF-07',
      blocks: [
        B.taskRegister(3),
        { t: 'list', id: 'completionRules', label: 'Session Completion Rules — MV-FCF-07 (सब ✓ = Completed)', items: [
          'Health check + पिछले सेशन से जोड़',
          '‘आप अकेले नहीं’ — सम्मान',
          'उम्र नहीं, आज की क्षमता',
          'पहले रिश्ता — 5 बातें',
          'Parents Guidance Paper 01–10',
          'रिश्तेदारों की बातें + 3 सवाल',
          'Situation teach-back सही',
          'Parent की ‘खास स्थिति’ दर्ज (Carry Forward)',
          'सभी Foundation sessions का status confirm',
          'Daily Care Routine Card Final + भेजा',
          'Medicine / tracker / backup ज़िम्मेदारी तय',
          'कठिनाइयाँ दर्ज + Task',
          '8-दिशा journey + Parent’s Future Vision + Journey Card',
          '6-महीने का schedule समझाया',
          'संपर्क नियम बताए',
          'FS-01 booked',
        ] },
        { t: 'final', id: 'final', label: 'Final Session Status (एक चुनें)', options: [
          'Completed', 'Completed — Task Pending', 'Partially Completed → Reschedule remaining', 'Rescheduled', 'Not Applicable', 'Escalated — Clinical Review',
        ] },
        { t: 'text', id: 'remarks', label: 'Counsellor Remarks', long: true },
      ],
    },
  ],
};
