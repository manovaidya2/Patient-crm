// MV-FCF-01 • Family Care Foundation Program — Session 01 / 07 (Day 1): Welcome & Care Journey Orientation Session.
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
const HAS = ['हाँ', 'नहीं'];
const HAS_NA = ['हाँ', 'नहीं', 'N/A'];

module.exports = {
  code: 'FCF-01',
  key: 'MV-FCF-01',
  version: 1,
  kind: 'foundation',
  seq: 1,
  day: 1,
  title: 'Welcome & Care Journey Orientation Session',
  subtitle: 'आपका स्वागत — आगे के सभी सेशन, papers और पूरी यात्रा की पहली तस्वीर',
  meta: [
    ['Program', 'Family Care Foundation Program • Session 01 / 07'],
    ['Session Code', 'MV-FCF-01'],
    ['CRM Schedule', 'Foundation Day 1 (Medicine / papers मिलने वाले दिन या अगले दिन)'],
    ['Session Name', 'Welcome & Care Journey Orientation'],
    ['हिंदी नाम', 'स्वागत एवं उपचार-यात्रा परिचय'],
    ['Conducted By', 'Trained Medical Counsellor'],
    ['Mode', 'Call / Video Call / Clinic में'],
    ['Reference Paper', 'सभी issued papers की सूची (Auto) — कोई paper विस्तार से नहीं समझाया जाता'],
    ['Applicability', 'Always (हर नया patient)'],
    ['Prerequisite', 'Treatment Delivery — medicines + papers Delivered'],
    ['Next Session (Auto)', 'MV-FCF-02 · Customised Medicine (अगला कार्य-दिवस)'],
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
          { id: 'parent', label: 'Parent / Guardian Name', from: 'parentName', hint: 'Patient Profile' },
          { id: 'papers', label: 'Issued papers की सूची — Medicine, Diet, Panchakarma, Sensory, Verbal, Home Activities, Parents Guidance, अन्य', from: 'issuedPapers', hint: 'Treatment Delivery Record' },
          { id: 'sessions', label: 'कौन-से सेशन लागू (Foundation schedule — FCF-01…07)', from: 'foundationStatus', hint: 'Prescription' },
          { id: 'm5', label: 'पंचकर्म — M5 (Nasya)', from: 'med:M5', hint: 'Prescription' },
          { id: 'm6', label: 'पंचकर्म — M6 (तेल / अभ्यंग)', from: 'med:M6', hint: 'Prescription' },
          { id: 'therapy', label: 'Therapy (Sensory / Verbal)', from: '', hint: 'Prescription' },
          { id: 'delivery', label: 'Medicine Delivery Status', from: '', hint: 'Pharmacy / Prescription' },
          { id: 'medStart', label: 'Doctor का ‘दवा कब से शुरू’ निर्देश', from: 'treatmentStart', hint: 'Pharmacy / Prescription' },
          { id: 'allergy', label: 'Allergy / गंभीर स्वास्थ्य note', from: '', hint: 'Clinical History' },
        ] },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist (सब ✓ होने पर ही Session शुरू करें)', items: [
          'Delivery ‘Delivered’ है',
          'Doctor का दवा-शुरुआत निर्देश पढ़ लिया',
          'लागू / N.A. सेशन देख लिए (CRM में schedule बना)',
          'Parent का WhatsApp नंबर verify',
        ] },
        { t: 'note', tone: 'info', label: 'इस सेशन का काम', text: 'परिवार का स्वागत, भरोसा, और आगे क्या-क्या मिलेगा उसकी साफ़ तस्वीर। आज कोई paper विस्तार से नहीं समझाना — हर paper का अपना सेशन है। सेशन छोटा और गर्मजोशी भरा रखें (10–15 मिनट)।' },
      ],
    },
    {
      title: 'STEP 01 — स्वागत और शुरुआत',
      blocks: [
        { t: 'say', text: [
          '“नमस्ते मैम/सर, मैं MANOVAIDYA Clinic की Medical Care Team से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
          '“सबसे पहले — Manovaidya परिवार में आपका स्वागत है। [Child Name] के लिए यह कदम उठाने के लिए धन्यवाद। आज से [Child Name] की care journey शुरू हो रही है, और इस पूरी यात्रा में हमारी टीम आपके साथ रहेगी।”',
          '“आज का सेशन छोटा-सा है — लगभग 10–15 मिनट। आज मैं आपको बस यह बताऊँगी कि आगे के दिनों में आपको क्या-क्या मिलेगा और कैसे। क्या अभी आप आराम से बात कर सकते हैं?”',
        ].join('\n') },
        { t: 'response', id: 'response', label: 'Parent Availability', options: [
          'Available → Continue', 'Busy → Reschedule (Date/Time)', 'Network समस्या → Reconnect / Reschedule', 'दूसरे Guardian → Authorization verify',
        ] },
        { t: 'one', id: 'safety', label: 'Safety Screen — “शुरू करने से पहले — बच्चे को अभी कोई नई या गंभीर तकलीफ़ है? जैसे तेज़ बुखार, साँस की परेशानी, दौरे या किसी चीज़ से एलर्जी?”', options: [
          SAFE, 'हाँ, सामान्य → नोट + Medical Review Task', 'Emergency संकेत → सेशन रोकें, तुरंत emergency care की सलाह',
        ] },
        { t: 'text', id: 'safetyProblem', label: 'नोट — क्या तकलीफ़ है (जो parent ने बताया)', long: true, show: SAFETY_ISSUE },
        ...B.triage({ show: SAFETY_ISSUE }),
      ],
    },
    {
      title: 'STEP 02 — Foundation Program क्यों — एक दिन, एक विषय',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parent को premium, व्यक्तिगत और बिना बोझ वाला अनुभव महसूस हो।' },
        { t: 'say', text: [
          '“मैम, आपको आज दवाइयों के साथ कई papers मिले हैं — दवा, आहार, और बाकी guidance के। अक्सर परिवारों को सब एक साथ मिलने पर उलझन होती है कि क्या पहले करें, क्या बाद में।”',
          '“इसलिए Manovaidya में हम पहले हफ़्ते में Family Care Foundation Program चलाते हैं — इसमें हर paper का अपना अलग सेशन होता है। एक दिन, एक विषय — ताकि आप पर सब एक साथ याद रखने का दबाव न हो, और हर चीज़ [Child Name] के लिए सही तरीके से शुरू हो।”',
        ].join('\n') },
      ],
    },
    {
      title: 'STEP 03 — बीज से वृक्ष — पूरी यात्रा का पहला उदाहरण',
      time: '2–3 मिनट',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parents को पहले दिन से ही पूरी यात्रा की तस्वीर दिखाना, और दवा को जादू नहीं, यात्रा का एक हिस्सा दिखाना।' },
        { t: 'note', tone: 'info', label: 'FUTURE VISION POINT — बीज से वृक्ष का पहला उदाहरण', text: '2–3 मिनट · सिर्फ़ आज पूरा; आगे के सेशन में छोटे points' },
        { t: 'say', text: '“मैम, एक छोटे उदाहरण से [Child Name] की पूरी यात्रा समझाना चाहूँगी। जब हम कोई बीज ज़मीन में लगाते हैं — सबसे पहले क्या होता है?”' },
        { t: 'note', tone: 'rule', text: '(parent को जवाब देने दें)' },
        { t: 'say', text: [
          '“पहले जड़ें, फिर अंकुर, पत्तियाँ, मज़बूत तना, शाखाएँ, फूल — और धीरे-धीरे वृक्ष। बच्चे का विकास भी ऐसा ही है — एक-एक चरण में, और हर क्षेत्र की अपनी गति से।”',
          '“आगे के सेशन में आप जो सीखेंगी — दवा, आहार, पंचकर्म — ये मिट्टी और पोषण की देखभाल जैसे हैं; और थेरेपी, activities और आपका व्यवहार — रोज़ का पानी और धूप। सिर्फ़ मिट्टी से पेड़ नहीं बनता — इसलिए इस बगीचे के माली आप हैं, और हम हर कदम पर मार्गदर्शक।”',
          '“शुरुआती छह महीने की structured care तय है। हर कुछ हफ़्ते हम देखेंगे कि पौधा कहाँ तक पहुँचा, और उसी के अनुसार अगला कदम तय होगा। Foundation के आख़िरी सेशन में आपको पूरा पेड़ — पूरी विकास यात्रा — एक चित्र में दिखाएँगे।”',
        ].join('\n') },
        { t: 'one', id: 'fvReaction', label: 'Parent की प्रतिक्रिया', options: ['उदाहरण से जुड़ाव दिखा', 'सवाल पूछे (नीचे लिखें)', 'अभी सिर्फ़ दवा पर ध्यान — आगे जोड़ेंगे'] },
        { t: 'text', id: 'fvQuestions', label: 'Parent के सवाल', long: true, show: { id: 'fvReaction', any: ['सवाल पूछे (नीचे लिखें)'] } },
      ],
    },
    {
      title: 'STEP 04 — आपके 7 सेशन — क्या, कब, किस paper से',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'हर सेशन का नाम premium रूप में + एक लाइन में क्या मिलेगा। जो सेशन बच्चे पर लागू नहीं, उसका नाम न लें (CRM Auto)।' },
        { t: 'say', text: '“मैम, अब मैं आपको बता देती हूँ कि अगले कुछ दिनों में आपके कौन-कौन से सेशन होंगे —”' },
        { t: 'info', head: ['#', 'सेशन', 'इसमें आपको क्या मिलेगा', 'Paper'], rows: [
          ['01', 'Welcome & Care Journey Orientation (आज)', 'पूरी यात्रा की तस्वीर और आगे के सेशन', '—'],
          ['02', 'Customised Medicine Formulation & Administration', 'हर दवा — कौन-सी, कब, कितनी, किसके साथ; 180-दिन tracker', 'औषधि सेवन चार्ट'],
          ['03', 'Personalised Nutrition & Lifestyle Guidance', 'दिनचर्या, मुख्य आहार, भूख के विकल्प, परहेज़, junk food से धीरे-धीरे छुटकारा', 'आहार एवं दिनचर्या'],
          ['04', 'Ayurvedic Panchakarma Home Care', 'सिर पर तेल, नस्य, शरीर की मालिश — पहले, दौरान, बाद और सेक', 'पंचकर्म मार्गदर्शिका'],
          ['05', 'Sensory Stimulation & Verbal Imitation Therapy', 'स्पर्श-बिंदु थेरेपी और पहली ध्वनियाँ सिखाना', 'Sensory · Verbal papers'],
          ['06', 'Neuro-Development Home Activity Training', 'घर पर खेल और रोज़ के कामों से सीखने के मौके', 'Home Activities'],
          ['07', 'Parent Guidance & Integrated Daily Routine', 'बच्चे को समझना, परिवार का व्यवहार, और सब कुछ एक दिनचर्या में', 'Parents Guidance + Routine Card'],
        ] },
        { t: 'auto', id: 'sessionsApply', label: 'लागू (Auto) — इस बच्चे के Foundation सेशन (CRM schedule)', from: 'foundationStatus', hint: 'CRM Auto', long: true },
        { t: 'say', text: '“हर सेशन में हम उसी paper को आपके साथ खोलकर, एक-एक लाइन समझेंगे। आपको papers पहले से पढ़कर रखने की ज़रूरत नहीं।”' },
      ],
    },
    {
      title: 'STEP 05 — Papers की पहचान — सब मिल गए?',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'सिर्फ़ गिनती और पहचान — कोई paper आज विस्तार से नहीं।' },
        { t: 'say', text: '“मैम, बस एक बार देख लेते हैं कि सारे papers आपके पास हैं — इन्हें एक फ़ोल्डर या लिफ़ाफ़े में अलग रख लीजिए, ताकि हर सेशन में वही paper आसानी से निकल सके।”' },
        { t: 'auto', id: 'papersIssued', label: 'Issued papers (CRM Auto)', from: 'issuedPapers', hint: 'Treatment Delivery Record' },
        { t: 'grid', id: 'papersHeld', label: 'Paper (Issued — Auto) — Parent के पास है?', rows: [
          { id: 'medicine', label: 'औषधि सेवन चार्ट + Medicine Tracker', options: HAS },
          { id: 'diet', label: 'आहार एवं दिनचर्या + Diet Tracker', options: HAS_NA },
          { id: 'panchakarma', label: 'पंचकर्म मार्गदर्शिका + Tracker', options: HAS_NA },
          { id: 'sensory', label: 'Sensory Stimulation + Tracker', options: HAS_NA },
          { id: 'verbal', label: 'Verbal Imitation + Tracker', options: HAS_NA },
          { id: 'homeTherapy', label: 'Home Therapy & Activities', options: HAS_NA },
          { id: 'guidance', label: 'माता-पिता के लिए मार्गदर्शन', options: HAS },
          { id: 'other', label: 'अन्य (Marma / Toilet / Seating आदि)', options: HAS_NA },
        ] },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'कोई paper नहीं मिला → PCC Paper Delivery Task, उसी सेशन से पहले पहुँचे।' },
      ],
    },
    {
      title: 'STEP 06 — सेशन कैसे होंगे',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parent को पता हो कि उससे क्या अपेक्षा है — इससे घबराहट कम होती है।' },
        { t: 'say', text: [
          '“• हर सेशन call या video call पर होगा — लगभग 10–20 मिनट; आख़िरी वाला थोड़ा लंबा।',
          '• रोज़ एक सेशन — बुधवार को clinic बंद रहता है, उस दिन सेशन नहीं।',
          '• सेशन के समय वही paper सामने रखिए, और जो व्यक्ति रोज़ बच्चे को दवा / activity करवाएगा, वह ज़रूर साथ रहे। घर के दूसरे सदस्य भी सुन सकते हैं।',
          '• सेशन के अंत में मैं आपसे पूछूँगी कि आप अपने शब्दों में बताइए — यह कोई test नहीं; बस यह देखने के लिए कि मेरी तरफ़ से कोई बात रह तो नहीं गई।',
          '• किसी दिन समय न हो तो बता दीजिए — हम अगला समय तय कर लेंगे।”',
        ].join('\n') },
        { t: 'list', id: 'howSessions', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          'Call / video, 10–20 मिनट',
          'रोज़ एक, बुधवार नहीं',
          'Paper सामने + मुख्य caregiver साथ',
          'Teach-back — test नहीं',
          'समय बदलना हो तो बताएँ',
        ] },
      ],
    },
    {
      title: 'STEP 07 — आज से कल तक — दवा के बारे में',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Doctor के निर्देश के अनुसार — CRM में ‘दवा कब से शुरू’ Auto।' },
        { t: 'auto', id: 'medStartNow', label: 'दवा कब से शुरू (CRM Auto — Medicine Start Date)', from: 'treatmentStart', hint: 'CRM Auto' },
        { t: 'say', text: [
          '“[अगर doctor ने आज से दवा शुरू करने को कहा है:] मैम, doctor ने दवा आज से शुरू करने को कहा है — chart पर जैसा लिखा है वैसे दीजिए; हर दवा का पूरा तरीका कल के Medicine सेशन में साथ बैठकर समझेंगे।”',
          '“[अगर medicine सेशन के बाद शुरू करनी है:] मैम, दवाइयाँ कल के Medicine सेशन के बाद, पूरा तरीका समझकर शुरू करेंगे।”',
          '“कोई भी संदेह हो तो अंदाज़े से कुछ न करें — हमें पूछ लीजिए।”',
        ].join('\n') },
        { t: 'one', id: 'medStartTold', label: 'Doctor का दवा-शुरुआत निर्देश बताया', options: ['आज से — chart के अनुसार', 'Medicine सेशन के बाद'] },
      ],
    },
    {
      title: 'STEP 08 — Foundation के बाद — एक लाइन में आगे की यात्रा',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'पूरा schedule Session 07 में; आज सिर्फ़ झलक।' },
        { t: 'say', text: '“Foundation के सात सेशन के बाद लगभग Day 15 पर पहला Family Session होगा, फिर हर महीने Medical Follow-up, और लगभग हर दो महीने में Development Tracker से बच्चे की समीक्षा। पूरा schedule हम आख़िरी Foundation सेशन में आपको Journey Card के साथ देंगे।”' },
      ],
    },
    {
      title: 'STEP 09 — संपर्क के नियम',
      blocks: [
        { t: 'say', text: '“बीच में कोई परेशानी हो तो अगले सेशन का इंतज़ार नहीं करना — हमारी Medical Care Team से helpline 8810627477 पर संपर्क कीजिए। बुधवार को clinic बंद रहता है। कोई emergency हो — साँस की तकलीफ़, दौरा, गंभीर एलर्जी — तो तुरंत नज़दीकी अस्पताल।”' },
        { t: 'list', id: 'contactTold', label: 'संपर्क नियम बताए', items: ['Helpline', 'बुधवार बंद', 'Emergency नियम', 'Helpline नंबर WhatsApp पर भेजा'] },
      ],
    },
    {
      title: 'STEP 10 — आपका समय तय करें + सवाल',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'सभी आगे के सेशन का रोज़ का एक तय समय — reminders Auto।' },
        { t: 'time', id: 'sessionTime', label: '“अगले सेशन के लिए रोज़ कौन-सा समय आपके लिए सबसे अच्छा रहेगा?” — समय (FCF-02…07 का Schedule)' },
        { t: 'one', id: 'sessionSlot', label: 'सुबह / दोपहर / शाम', options: ['सुबह', 'दोपहर', 'शाम'] },
        { t: 'one', id: 'familyMembers', label: '“सेशन में मुख्य रूप से कौन रहेगा — जो रोज़ बच्चे की दवा और activities सँभालेगा?” (मुख्य caregiver)', options: ['माँ', 'पिता', 'दादा-दादी / नाना-नानी', 'अन्य'], other: 'अन्य' },
        { t: 'text', id: 'parentQuestions', label: '“आज की बातों के बारे में आपके मन में कोई सवाल?”', long: true },
      ],
    },
    {
      title: 'STEP 11 — समापन और अगला सेशन',
      blocks: [
        { t: 'say', text: [
          '“मैम, आज बस इतना ही — आपको पता है कि अगले कुछ दिनों में हम एक-एक विषय साथ लेकर चलेंगे। आप अकेले नहीं हैं; हर कदम पर हमारी टीम साथ है।”',
          '“हमारा अगला सेशन Customised Medicine Formulation & Administration Session रहेगा। उसमें हम [Child Name] की हर दवा — कौन-सी, कब, कितनी और किसके साथ — औषधि सेवन चार्ट के साथ एक-एक करके समझेंगे। कृपया दवाइयाँ और chart सामने रखिएगा।”',
          '“हम एक-एक विषय अलग से लेकर चलते हैं, ताकि आप पर सारी बातें एक साथ याद रखने का दबाव न हो। आज के विषय में आपका कोई और सवाल है?”',
          '“बहुत धन्यवाद। अपना और [Child Name] का ध्यान रखिए।”',
        ].join('\n') },
        { t: 'link', id: 'nextLink', label: 'Next Session — MV-FCF-02 · Date / Time (Auto Schedule + Edit; WhatsApp reminder जाएगा)', code: 'FCF-02', options: ['Scheduled', 'Pending'] },
        { t: 'text', id: 'nextStaff', label: 'Staff' },
        { t: 'check', id: 'nextConfirmed', label: 'Parent ने confirm किया' },
      ],
    },
    {
      title: 'SESSION COMPLETION RULES & FINAL STATUS — MV-FCF-01',
      blocks: [
        B.taskRegister(3),
        { t: 'list', id: 'completionRules', label: 'Session Completion Rules — MV-FCF-01 (सब ✓ = Completed)', items: [
          'स्वागत + safety screen',
          'Foundation Program — एक दिन, एक विषय',
          'बीज से वृक्ष — पहला उदाहरण',
          '7 सेशन बताए (लागू वाले)',
          'Papers की पहचान',
          'सेशन कैसे होंगे',
          'दवा-शुरुआत निर्देश बताया',
          'आगे की यात्रा — एक लाइन',
          'संपर्क नियम',
          'रोज़ का समय + मुख्य caregiver',
          'अगला सेशन (FCF-02) schedule',
        ] },
        { t: 'final', id: 'final', label: 'Final Session Status (एक चुनें)', options: [
          'Completed', 'Completed — Task Pending', 'Partially Completed → Reschedule remaining', 'Rescheduled', 'Not Applicable', 'Escalated — Clinical Review',
        ] },
        { t: 'text', id: 'remarks', label: 'Counsellor Remarks', long: true },
      ],
    },
  ],
};
