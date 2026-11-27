// MV-FCF-05 • Sensory Stimulation & Verbal Imitation Therapy Session (Day 5): स्पर्श-बिंदु थेरेपी और ध्वनि-अनुकरण — घर पर सही तरीके से, एक-एक कदम.
// Conditional on the therapy papers, which the CRM does not hold: the session is always scheduled and the counsellor
// marks each therapy Prescribed / Not Prescribed right after the response; Part A (Sensory) / Part B (Verbal) show only
// when Prescribed.
const B = require('./blocks');

const PRESCRIBED = ['Prescribed', 'Not Prescribed'];
const SENS = { id: 'sensoryPrescribed', any: ['Prescribed'] };
const VERB = { id: 'verbalPrescribed', any: ['Prescribed'] };
const HEALTH_OK = 'कोई परेशानी नहीं → आगे बढ़ें';
const TOLD = 'Counsellor ने हर बिंदु बताया — ✓ करें';
const on = (show, blocks) => blocks.map((b) => ({ ...b, show }));

module.exports = {
  code: 'FCF-05',
  key: 'MV-FCF-05',
  version: 1,
  kind: 'foundation',
  seq: 5,
  day: 5,
  title: 'Sensory Stimulation & Verbal Imitation Therapy Session',
  subtitle: 'स्पर्श-बिंदु थेरेपी और ध्वनि-अनुकरण — घर पर सही तरीके से, एक-एक कदम',
  meta: [
    ['Program', 'Family Care Foundation Program • Session 05'],
    ['Session Code', 'MV-FCF-05'],
    ['CRM Schedule', 'Foundation Day 5'],
    ['Session Name', 'Sensory Stimulation & Verbal Imitation Therapy'],
    ['हिंदी नाम', 'सेंसरी स्टिमुलेशन एवं वर्बल इमिटेशन थेरेपी'],
    ['Conducted By', 'Trained Medical Counsellor'],
    ['Mode', 'Call / Video Call / Clinic में'],
    ['Reference Paper', 'सेंसरी स्टिमुलेशन थेरेपी (5 स्पर्श-बिंदु + 180-दिन ट्रैकर) · Verbal Imitation Therapy (ॐ / आमीन / आमेन + 180-दिन ट्रैकर)'],
    ['Applicability', 'Conditional — दोनों में से कम से कम एक prescribed हो'],
    ['Prerequisite', 'Panchakarma Session (FCF-04) Completed / N/A'],
    ['Next Session (Auto)', 'अगला Foundation सेशन (Home Activity Training)'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    {
      title: 'सेशन की जानकारी (Auto Fetch + Timer)',
      blocks: [
        { t: 'facts', id: 'callIds', rows: [
          { id: 'sessionRef', label: 'Session ID', from: 'sessionRef', hint: 'Auto' },
          { id: 'patientCode', label: 'Patient ID', from: 'patientCode', hint: 'Auto' },
          { id: 'patient', label: 'Patient Name / Age', from: 'patientNameAge', hint: 'Auto' },
          { id: 'callDate', label: 'Date', from: 'today', hint: 'Auto' },
          { id: 'counsellor', label: 'Counsellor', from: 'counsellor', hint: 'Staff (Auto: logged-in)' },
        ] },
        { t: 'note', tone: 'info', text: 'शुरू / ख़त्म / कुल समय अपने-आप दर्ज होता है: फ़ॉर्म खुलने से "Mark done" तक (Timer)। Call Recording / Call Duration: Auto Fetch (integration हो तो)।' },
        { t: 'one', id: 'mode', label: 'Mode', options: ['Call', 'Video Call', 'Clinic में'] },
        { t: 'text', id: 'speakerName', label: 'बात करने वाले का नाम' },
        { t: 'one', id: 'spokeWith', label: 'संबंध', options: B.SPOKE, other: 'Other' },
        { t: 'one', id: 'authorized', label: 'Authorized Guardian?', options: ['Yes', 'No → Verify'] },
      ],
    },
    {
      title: 'SECTION A — सेशन से पहले (CRM Auto • Read Only)',
      blocks: [
        { t: 'note', tone: 'info', text: 'काउंसलर कॉल से पहले यह स्क्रीन देखे। ये fields parent से दोबारा नहीं पूछे जाते।' },
        { t: 'facts', id: 'prep', label: 'Therapy Prescription', rows: [
          { id: 'sensory', label: 'Sensory: आवृत्ति (दिन में 1 / 2 बार), कुल अवधि, तेल, हर बिंदु की अवधि और ‘करना है’ ✓', from: '', hint: 'Therapy Prescription (Paper 1)' },
          { id: 'verbal', label: 'Verbal: चुना उच्चारण (ॐ / आमीन / आमेन), अभ्यास के लिए चुनी ध्वनि, पहला चरण, शुरुआती स्तर, doctor के विशेष निर्देश', from: '', hint: 'Therapy Prescription (Paper 2)' },
          { id: 'sounds', label: 'बच्चा अभी कौन-सी आवाज़ें / शब्द निकालता है (History)', from: 'clinicalConcerns', hint: 'Clinical History' },
          { id: 'touch', label: 'स्पर्श से परेशानी / त्वचा की समस्या (History, FCF-04 का touch-response)', from: 'ans:FCF-04:touchResponse', hint: 'Clinical History · FCF-04' },
          { id: 'fcf04', label: 'Prerequisite — Panchakarma Session (FCF-04)', from: 'statusDate:FCF-04', hint: 'CRM Auto' },
        ] },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist (सब ✓ होने पर ही Session शुरू करें)', items: [
          'Sensory paper में doctor ने बिंदु, अवधि और तेल भरे हैं',
          'Verbal paper में उच्चारण और पहला चरण ✓ है',
          'FCF-04 में बच्चे का स्पर्श-response देख लिया',
          'Demonstration (clinic / video) की व्यवस्था तय',
        ] },
        { t: 'note', tone: 'info', label: 'दो blocks', text: 'A: Sensory और B: Verbal। Step 01 में हर थेरेपी के लिए Prescribed / Not Prescribed चुनें — जो prescribed नहीं, उसका block छिपा रहेगा। दोनों N/A हों तो सेशन ‘Not Applicable’।' },
      ],
    },
    {
      title: 'STEP 01 — सेशन की शुरुआत + पिछले सेशन से जोड़',
      blocks: [
        { t: 'say', text: [
          '“नमस्ते मैम/सर, मैं MANOVAIDYA Clinic की Medical Care Team से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
          '“आज आपके बच्चे का Sensory Stimulation & Verbal Imitation Therapy Session है। आज हम [Child Name] के लिए तय की गई दो घरेलू थेरेपी सीखेंगे — स्पर्श-बिंदु थेरेपी और ध्वनि-अनुकरण (Verbal Imitation)। दोनों papers सामने रख लीजिए।”',
          '“इसमें लगभग 10–15 मिनट लगेंगे। क्या अभी आप आराम से बात कर सकते हैं?”',
        ].join('\n') },
        { t: 'response', id: 'response', label: 'Parent Availability', options: ['Available → Continue', 'Busy → Reschedule (Date/Time)', 'Network समस्या → Reconnect / Reschedule', 'दूसरे Guardian → Authorization verify'] },
        { t: 'one', id: 'sensoryPrescribed', label: 'A · Sensory Stimulation Therapy (Paper 1 — 5 स्पर्श-बिंदु)', options: PRESCRIBED },
        { t: 'one', id: 'verbalPrescribed', label: 'B · Verbal Imitation Therapy (Paper 2 — ॐ / आमीन / आमेन)', options: PRESCRIBED },
        { t: 'note', tone: 'warn', label: 'दोनों Not Prescribed', text: 'दोनों Not Prescribed हों तो यह सेशन लागू नहीं: session header से सेशन close करें, reason “Not applicable — not prescribed”। CRM अगले foundation सेशन एक दिन पहले कर देगा।' },
        { t: 'one', id: 'healthCheck', label: 'Quick Health Check — “कल से बच्चे को कोई नई परेशानी या दवा से कोई तकलीफ़ तो नहीं हुई?”', options: [HEALTH_OK, 'हल्की परेशानी → नोट + Medical Review Task', 'गंभीर / Emergency संकेत → सेशन रोकें, Triage'] },
        { t: 'text', id: 'healthNote', label: 'नोट — क्या परेशानी है (parent के शब्दों में)', long: true, show: { id: 'healthCheck', not: [HEALTH_OK] } },
        ...B.triage({ show: { id: 'healthCheck', not: [HEALTH_OK] } }),
        { t: 'note', tone: 'info', text: 'यह इकलौता सवाल है जो हर Foundation सेशन में आता है — क्योंकि दवा अभी-अभी शुरू हुई है। विस्तार से history दोबारा न पूछें।' },
        { t: 'say', text: '“कल हमने पंचकर्म में पौधे की देखभाल समझी थी — तेल, नस्य और सेक। आज की दोनों थेरेपी उस देखभाल से आगे का कदम हैं — इनमें आप खुद, अपने हाथों और अपनी आवाज़ से, [Child Name] को महसूस करना और बोलना सिखाएँगी।”' },
      ],
    },
    {
      title: 'STEP 02 — बीज से वृक्ष — ये थेरेपी कहाँ आती हैं • FUTURE VISION POINT — अंकुर निकलने की तैयारी',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: [
          '“मैम, बीज से वृक्ष वाले उदाहरण में — स्पर्श की थेरेपी जड़ों जैसी है: बच्चा शांत होकर अपने शरीर और आपके स्पर्श को महसूस करना सीखता है। और ध्वनि-अनुकरण पहला अंकुर है — पहली आवाज़, फिर दो, फिर पूरा शब्द।”',
          '“आज [Child Name] [Current Ability — जैसे ‘कुछ आवाज़ें निकालता है’]। अभ्यास से अगला कदम हो सकता है — एक ध्वनि की नकल; फिर दो ध्वनियाँ जोड़ना; फिर पूरा शब्द। और आगे यही नकल करने की क्षमता उसे अपनी ज़रूरत के शब्द — ‘पानी’, ‘मम्मी’ — बोलने में मदद करती है। हम हर बार सिर्फ़ अगला एक कदम देखेंगे।”',
        ].join('\n') },
        { t: 'check', id: 'fvSpoken', label: 'बोला गया' },
      ],
    },

    // ---- PART A — Sensory (Paper 1): shown only when sensoryPrescribed = Prescribed ------------------------------
    {
      title: 'PART A — सेंसरी स्टिमुलेशन थेरेपी (5 स्पर्श-बिंदु) • Paper 1 — STEP 03 — Paper की पहचान — आवृत्ति, अवधि, तेल',
      blocks: on(SENS, [
        { t: 'say', text: '“Sensory paper में ऊपर doctor ने लिखा है — दिन में [1 / 2] बार, कुल [__] मिनट, और तेल [Oil]। हर बिंदु के नीचे उसकी अवधि और ‘करना है’ का ✓ है — सिर्फ़ ✓ वाले बिंदु करने हैं।”' },
        { t: 'matrix', id: 'sensoryPoints', label: 'स्पर्श-बिंदु (Paper से — Auto)', columns: [
          { id: 'do', label: 'करना है?', type: 'one', options: ['हाँ', 'नहीं'] },
          { id: 'minutes', label: 'अवधि (मिनट)', type: 'text' },
        ], rows: [
          { id: 'p1', label: '1. भौंहों के बीच' },
          { id: 'p2', label: '2. सिर का ऊपरी केंद्र' },
          { id: 'p3', label: '3. हथेलियों का बीच (दोनों हाथ)' },
          { id: 'p4', label: '4. पैर के अंगूठे का आधार (दोनों पैर)' },
          { id: 'p5', label: '5. छाती का बीच' },
        ] },
      ]),
    },
    {
      title: 'STEP 04 — हाथ कैसे लगाना है — हर बिंदु',
      blocks: on(SENS, [
        { t: 'note', tone: 'warn', label: 'उद्देश्य', text: 'Parent सबसे ज़्यादा गलती यहीं करते हैं — दबाव, जगह और गति।' },
        { t: 'say', text: [
          '“पहले हाथ कैसे लगाना है, वह समझ लीजिए —',
          '• हाथ साफ़ और गर्म हों, नाखून कटे हों।',
          '• तेल की 1–2 बूँद उँगली पर — बहुत ज़्यादा नहीं।',
          '• उँगली के पोर (pad) से, नाखून से नहीं।',
          '• उँगली बिंदु पर रखकर हल्का दबाव दीजिए और घड़ी की सुई की दिशा में (clockwise) धीरे-धीरे घुमाइए — हर बिंदु पर यही तरीका।',
          '• दिशा बीच में न बदलें, उल्टा (anti-clockwise) या इधर-उधर न घुमाएँ।',
          '• हर बिंदु पर उतने ही मिनट घुमाइए जितने doctor ने paper में लिखे हैं — घड़ी या मोबाइल टाइमर लगा लीजिए, अंदाज़े से नहीं।”',
        ].join('\n') },
        { t: 'info', head: ['बिंदु', 'कैसे करें (Paper)', 'ध्यान रखें'], rows: [
          ['1. भौंहों के बीच', 'भौंहों के बीच चिन्हित जगह पर हल्का दबाव देकर clockwise घुमाना', 'तेल आँख में न जाए; बच्चे के चेहरे के पास धीरे आएँ'],
          ['2. सिर का ऊपरी केंद्र', 'बाल अलग करके सिर के ऊपरी बीच वाले स्थान पर हल्का दबाव देकर clockwise घुमाना', 'ज़ोर से रगड़ना नहीं'],
          ['3. हथेलियों का बीच', 'हथेली के मध्य हिस्से पर हल्का दबाव देकर clockwise घुमाना; दोनों हाथों पर', 'ज़्यादातर बच्चे यहीं से सबसे आसानी से शुरुआत करते हैं'],
          ['4. पैर के अंगूठे का आधार', 'बड़े अंगूठे के आधार के पास हल्का दबाव देकर clockwise घुमाना; दोनों पैर', 'गुदगुदी हो तो दबाव थोड़ा स्थिर रखें'],
          ['5. छाती का बीच', 'छाती के मध्य चिन्हित स्थान पर बहुत हल्का दबाव देकर clockwise घुमाना', 'यहाँ दबाव सबसे कम रखें'],
        ] },
        { t: 'list', id: 'handPoints', label: TOLD, items: [
          'हाथ साफ़, गर्म, नाखून कटे',
          'तेल 1–2 बूँद',
          'उँगली के पोर से, नाखून नहीं',
          'हल्का दबाव',
          'हर बिंदु पर clockwise घुमाना — दिशा न बदलें',
          'हर बिंदु की अवधि (मिनट) बताई — टाइमर से',
        ] },
      ]),
    },
    {
      title: 'STEP 05 — बच्चा हाथ नहीं लगाने देता — शुरुआत कैसे करें',
      blocks: on(SENS, [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Paper के 4 कदम: पहले परिचय → छोटे कदम → पसंद का सहारा → धीरे आगे बढ़ें।' },
        { t: 'say', text: [
          '“कई बच्चे शुरू में छूने नहीं देते — यह बिल्कुल सामान्य है। इसलिए क्रम ऐसा रखिए —',
          '1. पहले परिचय: शांत जगह पर बच्चे को पहले अपना हाथ और तेल दिखाइए, सरल शब्दों में बताइए — ‘अब हाथ पर गोल-गोल करेंगे।’',
          '2. छोटे कदम: जो बिंदु सबसे आसान लगे — अक्सर हथेली या पैर — वहीं से कुछ सेकंड शुरू कीजिए; रोज़ थोड़ा समय बढ़ाइए।',
          '3. पसंद का सहारा: पसंदीदा खिलौना या शांत गाना साथ रखें; पहले आसानी से स्वीकार होने वाला बिंदु करें।',
          '4. धीरे आगे बढ़ें: बच्चे की प्रतिक्रिया देखकर बाकी बिंदु जोड़ें — चेहरा और छाती सबसे आख़िर में। असहजता पर रुकिए; ज़बरदस्ती नहीं।”',
        ].join('\n') },
        { t: 'say', text: '“[Child Name] को कौन-सी जगह छूना सबसे आसानी से अच्छा लगता है?”' },
        { t: 'many', id: 'easyTouch', label: 'सबसे आसान जगह (Multi Select)', options: ['हथेली', 'पैर', 'सिर', 'चेहरा', 'छाती', 'कहीं भी नहीं — अभी परिचय से शुरू'] },
      ]),
    },
    {
      title: 'STEP 06 — कब और कितनी बार करें',
      blocks: on(SENS, [
        { t: 'say', text: [
          '“• Doctor ने जितनी बार लिखा है — दिन में [1 / 2] बार — रोज़ एक ही समय पर।',
          '• सबसे अच्छा समय: जब बच्चा शांत हो — भूखा, थका या चिड़चिड़ा न हो; जैसे नहाने के बाद या सोने से पहले।',
          '• Sensory के बाद बच्चा अक्सर शांत होता है — इसलिए उसके तुरंत बाद ध्वनि-अनुकरण का अभ्यास करना अच्छा रहता है।”',
        ].join('\n') },
      ]),
    },
    {
      title: 'STEP 07 — सुरक्षा + Sensory Tracker',
      blocks: on(SENS, [
        { t: 'say', text: [
          '“सुरक्षा: बच्चा रोए, शरीर अकड़ाए, उल्टी करे या साँस में तकलीफ़ हो — तुरंत रोकें। घाव या संक्रमित त्वचा पर न करें।”',
          '“Tracker (paper का दूसरा पेज): हर दिन सुबह और शाम के दो बॉक्स। जिस समय पूरा स्पर्श-अभ्यास किया, उसके सामने ✓। दिन में एक बार ही लिखा हो तो एक ही बॉक्स में ✓। यह पूरे अभ्यास का tracker है — हर बिंदु का अलग नहीं।”',
        ].join('\n') },
        { t: 'list', id: 'sensorySafetyPoints', label: TOLD, items: [
          'रोना / अकड़ना / उल्टी / साँस → तुरंत रोकें',
          'घाव / संक्रमित त्वचा पर नहीं',
          'Tracker: सुबह / शाम ✓',
          'एक बार लिखा हो तो एक ही ✓',
        ] },
      ]),
    },

    // ---- PART B — Verbal (Paper 2): shown only when verbalPrescribed = Prescribed --------------------------------
    {
      title: 'PART B — VERBAL IMITATION THERAPY (ध्वनि-अनुकरण) • Paper 2 — STEP 08 — कौन-सा उच्चारण और उसकी ध्वनियाँ',
      blocks: on(VERB, [
        { t: 'say', text: '“Verbal paper में doctor ने [Child Name] के लिए [ॐ / आमीन / आमेन] ✓ किया है। हम इसे सीधे पूरा नहीं बुलवाएँगे — इसे छोटी-छोटी ध्वनियों में तोड़कर, एक-एक करके सिखाएँगे।”' },
        { t: 'info', head: ['चुना उच्चारण', 'ध्वनि 1', 'ध्वनि 2', 'ध्वनि 3', 'पूरा'], rows: [
          ['ॐ', 'आ/अ', 'ऊ/उ', 'म्', 'ॐ'],
          ['आमीन', 'आ', 'मी', 'न', 'आमीन'],
          ['आमेन', 'आ', 'मे', 'न', 'आमेन'],
        ] },
        { t: 'text', id: 'practiceSound', label: 'अभ्यास के लिए चुनी ध्वनि (paper से)' },
        { t: 'text', id: 'firstStage', label: 'पहला चरण' },
      ]),
    },
    {
      title: 'STEP 09 — मुख्य नियम — एक ध्वनि पक्की, तभी अगली',
      blocks: on(VERB, [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'यह सबसे ज़रूरी नियम है — यहीं सबसे ज़्यादा गलती होती है।' },
        { t: 'note', tone: 'danger', label: 'मुख्य नियम', text: 'जब तक बच्चा एक ध्वनि साफ़ और आराम से न बोलने लगे, तब तक एक ही ध्वनि सिखानी है। जल्दी करके अगली ध्वनि या पूरा शब्द नहीं बुलवाना।' },
        { t: 'say', text: [
          '“मैम, सीढ़ी ऐसे चढ़नी है — उदाहरण ॐ का —',
          'चरण 1 — एक ध्वनि: सिर्फ़ ‘आ’। जब तक ‘आ’ साफ़ न आए, बस ‘आ’।',
          '‘आ’ पक्का हो जाए तो अगली अकेली ध्वनि — ‘ऊ’; फिर ‘म्’ (होंठ बंद करके ‘म्म्म’)।',
          'चरण 2 — दो ध्वनियाँ जोड़ना: जब तीनों अलग-अलग आने लगें — ‘आ-ऊ’, फिर ‘ऊ-म्’।',
          'चरण 3 — तीन ध्वनियाँ: ‘आ-ऊ-म्’ — धीरे-धीरे।',
          'चरण 4 — पूरा उच्चारण: ‘ॐ’ — जब पिछला चरण सहज हो जाए।”',
          '“आमीन / आमेन में भी यही — ‘आ’ → ‘मी / मे’ → ‘न’ → ‘आ-मी’ → ‘आ-मी-न’ → ‘आमीन’।”',
        ].join('\n') },
        { t: 'info', head: ['चरण', 'Tracker कॉलम', 'अगले चरण पर कब जाएँ'], rows: [
          ['1 ध्वनि', '1 श.', 'जब बच्चा उसे लगातार कई दिन, ज़्यादातर बार सही और बिना दबाव बोले'],
          ['2 ध्वनियाँ', '2 श.', 'जब दोनों जुड़कर सहज आएँ'],
          ['3 ध्वनियाँ', '3 श.', 'जब तीनों जुड़कर सहज आएँ'],
          ['पूरा उच्चारण', 'पूरा', '—'],
        ] },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: '‘लगातार सही’ का फ़ैसला parent अपने से जल्दी न करें — अगले चरण पर जाने से पहले FU / therapist से एक बार पुष्टि लें।' },
      ]),
    },
    {
      title: 'STEP 10 — रोज़ कैसे कराएँ — 8 नियम',
      blocks: on(VERB, [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Paper के ‘रोज़ कैसे कराएँ’ और ‘आसान निर्देश’ से।' },
        { t: 'info', head: ['#', 'नियम', 'काउंसलर ऐसे समझाए'], rows: [
          ['1', 'पहले सुनवाएँ', '“शुरू में सिर्फ़ सुनवाइए — शांत जगह, और एक ही व्यक्ति बार-बार अभ्यास कराए।”'],
          ['2', 'एक-एक करके बढ़ें', '“पहले 1, फिर 2, फिर 3 ध्वनि। पिछला चरण साफ़ न हो तो अगला नहीं।”'],
          ['3', 'दबाव न दें', '“बच्चा न बोले तो ज़बरदस्ती नहीं — थोड़ा रुककर फिर धीरे से।”'],
          ['4', 'रोज़ एक ही समय', '“हर दिन वही समय — सुबह, दोपहर, शाम। नियमित दोहराव से बच्चा जल्दी सीखता है।”'],
          ['5', 'छोटा मॉडल दें', '“आप छोटा, साफ़ और थोड़ा खींचकर बोलें — ‘आ…’ — बच्चे से उतना ही दोहरवाएँ जितना वह सहज कर सके।”'],
          ['6', 'सफलता पहचानें', '“लगातार सही बोलने लगे, तभी अगला चरण।”'],
          ['7', 'तुरंत प्रशंसा', '“सही आवाज़ आते ही उसी पल मुस्कुराकर — ‘वाह! आ!’ — ताली या गले लगाना।”'],
          ['8', 'छोटा और शांत अभ्यास', '“हर बार 5–10 मिनट; लंबा नहीं। मूड ठीक न हो, थका या चिड़चिड़ा हो तो अभ्यास और छोटा कर दें।”'],
        ] },
        { t: 'note', tone: 'rule', label: 'कितनी बार', text: 'दिन में 3 बार — सुबह, दोपहर, शाम; हर बार 5–10 मिनट। शुरू में 5 मिनट से शुरू करें। (Paper के tracker में ‘3–4 बार’ कॉलम है — उस दिन 3 या ज़्यादा बार हुआ तो ✓।)' },
      ]),
    },
    {
      title: 'STEP 11 — एक अभ्यास ऐसे दिखता है — उदाहरण',
      blocks: on(VERB, [
        { t: 'say', text: [
          '“देखिए, एक बार का अभ्यास ऐसे होगा —',
          '1. [Child Name] के सामने बैठिए, आँखों के स्तर पर; मोबाइल / TV बंद।',
          '2. उसका नाम लेकर मुस्कुराइए। धीरे, साफ़, थोड़ा खींचकर बोलिए — ‘आ…’',
          '3. 3–5 सेकंड रुकिए — बच्चे को सोचने और बोलने का समय दीजिए।',
          '4. बच्चा ‘आ’ जैसी कोई भी आवाज़ निकाले — तुरंत: ‘वाह! आ!’ — ताली, मुस्कान।',
          '5. न बोले — कोई बात नहीं; मुस्कुराकर एक बार फिर ‘आ…’। 3 बार में न आए तो थोड़ा खेल / ब्रेक, फिर बाद में।',
          '6. हर बार एक अच्छे पल पर ख़त्म कीजिए — भले वह सिर्फ़ आपकी ओर देखना हो।”',
        ].join('\n') },
        { t: 'one', id: 'parentDemo', label: 'Parent ने counsellor के साथ एक बार करके दिखाया?', options: ['हाँ — सही', 'आंशिक — सुधारा', 'Video / clinic demonstration चाहिए → Task'] },
      ]),
    },

    // ---- Both therapies --------------------------------------------------------------------------------------------
    {
      title: 'STEP 12 — Parents की आम गलतियाँ — क्या नहीं करना है',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'दोनों थेरेपी की — counsellor हर बिंदु पढ़े।' },
        { t: 'info', head: ['आम गलती', 'सही तरीका'], rows: [
          ['ज़ोर से दबाना या तेज़ रगड़ना', 'हल्का दबाव, धीरे-धीरे clockwise'],
          ['उल्टा (anti-clockwise) या इधर-उधर घुमाना', 'हर बिंदु पर हमेशा clockwise'],
          ['अंदाज़े से कम-ज़्यादा समय करना', 'हर बिंदु पर doctor के लिखे मिनट — टाइमर लगाकर'],
          ['बच्चे को पकड़कर ज़बरदस्ती स्पर्श करना', 'पहले परिचय, आसान बिंदु (हथेली / पैर) से, कुछ सेकंड से'],
          ['गलत जगह या बहुत ज़्यादा तेल', 'Paper के चित्र की जगह; 1–2 बूँद'],
          ['रोज़ अलग समय, कुछ दिन छोड़ देना', 'रोज़ एक ही समय — नियमितता ही सबसे बड़ा असर'],
          ['एक साथ पूरा शब्द ‘ॐ’ / ‘आमीन’ बुलवाना', 'पहले एक ध्वनि ‘आ’ — वही पक्की होने तक'],
          ['एक ध्वनि आते ही तुरंत अगली पर कूदना', 'कई दिन लगातार सही आए, तब अगली'],
          ['‘बोलो! बोलो!’ बार-बार, ऊँची आवाज़ में', 'एक बार साफ़ मॉडल, 3–5 सेकंड इंतज़ार, मुस्कान'],
          ['बच्चे की गलत आवाज़ पर ‘नहीं, गलत’ कहना', 'जो भी कोशिश आए उसकी तारीफ़, फिर सही मॉडल दोबारा'],
          ['घर के कई लोग अलग-अलग तरीके से सिखाना', 'एक ही व्यक्ति, एक ही तरीका (शुरू में)'],
          ['लंबा अभ्यास, बच्चा थका / भूखा / रोता हुआ', '5–10 मिनट, शांत मूड में; रोए तो रोकें'],
          ['मोबाइल / TV चलते हुए अभ्यास', 'शांत जगह, आँखों के स्तर पर आमने-सामने'],
          ['Tracker बाद में अंदाज़े से भरना', 'अभ्यास के तुरंत बाद, जो स्तर हुआ उसी पर ✓'],
        ] },
        { t: 'list', id: 'mistakesRead', label: '✓ करें', items: ['गलतियों की सूची parent के साथ पढ़ी', 'WhatsApp पर भेजी'] },
      ],
    },
    {
      title: 'STEP 13 — Parents के आम सवाल',
      blocks: [
        { t: 'info', head: ['सवाल', 'जवाब'], rows: [
          ['बच्चा कोई आवाज़ ही नहीं निकालता — तो?', '“शुरू में सिर्फ़ सुनवाइए और मुस्कुराइए। आपकी ओर देखना, होंठ हिलाना भी शुरुआत है। कुछ हफ़्तों में भी कोई आवाज़ न आए तो FU में बताइए — doctor / therapist देखेंगे।”'],
          ['कितने दिन में बोलने लगेगा?', '“हर बच्चे की गति अलग है — हम कोई तय दिन नहीं बता सकते। हम हर चरण पक्का होने पर अगला कदम जोड़ेंगे।”'],
          ['रोज़ वही ‘आ’ — बच्चा बोर तो नहीं होगा?', '“ध्वनि वही, खेल बदल सकते हैं — गाने में, खिलौने के साथ, शीशे के सामने।”'],
          ['क्या साथ में दूसरे शब्द भी सिखाएँ?', '“अभ्यास के समय सिर्फ़ चुनी ध्वनि। बाकी दिन में सामान्य बातचीत करते रहिए — उस पर दबाव नहीं।”'],
          ['एक दिन छूट गया तो?', '“अगले दिन सामान्य मात्रा से ही फिर शुरू कीजिए — छूटा हुआ ‘पूरा’ करने के लिए लंबा अभ्यास नहीं।”'],
          ['Sensory में बच्चा छूने ही नहीं देता', '“हथेली या पैर से, कुछ सेकंड से, पसंद के खिलौने के साथ। कुछ दिन सिर्फ़ परिचय भी ठीक है।”'],
          ['तेल कौन-सा / कितना?', '“जो paper में doctor ने लिखा है — 1–2 बूँद। अपने से तेल न बदलें।”'],
        ] },
      ],
    },
    {
      title: 'STEP 14 — Verbal Tracker — Paper का दूसरा पेज',
      blocks: on(VERB, [
        { t: 'say', text: [
          '“Tracker में हर दिन के आगे पाँच कॉलम हैं — 1 श., 2 श., 3 श., पूरा और 3–4 बार। उस दिन बच्चा जिस स्तर तक बोला, उसके सामने ✓। उस दिन 3 या ज़्यादा बार अभ्यास हुआ तो आख़िरी कॉलम में भी ✓। एक स्तर सही हुए बिना अगले स्तर पर ✓ नहीं।”',
          '“ऊपर नाम, ID, शुरुआत की तारीख और चुना शब्द लिख लीजिए।”',
        ].join('\n') },
        { t: 'list', id: 'verbalTrackerPoints', label: TOLD, items: [
          '5 कॉलम समझाए',
          'जिस स्तर तक बोला — वहीं ✓',
          '3+ बार हुआ → आख़िरी कॉलम ✓',
          'चुना शब्द और तारीख भरवाई',
        ] },
      ]),
    },
    {
      title: 'STEP 15 — दिन का क्रम + Demonstration + Teach-Back',
      blocks: [
        { t: 'info', head: ['समय', 'क्या करें'], rows: [
          ['सुबह', 'Sensory (यदि सुबह लिखा) → उसके बाद 5–10 मिनट ध्वनि-अनुकरण'],
          ['दोपहर', '5–10 मिनट ध्वनि-अनुकरण'],
          ['शाम', 'Sensory (यदि दो बार लिखा) → 5–10 मिनट ध्वनि-अनुकरण'],
        ] },
        { t: 'text', id: 'therapyTime', label: 'इस बच्चे के लिए तय समय — Sensory / ध्वनि-अनुकरण कब', long: true, hint: 'जैसे: Sensory — सुबह नहाने के बाद; ध्वनि-अनुकरण — सुबह, दोपहर, शाम 5–10 मिनट' },
        { t: 'one', id: 'demoStatus', label: 'Demonstration Status', options: ['Clinic में दिखाई', 'Video Call पर — parent ने करके दिखाया', 'Pending → Therapist Demonstration Task'] },
        { t: 'say', text: '“आप बताइए — स्पर्श किस तरह और किस बिंदु से शुरू करेंगी, और ध्वनि-अनुकरण में पहली ध्वनि कौन-सी होगी और अगली पर कब जाएँगी?”' },
        { t: 'text', id: 'teachBackWords', label: 'Parent ने अपने शब्दों में क्या बताया', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back', options: ['सही बताया', 'आंशिक — दोबारा समझाया', 'समझ नहीं आया → Repeat Explanation Task'] },
      ],
    },
    {
      title: 'STEP 16 — समापन और अगला सेशन',
      blocks: [
        { t: 'say', text: [
          '“मैम, आज आपने [Child Name] के लिए दो बहुत खास काम सीखे — अपने स्पर्श से उसे शांत करना और अपनी आवाज़ से उसे पहली ध्वनियाँ सिखाना। पहली ‘आ’ जिस दिन आएगी, वह इस पौधे का पहला अंकुर होगा — हमें ज़रूर बताइएगा।”',
          '“हमारा अगला सेशन Neuro-Development Home Activity Training Session रहेगा। उसमें हम समझेंगे कि घर के सामान्य माहौल में, खेल और रोज़ के कामों के ज़रिए [Child Name] को सीखने के और मौके कैसे देने हैं।”',
          '“हम एक-एक विषय अलग से लेकर चलते हैं, ताकि आप पर सारी बातें एक साथ याद रखने का दबाव न हो। आज के विषय में आपका कोई और सवाल है?”',
          '“बहुत धन्यवाद। अपना और [Child Name] का ध्यान रखिए।”',
        ].join('\n') },
        { t: 'link', id: 'nextSession', label: 'Next Session Date / Time (Auto Schedule + Edit)', code: 'FCF-06', options: ['Scheduled', 'Pending'] },
        { t: 'text', id: 'nextStaff', label: 'Next Session — Staff' },
        { t: 'check', id: 'nextConfirmed', label: 'Parent ने confirm किया (WhatsApp reminder जाएगा)' },
      ],
    },
    {
      title: 'Session Completion Rules & Final Status',
      blocks: [
        { t: 'list', id: 'completionRules', label: 'Session Completion Rules — MV-FCF-05 (सब ✓ = Completed)', items: [
          'Health check + पिछले सेशन से जोड़',
          'बीज से वृक्ष — जड़ें और पहला अंकुर',
          'आम गलतियाँ + आम सवाल',
          'Demonstration Done / Task',
          'Teach-back सही',
          'अगला सेशन schedule',
        ] },
        { t: 'list', id: 'completionSensory', label: 'A · Sensory (prescribed)', items: [
          'Sensory: बिंदु, अवधि, तेल (Auto)',
          'हाथ कैसे लगाना — हल्का दबाव, clockwise, तय मिनट',
          'बच्चा छूने न दे — 4 कदम',
          'Sensory: सुरक्षा + tracker',
        ], show: SENS },
        { t: 'list', id: 'completionVerbal', label: 'B · Verbal (prescribed)', items: [
          'Verbal: उच्चारण की ध्वनियाँ',
          'मुख्य नियम — एक ध्वनि पक्की तभी अगली',
          '8 नियम + दिन में 3 बार, 5–10 मिनट',
          'उदाहरण अभ्यास — parent ने करके दिखाया',
          'Verbal tracker',
        ], show: VERB },
        { t: 'final', id: 'final', label: 'Final Session Status', options: ['Completed', 'Completed — Task Pending', 'Partially Completed → Reschedule remaining', 'Rescheduled', 'Not Applicable', 'Escalated — Clinical Review'] },
        { t: 'text', id: 'remarks', label: 'Counsellor Remarks', long: true },
        B.taskRegister(3),
      ],
    },
  ],
};
