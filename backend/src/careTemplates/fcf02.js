// MV-FCF-02 • Family Care Foundation Program — Session 02 / 07 (Day 2): Customised Medicine Formulation & Administration Session.
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

const SAFE = 'कुछ नहीं → Continue';
const SAFETY_ISSUE = { id: 'safety', not: [SAFE] };
const CONCERN = ['कोई नहीं', 'देने में कठिनाई', 'बच्चा मना करता है', 'समय उलझन'];

// One medicine of the prescription (Step 04 — the clinic's standard chart M1 … M4).
const medicine = (n, title, say, extra = []) => ({
  title: `STEP 04 · ${title}`,
  blocks: [
    { t: 'auto', id: `m${n}Med`, label: `M${n} — Prescription में (CRM)`, from: `med:M${n}`, hint: 'Prescription Module' },
    { t: 'say', text: say },
    { t: 'check', id: `m${n}Explained`, label: 'Explained ✓' },
    { t: 'many', id: `m${n}Concern`, label: 'Parent Concern', options: CONCERN },
    ...extra,
  ],
});

module.exports = {
  code: 'FCF-02',
  key: 'MV-FCF-02',
  version: 1,
  kind: 'foundation',
  seq: 2,
  day: 2,
  title: 'Customised Medicine Formulation & Administration Session',
  subtitle: 'आपके बच्चे की व्यक्तिगत औषधि — कौन-सी, कब, कितनी और कैसे',
  meta: [
    ['Program', 'Family Care Foundation Program • Session 02 / 07'],
    ['Session Code', 'MV-FCF-02'],
    ['CRM Schedule', 'Foundation Day 2'],
    ['Session Name', 'Customised Medicine Formulation & Administration'],
    ['हिंदी नाम', 'औषधि सेवन — सही तरीका'],
    ['Conducted By', 'Trained Medical Counsellor'],
    ['Mode', 'Call / Video Call / Clinic में'],
    ['Applicability', 'Always (हर patient)'],
    ['Reference Paper', 'औषधि सेवन चार्ट + 180 Days Medicine Tracker (M1–M4)'],
    ['Prerequisite', 'Orientation (FCF-01) Completed'],
    ['Next Session (Auto)', 'MV-FCF-03 · Nutrition & Lifestyle (अगला कार्य-दिवस)'],
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
          { id: 'nameAge', label: 'Patient Name / Age', from: 'patientNameAge', hint: 'Patient Profile' },
          { id: 'patientId', label: 'Patient ID', from: 'patientCode', hint: 'Patient Profile' },
          { id: 'parent', label: 'Parent / Guardian Name', from: 'parentName', hint: 'Patient Profile' },
          { id: 'm1', label: 'Prescription — M1 · सुबह खाली पेट', from: 'med:M1', hint: 'Prescription Module' },
          { id: 'm2', label: 'Prescription — M2 · सुबह + शाम', from: 'med:M2', hint: 'Prescription Module' },
          { id: 'm3', label: 'Prescription — M3 · दोपहर + रात', from: 'med:M3', hint: 'Prescription Module' },
          { id: 'm4', label: 'Prescription — M4 · रात · सोते समय', from: 'med:M4', hint: 'Prescription Module' },
          { id: 'prescription', label: 'Prescription — हर medicine का No., नाम, Slot, मात्रा, अनुपान', from: 'prescription', hint: 'Prescription Module' },
          { id: 'dispatch', label: 'Medicine Dispatch Date + Delivery Status', from: '', hint: 'Pharmacy / Dispatch' },
          { id: 'allergy', label: 'Allergy / Current other medicines (History)', from: '', hint: 'Clinical History' },
          { id: 'special', label: "Doctor's special instruction (यदि कोई)", from: '', hint: 'Prescription Module' },
        ] },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist (सब ✓ होने पर ही Session शुरू करें)', items: [
          'Prescription खोलकर हर medicine की मात्रा और अनुपान देख लिया',
          'Delivery confirmed है (Delivered status)',
          'Allergy / दूसरी दवाओं का history note देख लिया',
          'Medicine Chart (PDF) parent को भेजा गया है',
          'Doctor की कोई special instruction पढ़ ली',
        ] },
      ],
    },
    {
      title: 'STEP 01 — सेशन की शुरुआत',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parent को बताना कि treatment journey structured sessions में चलेगी, और आज का विषय सिर्फ़ औषधि है।' },
        { t: 'say', text: [
          '“नमस्ते मैम/सर, मैं MANOVAIDYA Clinic की Medical Care Team से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
          '“आज आपके बच्चे का Customised Medicine Formulation & Administration Session है। आज हम विशेष रूप से आपके बच्चे की medicines समझेंगे — कौन-सी दवाई कब देनी है, कितनी मात्रा में, किसके साथ, और पूरे दिन इसका ध्यान कैसे रखना है।”',
          '“इसमें लगभग 10–15 मिनट लगेंगे। क्या अभी आप आराम से बात कर सकते हैं?”',
        ].join('\n') },
        { t: 'response', id: 'response', label: 'Parent Availability', options: [
          'Available → Continue', 'Busy → Reschedule (Date/Time)', 'Network समस्या → Reconnect / Reschedule', 'दूसरे Guardian → Authorization verify',
        ] },
        { t: 'one', id: 'safety', label: 'Safety Screen — “दवा शुरू करने से पहले — बच्चे को अभी कोई नई या गंभीर तकलीफ़ है? जैसे तेज़ बुखार, साँस की परेशानी, दौरे या किसी चीज़ से एलर्जी?”', options: [
          SAFE, 'हाँ, सामान्य → नोट + Medical Review Task', 'Emergency संकेत → सेशन रोकें, तुरंत emergency care की सलाह',
        ] },
        { t: 'text', id: 'safetyProblem', label: 'नोट — क्या तकलीफ़ है (जो parent ने बताया)', long: true, show: SAFETY_ISSUE },
        ...B.triage({ show: SAFETY_ISSUE }),
      ],
    },
    {
      title: 'STEP 02 — Medicine Paper और Medicines की जाँच',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'सुनिश्चित करना कि parent के पास सही medicines और chart हैं — गलत या कम medicine पर बात आगे न बढ़े।' },
        { t: 'say', text: '“मैम, सबसे पहले आप वह औषधि सेवन चार्ट सामने रख लीजिए जो medicines के साथ दिया गया है। हो सके तो सभी medicines भी सामने रख लीजिए। हम एक-एक medicine साथ में देखेंगे, ताकि बाद में याद रखने में परेशानी न हो।”' },
        { t: 'one', id: 'medsReceived', label: '“आपको सभी medicines और Medicine Chart मिल गए हैं?”', options: ['सब मिल गया', 'कोई medicine कम / अलग लगी', 'Chart नहीं मिला'] },
        { t: 'one', id: 'labelsClear', label: '“पैकेट पर medicine number (M1, M2…) और नाम साफ़ दिख रहे हैं?”', options: ['हाँ', 'नहीं / मिट गया'] },
        { t: 'one', id: 'otherMeds', label: '“बच्चे को कोई और दवा या supplement चल रहा है, जो हमारे record में नहीं है?”', options: ['नहीं', 'हाँ → नाम लिखें + Clinical Verification Task'] },
        { t: 'text', id: 'otherMedName', label: 'दवा का नाम', show: { id: 'otherMeds', any: ['हाँ → नाम लिखें + Clinical Verification Task'] } },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'Medicine कम / गलत / नाम न दिखे तो आगे की मात्रा न समझाएँ — पहले Medicine Department Verification Task बनाएँ और सेशन ‘Partially Completed’ रखें।' },
      ],
    },
    {
      title: 'STEP 03 — FUTURE VISION — दवा: यात्रा का एक हिस्सा',
      time: '30–60 सेकंड',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parents को याद दिलाना कि दवा जादू नहीं, यात्रा का एक हिस्सा है।' },
        { t: 'note', tone: 'info', label: 'FUTURE VISION POINT — बीज से वृक्ष — मिट्टी और पोषण', text: '30–60 सेकंड' },
        { t: 'say', text: '“मैम, कल हमने बीज से वृक्ष का उदाहरण देखा था। ये औषधियाँ उस पौधे की मिट्टी और पोषण की देखभाल जैसी हैं — ज़रूरी, पर अकेले काफ़ी नहीं। साथ में रोज़ का पानी और धूप — यानी घर का अभ्यास और आपका साथ — भी चाहिए। इसलिए दवा को जादू नहीं, यात्रा का एक हिस्सा मानिए, और उसे नियम से, सही तरीके से दीजिए।”' },
        { t: 'check', id: 'fvSpoken', label: 'बोला गया' },
      ],
    },
    {
      title: 'STEP 04 — हर Medicine — एक-एक करके',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Prescription में जितनी medicines हैं, उतने block। नीचे Manovaidya के मानक चार्ट M1–M4 की स्क्रिप्ट है।' },
        { t: 'note', tone: 'rule', label: 'Note', text: 'हर medicine की row (No., नाम, Slot, मात्रा, अनुपान) Prescription Module से ऊपर Section A में दिख रही है — स्क्रिप्ट में [Dose], [Anupan], [Slot] वहीं से बोलें। हर medicine के नीचे ‘Explained ✓’ और ‘Parent Concern’ अलग भरें। जो slot Prescription में ‘Not Prescribed’ है, उसका block छोड़ दें।' },
      ],
    },
    medicine(1, 'M1 — मेध्य घृत · सुबह · खाली पेट', [
      '“अब आप M1 नंबर वाली medicine देखिए — मेध्य घृत। [Child Name] के लिए डॉक्टर ने इसकी मात्रा [Dose] चम्मच तय की है। इसे सुबह खाली पेट, हल्के गुनगुने पानी के साथ देना है।”',
      '“बच्चे के उठने के समय के हिसाब से इसका एक पक्का समय तय कर लीजिए, ताकि रोज़ याद रहे। बच्चा सुबह सामान्यतः कितने बजे उठता है?”',
    ].join('\n'), [
      { t: 'time', id: 'wakeTime', label: 'बच्चे के उठने का समय (FCF-07 Routine Card में Auto जाएगा)' },
      { t: 'note', tone: 'warn', text: 'अगर बच्चा घृत नहीं ले पाता / निगलने में दिक्कत है → Clinical Clarification Task; काउंसलर अपने से विकल्प न बताए।' },
    ]),
    medicine(2, 'M2 — कस्टम चूर्ण फ़ॉर्मूला · सुबह + शाम', [
      '“अब Medicine No. 2 — यह पीले रंग वाला customised चूर्ण है। पहचान हमेशा नाम और नंबर दोनों देखकर करें। इसे सुबह और शाम देना है, हर बार [Dose], [Anupan] के साथ।”',
      '“एक बात खास याद रखिए — सुबह की खुराक किसी कारण छूट जाए, तो शाम को दोनों एक साथ नहीं देनी है।”',
    ].join('\n')),
    medicine(3, 'M3 — कस्टम चूर्ण फ़ॉर्मूला · दोपहर + रात', [
      '“अब Medicine No. 3 — यह दोपहर और रात में देनी है, हर बार [Dose], [Anupan] के साथ।”',
      '“M2 और M3 देखने में मिलती-जुलती लग सकती हैं, इसलिए इन्हें अलग जगह रखिए या ढक्कन पर समय लिख दीजिए — ताकि घर में जो भी दवा दे, सही दवा पहचाने।”',
    ].join('\n')),
    medicine(4, 'M4 — मेध्य सिरप · रात · सोते समय', [
      '“चौथी medicine मेध्य सिरप है — इसे रात को सोते समय देना है: [Syrup Qty] चम्मच सिरप + [Water Qty] चम्मच उबला हुआ, ठंडा किया पानी। मात्रा हमेशा measuring spoon या cup से नापकर दीजिए।”',
      '“अगर दवा के बाद बच्चा उल्टी कर दे या पूरी न ले पाए, तो खुद से दोबारा पूरी खुराक न दें — हमारी टीम से पूछें।”',
    ].join('\n')),
    {
      title: 'STEP 05 — पूरे दिन का Medicine क्रम',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'सारी medicines को एक दिनचर्या में जोड़ना — ताकि parent को अलग-अलग याद न रखना पड़े।' },
        { t: 'say', text: '“मैम, अब पूरे दिन का क्रम एक बार आसान तरीके से देख लेते हैं। अगर शुरू से ही दवाइयाँ बच्चे की रोज़ की दिनचर्या से जुड़ जाएँ, तो नियमित देना बहुत आसान हो जाता है।”' },
        { t: 'auto', id: 'prescriptionNow', label: 'मात्रा · अनुपान (Prescription — CRM Auto)', from: 'prescription', hint: 'Prescription Module', long: true },
        { t: 'matrix', id: 'medicineTimes', label: 'समय (Slot) · Medicine — Parent का तय समय', columns: [
          { id: 'time', label: 'Parent का तय समय', type: 'text' },
        ], rows: [
          { id: 'm1', label: 'सुबह खाली पेट — M1 मेध्य घृत' },
          { id: 'm2Morning', label: 'सुबह — M2 कस्टम चूर्ण' },
          { id: 'm3Noon', label: 'दोपहर — M3 कस्टम चूर्ण' },
          { id: 'm2Evening', label: 'शाम — M2 कस्टम चूर्ण' },
          { id: 'm3Night', label: 'रात — M3 कस्टम चूर्ण' },
          { id: 'm4', label: 'सोते समय — M4 मेध्य सिरप' },
        ] },
        { t: 'note', tone: 'info', text: '‘Parent का तय समय’ — यही समय FCF-07 के Daily Care Routine Card में अपने-आप जाएगा, वहाँ दोबारा नहीं पूछा जाएगा। जो slot Prescription में नहीं है, उसे खाली छोड़ें।' },
      ],
    },
    {
      title: 'STEP 06 — 180 Days Medicine Tracker',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Tracker का सही उपयोग — यह दवा देने का record है, improvement नापने का नहीं।' },
        { t: 'say', text: [
          '“अब chart का दूसरा पेज देखिए — इसमें 180 दिन का Medicine Tracker है। जब भी बच्चे को कोई medicine दें, उसी समय उसके सामने टिक लगा दीजिए।”',
          '“इससे घर में दो लोग गलती से एक ही दवा दोबारा नहीं देंगे, और जब हमारी टीम आपसे बात करेगी, आपको भी याद रहेगा। यह tracker बच्चे का improvement नापने के लिए नहीं है — यह सिर्फ़ दवा देने का record है।”',
        ].join('\n') },
        { t: 'list', id: 'trackerExplained', label: 'Tracker समझाया?', items: ['Tracker page दिखाया', 'टिक कब लगाना है — समझाया'] },
      ],
    },
    {
      title: 'STEP 07 — ज़रूरी सावधानियाँ',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'सुरक्षा के नियम साफ़ शब्दों में — डर पैदा किए बिना।' },
        { t: 'say', text: [
          '“मैम, medicine के बारे में कुछ बातें हमेशा याद रखिए —',
          '• दवा की मात्रा खुद न बढ़ाएँ, न घटाएँ।',
          '• कोई खुराक छूट जाए तो अगली बार दोगुनी न दें।',
          '• बच्चे की कोई दूसरी चल रही दवा डॉक्टर से पूछे बिना बंद न करें।',
          '• लगातार उल्टी, दस्त, त्वचा पर दाने/खुजली या कोई असामान्य लक्षण दिखे तो हमारी Medical Team को बताइए।',
          '• साँस की तकलीफ़ या गंभीर एलर्जी जैसी स्थिति हो तो तुरंत नज़दीकी अस्पताल जाइए।”',
        ].join('\n') },
        { t: 'list', id: 'precautions', label: 'सावधानियाँ बताईं', items: ['मात्रा न बदलें', 'दोगुनी खुराक नहीं', 'दूसरी दवा बंद न करें', 'Side-effect पर संपर्क', 'Emergency नियम'] },
      ],
    },
    {
      title: 'STEP 08 — Parent Understanding Check (Teach-Back)',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parent से उनके शब्दों में पूरा क्रम सुनना — यह ‘समझ आया?’ पूछने से कहीं ज़्यादा भरोसेमंद है।' },
        { t: 'say', text: '“मैम, मैंने सब समझा दिया है। अब बस यह सुनिश्चित करना चाहूँगी कि मेरी तरफ़ से कोई बात समझाने में रह तो नहीं गई — आप अपने शब्दों में बता दीजिए कि सुबह उठने से रात तक आप [Child Name] को कौन-कौन सी medicine कब देंगी?”' },
        { t: 'text', id: 'teachBackText', label: 'Teach-Back — सुबह से रात तक का medicine क्रम: Parent ने अपने शब्दों में क्या बताया', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back Result', options: ['सही बताया', 'आंशिक — दोबारा समझाया', 'समझ नहीं आया → Repeat Explanation Task'] },
        { t: 'note', tone: 'rule', text: 'काउंसलर उत्तर को prescription से मिलाए; जहाँ गड़बड़ हो, सिर्फ़ उसी medicine को दोबारा समझाए।' },
      ],
    },
    {
      title: 'STEP 09 — समापन और अगला सेशन',
      blocks: [
        { t: 'say', text: [
          '“मैम, आज हमने [Child Name] की customised medicines का पूरा तरीका समझ लिया है।”',
          '“हमारा अगला सेशन Personalised Nutrition & Lifestyle Guidance Session रहेगा। उसमें हम समझेंगे कि [Child Name] के लिए कौन-सा भोजन तय किया गया है, दिनचर्या कैसी रखनी है और घर में कौन-से बदलाव व्यावहारिक रूप से करने हैं।”',
          '“हम एक-एक विषय अलग से लेकर चलते हैं, ताकि आप पर सारी बातें एक साथ याद रखने का दबाव न हो। आज के विषय में आपका कोई और सवाल है?”',
          '“बहुत धन्यवाद। अपना और [Child Name] का ध्यान रखिए।”',
        ].join('\n') },
        { t: 'link', id: 'nextLink', label: 'Next Session — MV-FCF-03 · Date / Time (Auto Schedule + Edit; WhatsApp reminder जाएगा)', code: 'FCF-03', options: ['Scheduled', 'Pending'] },
        { t: 'text', id: 'nextStaff', label: 'Staff' },
        { t: 'check', id: 'nextConfirmed', label: 'Parent ने confirm किया' },
      ],
    },
    {
      title: 'SESSION COMPLETION RULES & FINAL STATUS — MV-FCF-02',
      blocks: [
        B.taskRegister(3),
        { t: 'list', id: 'completionRules', label: 'Session Completion Rules — MV-FCF-02 (सब ✓ = Completed)', items: [
          'Authorized guardian से बात हुई',
          'Medicines और chart verify हुए',
          'हर prescribed medicine समझाई गई (हर block ✓)',
          'Daily medicine क्रम + parent का समय दर्ज',
          '180-day tracker समझाया',
          'सभी सावधानियाँ बताईं',
          'Teach-back सही (या दोबारा समझाकर सही)',
          'Pending issues का Task बना',
          'अगला सेशन (FCF-03) schedule हुआ',
        ] },
        { t: 'final', id: 'final', label: 'Final Session Status (एक चुनें)', options: [
          'Completed', 'Completed — Task Pending', 'Partially Completed → Reschedule remaining', 'Rescheduled', 'Not Applicable', 'Escalated — Clinical Review',
        ] },
        { t: 'text', id: 'remarks', label: 'Counsellor Remarks', long: true },
      ],
    },
  ],
};
