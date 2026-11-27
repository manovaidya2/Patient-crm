// MV-FCF-04 • Ayurvedic Panchakarma Home Care Session (Day 4): शिरो अभ्यंग (M5) · नस्य (M6) · शरीर अभ्यंग (AB) — सही विधि और पूरी सुरक्षा के साथ.
// Conditional: the CRM schedules it only when the formulation has a Nasya / oil / अभ्यंग line.
// Paper codes vs CRM slots: Paper M5 = शिरो अभ्यंग (CRM M6 oil line), Paper M6 = नस्य (CRM M5 Nasya line),
// Paper AB = शरीर अभ्यंग (CRM M6 oil / अभ्यंग line). Each procedure has its own Prescribed / Not Prescribed choice
// (Section A); its blocks show only when Prescribed.
const B = require('./blocks');

const PRESCRIBED = ['Prescribed', 'Not Prescribed (लागू नहीं)'];
const SHIRO = { id: 'shiroPrescribed', any: ['Prescribed'] };
const NASYA = { id: 'nasyaPrescribed', any: ['Prescribed'] };
const ABHY = { id: 'abhyangPrescribed', any: ['Prescribed'] };
const HEALTH_OK = 'कोई परेशानी नहीं → आगे बढ़ें';
const NASYA_PROBLEM = ['बुखार', 'जुकाम / नाक बंद', 'साँस की परेशानी'];
const TOLD = 'Counsellor ने हर बिंदु बताया — ✓ करें';
const on = (show, blocks) => blocks.map((b) => ({ ...b, show }));

module.exports = {
  code: 'FCF-04',
  key: 'MV-FCF-04',
  version: 1,
  kind: 'foundation',
  seq: 4,
  day: 4,
  title: 'Ayurvedic Panchakarma Home Care Session',
  subtitle: 'शिरो अभ्यंग (M5) · नस्य (M6) · शरीर अभ्यंग (AB) — एक ही सेशन में, सही विधि और पूरी सुरक्षा के साथ',
  meta: [
    ['Program', 'Family Care Foundation Program • Session 04 / 07'],
    ['Session Code', 'MV-FCF-04'],
    ['CRM Schedule', 'Foundation Day 4'],
    ['Session Name', 'Ayurvedic Panchakarma Home Care'],
    ['हिंदी नाम', 'पंचकर्म: घर पर तेल प्रयोग एवं नस्य मार्गदर्शन'],
    ['Conducted By', 'Trained Medical Counsellor'],
    ['Mode', 'Call / Video Call / Clinic में'],
    ['Reference Paper', 'पंचकर्म: घर पर तेल प्रयोग एवं नस्य मार्गदर्शिका (M5, M6, AB) + 6 महीने का पंचकर्म ट्रैकर'],
    ['Applicability', 'Conditional — M5, M6, AB में से कम से कम एक prescribed हो। कोई नहीं → Auto ‘Not Applicable’'],
    ['Prerequisite', 'Diet Session (FCF-03) Completed / Partially'],
    ['Next Session (Auto)', 'MV-FCF-05 · Home Activity Training'],
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
        { t: 'note', tone: 'warn', label: 'Paper कोड और CRM कोड अलग हैं', text: 'Paper / इस सेशन में: M5 = मेध्य ऑयल (शिरो अभ्यंग — सिर पर), M6 = बुद्धिवर्धक तेल / घृत (नस्य — नाक में), AB = अभ्यंग (शरीर पर तेल)।\nCRM prescription में: M5 = Nasya line, M6 = तेल / अभ्यंग lines (सिर और शरीर दोनों)। शीशी पर लिखा नाम और नंबर हमेशा paper के अनुसार देखें।' },
        { t: 'facts', id: 'prep', label: 'Panchakarma Prescription', rows: [
          { id: 'nasya', label: 'CRM M5 · Nasya line = Paper M6 · बुद्धिवर्धक तेल / घृत (नस्य) — चुनी औषधि, प्रति नथुना मात्रा, तरीका (बूँद डालना / अंदर लगाना), समय, आवृत्ति / अवधि', from: 'med:M5', hint: 'Panchakarma Prescription' },
          { id: 'oil', label: 'CRM M6 · तेल / अभ्यंग lines = Paper M5 · मेध्य ऑयल (शिरो अभ्यंग) और AB · अभ्यंग (शरीर) — चुना तेल, लगाने का स्थान, मात्रा, समय (सुबह / शाम / दोनों), आवृत्ति / अवधि; AB: Clinic से दिया या बाहर से लेने की सलाह', from: 'med:M6', hint: 'Panchakarma Prescription' },
          { id: 'rxAll', label: 'पूरा Prescription (समय / मात्रा के साथ)', from: 'prescription', hint: 'Medicine Record' },
          { id: 'history', label: 'त्वचा की समस्या / एलर्जी · साँस / बार-बार जुकाम · स्पर्श से परेशानी (History)', from: 'clinicalConcerns', hint: 'Clinical History' },
          { id: 'fcf03', label: 'Prerequisite — Diet Session (FCF-03)', from: 'statusDate:FCF-03', hint: 'CRM Auto' },
        ] },
        { t: 'one', id: 'shiroPrescribed', label: 'M5 · मेध्य ऑयल — शिरो अभ्यंग (सिर पर तेल) [CRM: M6 तेल line]', options: PRESCRIBED },
        { t: 'one', id: 'nasyaPrescribed', label: 'M6 · बुद्धिवर्धक तेल / घृत — नस्य (नाक में) [CRM: M5 Nasya line]', options: PRESCRIBED },
        { t: 'one', id: 'abhyangPrescribed', label: 'AB · अभ्यंग — शरीर पर तेल मालिश [CRM: M6 अभ्यंग line]', options: PRESCRIBED },
        { t: 'one', id: 'nasyaSuitability', label: 'Doctor ने बच्चे के लिए नस्य की suitability verify की? (Clinical Record)', options: ['Yes', 'No → Clinical Clarification — नस्य Hold'], show: NASYA },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist (सब ✓ होने पर ही Session शुरू करें)', items: [
          'M5 / M6 / AB में से क्या-क्या prescribed है — देख लिया',
          'Prescription की सभी मात्राएँ भरी हैं (नहीं तो → Clarification)',
          'नस्य के लिए doctor suitability ✓ है',
          'त्वचा, साँस और sensory history पढ़ ली',
          'Demonstration की व्यवस्था (clinic / video) तय',
        ] },
        { t: 'note', tone: 'info', label: 'तीन अलग blocks', text: 'M5, M6, AB तीन अलग blocks हैं — जो prescribed नहीं (ऊपर “Not Prescribed (लागू नहीं)”), उसका block छिपा रहेगा और उसका demonstration / tracker लागू नहीं।\nतीनों Not Prescribed हों तो पूरा सेशन ‘Not Applicable’: session header से सेशन close करें, reason “Not applicable — not prescribed”; CRM अगले foundation सेशन एक दिन पहले कर देगा।' },
        { t: 'note', tone: 'danger', label: 'नस्य Safety Gate', text: 'नस्य घर पर तभी शुरू होगा जब (1) doctor ने बच्चे के लिए suitability verify की हो और (2) caregiver की demonstration हो चुकी हो (clinic में, या video पर parent ने करके दिखाया)। सिर्फ़ फ़ोन पर बोलकर बताना पर्याप्त नहीं। CRM में ‘Nasya Home Start Allowed’ तभी ✓ (Yes) होगा।' },
      ],
    },
    {
      title: 'STEP 01 — सेशन की शुरुआत + Quick Health Check',
      blocks: [
        { t: 'say', text: [
          '“नमस्ते मैम/सर, मैं MANOVAIDYA Clinic की Medical Care Team से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
          '“आज आपके बच्चे का Ayurvedic Panchakarma Home Care Session है। आज हम [Child Name] के लिए तय की गई पंचकर्म की घरेलू प्रक्रियाएँ समझेंगे — सिर पर तेल (शिरो अभ्यंग), नाक में औषधि (नस्य) और शरीर पर तेल मालिश (अभ्यंग)। आप पंचकर्म वाला paper और तीनों शीशियाँ सामने रख लीजिए।”',
          '“इसमें लगभग 10–15 मिनट लगेंगे। क्या अभी आप आराम से बात कर सकते हैं?”',
        ].join('\n') },
        { t: 'response', id: 'response', label: 'Parent Availability', options: ['Available → Continue', 'Busy → Reschedule (Date/Time)', 'Network समस्या → Reconnect / Reschedule', 'दूसरे Guardian → Authorization verify'] },
        { t: 'one', id: 'healthCheck', label: 'Quick Health Check — “कल से बच्चे को कोई नई परेशानी या दवा से कोई तकलीफ़ तो नहीं हुई?”', options: [HEALTH_OK, 'हल्की परेशानी → नोट + Medical Review Task', 'गंभीर / Emergency संकेत → सेशन रोकें, Triage'] },
        { t: 'text', id: 'healthNote', label: 'नोट — क्या परेशानी है (parent के शब्दों में)', long: true, show: { id: 'healthCheck', not: [HEALTH_OK] } },
        ...B.triage({ show: { id: 'healthCheck', not: [HEALTH_OK] } }),
        { t: 'note', tone: 'info', text: 'यह इकलौता सवाल है जो हर Foundation सेशन में आता है — क्योंकि दवा अभी-अभी शुरू हुई है। विस्तार से history दोबारा न पूछें।' },
      ],
    },
    {
      title: 'STEP 02 — पंचकर्म क्या है — और बीज से वृक्ष में इसकी जगह',
      blocks: [
        { t: 'say', text: [
          '“मैम, पंचकर्म आयुर्वेद की देखभाल की विधियाँ हैं। [Child Name] के लिए doctor ने घर पर करने वाली तीन प्रक्रियाएँ चुनी हैं —',
          '• M5 · मेध्य ऑयल — सिर पर लगाना (शिरो अभ्यंग)',
          '• M6 · बुद्धिवर्धक तेल / घृत — नाक में (नस्य)',
          '• AB · अभ्यंग — शरीर पर तेल मालिश”',
        ].join('\n') },
        { t: 'note', tone: 'rule', text: 'जो prescribed नहीं, उसका नाम न लें — CRM में वह block छिपा रहेगा (Section A में Not Prescribed)।' },
      ],
    },
    {
      title: 'FUTURE VISION POINT — बीज से वृक्ष — पौधे की देखभाल',
      time: '30–60 सेकंड',
      blocks: [
        { t: 'say', text: [
          '“मैम, Day 1 वाला बीज से वृक्ष का उदाहरण याद कीजिए। दवा और आहार उस पौधे की मिट्टी और पोषण थे। पंचकर्म की ये प्रक्रियाएँ पौधे की देखभाल जैसी हैं — जैसे माली पौधे को सँभालकर, सही समय पर, सही मात्रा में पानी देता है।”',
          '“ये प्रक्रियाएँ अपने-आप कोई skill नहीं सिखातीं — पर बच्चे को सहज और शांत रखने में सहायक मानी जाती हैं, और शांत बच्चा सीखने के अवसरों से बेहतर जुड़ पाता है। इसलिए इन्हें नियम से, सही विधि से और बच्चे की सहजता के साथ करना है।”',
        ].join('\n') },
        { t: 'check', id: 'fvSpoken', label: 'बोला गया' },
      ],
    },
    {
      title: 'STEP 03 — Paper और शीशियों की पहचान',
      blocks: [
        { t: 'say', text: '“अब paper का पहला कॉलम देखिए — उसमें तीन box हैं: M5, M6 और AB। हर box में doctor ने तेल का नाम, लगाने का स्थान, मात्रा और समय लिखा है। अब शीशियाँ देखिए — हर शीशी पर M5, M6 या AB लिखा होगा। हमेशा नाम और नंबर दोनों देखकर ही इस्तेमाल करना है, क्योंकि तेल देखने में एक जैसे लग सकते हैं।”' },
        { t: 'note', tone: 'info', text: 'शीशी — Prescribed? (Section A से) — Parent के पास है? सिर्फ़ prescribed शीशियों का सवाल नीचे दिखेगा।' },
        { t: 'one', id: 'shiroHas', label: 'M5 · मेध्य ऑयल — Parent के पास है?', options: ['हाँ', 'नहीं → PCC Task'], show: SHIRO },
        { t: 'one', id: 'nasyaHas', label: 'M6 · बुद्धिवर्धक तेल / घृत — Parent के पास है?', options: ['हाँ', 'नहीं → PCC Task'], show: NASYA },
        { t: 'one', id: 'abhyangHas', label: 'AB · अभ्यंग तेल — Parent के पास है?', options: ['Clinic से मिला', 'बाहर से लेना है — नाम बताया', 'नहीं मिला'], show: ABHY },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'M5 और M6 की शीशियाँ अलग जगह रखवाएँ — सिर का तेल गलती से नाक में न जाए। तीनों पर parent अपने हाथ से भी M5 / M6 / AB लिख लें।' },
      ],
    },
    {
      title: 'STEP 04 — M5 · मेध्य ऑयल — शिरो अभ्यंग (सिर पर तेल)',
      blocks: on(SHIRO, [
        { t: 'say', text: [
          '“[Child Name] के लिए M5 · [M5 Oil] चुना गया है। इसे सिर पर लगाना है — इसे शिरो अभ्यंग कहते हैं।”',
          '“कब: खासकर सुबह, नहाने के बाद — बिल्कुल वैसे ही जैसे रोज़ की दिनचर्या में हम बालों में तेल लगाते हैं। [Doctor ने शाम / दोनों समय लिखा हो तो वह भी बताएँ।]”',
          '“कितना: [M5 Qty] — हल्का-सा; सिर को तेल से भिगोना नहीं है।”',
          '“कैसे: थोड़ा तेल हथेली पर लेकर उँगलियों से सिर की त्वचा और बालों की जड़ों पर हल्के हाथ से लगाइए, धीरे-धीरे गोल घुमाते हुए। ज़ोर से रगड़ना नहीं है।”',
          '“कितने दिन: [M5 Frequency / Duration]।”',
        ].join('\n') },
        { t: 'list', id: 'shiroPoints', label: TOLD, items: [
          'सिर पर लगाना है (शिरो अभ्यंग)',
          'सुबह, नहाने के बाद — रोज़ की तरह',
          'हल्की मात्रा — [M5 Qty]',
          'उँगलियों से सिर की त्वचा / जड़ों पर, हल्के हाथ',
          'आँख और कान में न जाए',
          'सिर पर घाव, फुंसी या जलन हो तो उस दिन नहीं',
          'आवृत्ति / अवधि बताई',
        ] },
      ]),
    },
    {
      title: 'STEP 05 — M6 · बुद्धिवर्धक तेल / घृत — नस्य (नाक में)',
      blocks: on(NASYA, [
        { t: 'note', tone: 'warn', label: 'उद्देश्य', text: 'नस्य सबसे संवेदनशील हिस्सा है — तीनों चरण (पूर्वकर्म, प्रधानकर्म, पश्चात्कर्म) एक-एक करके।' },
        { t: 'say', text: [
          '“अब M6 — इसे नाक में डाला जाता है, इसे नस्य कहते हैं। [Child Name] के लिए [M6 Medicine] चुना गया है — हर नथुने में [Qty per nostril], तरीका [बूँद डालना / अंदर लगाना], समय [Time], [Frequency]।”',
          '“नस्य की मात्रा doctor हर बच्चे के लिए अलग तय करते हैं — इसलिए यही मात्रा, कभी अपने से कम-ज़्यादा नहीं। नस्य के तीन चरण हैं — पहले, करते समय और बाद में।”',
        ].join('\n') },
      ]),
    },
    {
      title: 'STEP 05 · 01 — नस्य से पहले (पूर्वकर्म)',
      blocks: on(NASYA, [
        { t: 'say', text: [
          '“• doctor की बताई औषधि, मात्रा, समय और डालने / लगाने का तरीका पहले जाँच लें।',
          '• भोजन के तुरंत बाद नहीं — भोजन के कम से कम 1.5–2 घंटे बाद नस्य करें।',
          '• बच्चे को बुखार, जुकाम या नाक बंद हो तो उस दिन नस्य रोकें और doctor से पूछें।',
          '• कमरा आरामदायक और गुनगुना रखें; सीधे पंखे / ठंडी हवा से बचाएँ।',
          '• सिर और शरीर की सही स्थिति पहले doctor से दिखवा लें।”',
        ].join('\n') },
        { t: 'list', id: 'nasyaPrePoints', label: TOLD, items: [
          'औषधि, मात्रा, समय, तरीका जाँचना',
          'भोजन के 1.5–2 घंटे बाद',
          'बुखार / जुकाम / नाक बंद → उस दिन नहीं',
          'कमरा गुनगुना, पंखा / ठंडी हवा नहीं',
          'सही स्थिति doctor से देखी',
        ] },
      ]),
    },
    {
      title: 'STEP 05 · 02 — नस्य करते समय (प्रधानकर्म)',
      blocks: on(NASYA, [
        { t: 'say', text: [
          '“• सिर्फ़ तय मात्रा और बताई गई विधि — बदलाव अपने से नहीं।',
          '• doctor द्वारा बताई स्थिति में बच्चे को आराम से लिटाएँ, सिर स्थिर रखें।',
          '• तेल / घृत देते समय बच्चे की साँस सामान्य और धीमी रहे — ज़ोर से न खींचे।',
          '• तेल के तुरंत बाद नाक न दबाएँ, न ज़ोर से पोंछें।”',
        ].join('\n') },
        { t: 'list', id: 'nasyaDuringPoints', label: TOLD, items: [
          'सिर्फ़ तय मात्रा',
          'बताई स्थिति में लिटाना, सिर स्थिर',
          'साँस सामान्य, ज़ोर से नहीं खींचना',
          'तुरंत बाद नाक न दबाना / न पोंछना',
        ] },
      ]),
    },
    {
      title: 'STEP 05 · 03 — नस्य के बाद (पश्चात्कर्म) + हल्का सेक',
      blocks: on(NASYA, [
        { t: 'say', text: [
          '“• 5–10 मिनट आराम से शांत लेटे रहने दें; फिर सिर की स्थिति धीरे-धीरे बदलें।',
          '• मुँह / गले में तेल आए तो ज़बरदस्ती न निगलवाएँ — बताए अनुसार थूकने दें।',
          '• थोड़ी देर बाद गुनगुने पानी से गरारे — अगर बच्चा सुरक्षित रूप से कर सके।',
          '• कुछ समय सीधे AC, ठंडी हवा और तेज़ पंखे से बचाएँ।”',
        ].join('\n') },
        { t: 'say', text: [
          'नस्य के बाद हल्का सेक —',
          '“नस्य के बाद कपड़े से हल्का सेक देना है। एक साफ़ सूती रुमाल को प्रेस से हल्का गर्म कीजिए, फिर पहले अपनी कलाई पर रखकर जाँचिए कि वह सिर्फ़ गुनगुना है, जलाने वाला गर्म नहीं।”',
          '“फिर वह रुमाल [Child Name] की नाक और उसके आसपास — माथे और गालों पर हल्के से रखिए, 2–3 मिनट तक। रुमाल ठंडा हो जाए तो दोबारा हल्का गर्म कर सकती हैं। आँखों पर सीधे न रखें।”',
        ].join('\n') },
        { t: 'list', id: 'nasyaAfterPoints', label: TOLD, items: [
          '5–10 मिनट शांत लेटना',
          'गले में आया तेल ज़बरदस्ती न निगलवाना',
          'गुनगुने पानी से गरारे (सुरक्षित हो तो)',
          'AC / ठंडी हवा / तेज़ पंखे से बचाव',
          'रुमाल प्रेस से हल्का गर्म → कलाई पर जाँच',
          'नाक, माथे, गालों पर 2–3 मिनट सेक; आँखों पर नहीं',
        ] },
      ]),
    },
    {
      title: 'STEP 05 · नस्य Safety Gate — आज की स्थिति और Home Start',
      blocks: on(NASYA, [
        { t: 'say', text: '“अभी [Child Name] को बुखार, जुकाम, नाक बंद या साँस की कोई परेशानी है?”' },
        { t: 'many', id: 'nasyaHealth', label: 'बुखार / जुकाम / नाक बंद / साँस (Multi Select)', options: ['कुछ नहीं', ...NASYA_PROBLEM] },
      ]).concat(on({ id: 'nasyaHealth', any: NASYA_PROBLEM }, [
        { t: 'note', tone: 'danger', text: 'बुखार / जुकाम / नाक बंद / साँस की परेशानी → Medical Review, नस्य शुरू नहीं (Nasya Home Start = No)।' },
      ]), B.triage({ id: 'nasyaTriage', show: { id: 'nasyaHealth', any: NASYA_PROBLEM } }), on(NASYA, [
        { t: 'note', tone: 'warn', label: 'Nasya Home Start Allowed', text: 'Yes — doctor suitability ✓ + demonstration ✓\nNo — demonstration / clarification pending (parent को अभी शुरू न करने को कहा)' },
        { t: 'one', id: 'nasyaHomeStart', label: 'Nasya Home Start Allowed', options: ['Yes', 'No'] },
      ])),
    },
    {
      title: 'STEP 06 — AB · अभ्यंग — शरीर पर तेल मालिश',
      blocks: on(ABHY, [
        { t: 'say', text: [
          '“अब AB · अभ्यंग — यानी शरीर पर तेल मालिश। [Child Name] के लिए [AB Oil] चुना गया है — इसे [AB Area] पर, [AB Qty] मात्रा में, [AB Time] लगाना है।”',
          '“कब: सामान्य रूप से नहाने से पहले। सर्दियों में इसे रात को सोने से पहले भी लगा सकते हैं — पर उस समय पंखा बंद रखें और ठंडी हवा न लगे।”',
          '“यह तेल घर पर लगाने के लिए दिया जाता है। [अगर clinic से नहीं दिया गया:] doctor ने यह तेल बाहर से लेने की सलाह दी है — नाम है [AB Oil Name]; खरीदते समय वही नाम देखकर लें।”',
        ].join('\n') },
      ]),
    },
    {
      title: 'STEP 06 · 01 — अभ्यंग से पहले (तैयारी)',
      blocks: on(ABHY, [
        { t: 'say', text: [
          '“• doctor द्वारा चुने गए तेल, मात्रा, शरीर के हिस्सों और समय की पुष्टि करें।',
          '• तेल हाथ पर जाँचकर हल्का गुनगुना रखें — बहुत गर्म नहीं।',
          '• कमरा आरामदायक रखें; सीधे ठंडी हवा या तेज़ पंखे से बचाएँ।',
          '• खुले घाव या प्रभावित त्वचा पर मालिश न करें — ज़रूरत हो तो doctor से पूछें।”',
        ].join('\n') },
        { t: 'list', id: 'abhyangPrePoints', label: TOLD, items: [
          'तेल, मात्रा, हिस्से, समय की पुष्टि',
          'तेल हल्का गुनगुना, हाथ पर जाँचकर',
          'कमरा आरामदायक, ठंडी हवा नहीं',
          'घाव / प्रभावित त्वचा पर नहीं',
        ] },
      ]),
    },
    {
      title: 'STEP 06 · 02 — अभ्यंग करते समय (विधि)',
      blocks: on(ABHY, [
        { t: 'say', text: [
          '“• सिर्फ़ बताए गए हिस्सों पर उँगलियों / हथेलियों से हल्के हाथ से तेल लगाएँ।',
          '• गर्दन से पैरों की तरफ़ हल्के हाथ से मालिश करें — ज़ोर न दें।',
          '• आँख, कान, जननांग तथा नाक के अंदर तेल न डालें।',
          '• लालिमा या जलन दिखे तो रोकें।”',
        ].join('\n') },
        { t: 'list', id: 'abhyangDuringPoints', label: TOLD, items: [
          'सिर्फ़ बताए हिस्सों पर, हल्के हाथ',
          'गर्दन से पैरों की ओर, बिना ज़ोर',
          'आँख / कान / जननांग / नाक के अंदर नहीं',
          'लालिमा / जलन पर रोकें',
        ] },
      ]),
    },
    {
      title: 'STEP 06 · 03 — अभ्यंग के बाद — सेक (ज़रूरी)',
      blocks: on(ABHY, [
        { t: 'say', text: [
          '“तेल लगाने के बाद पूरे शरीर पर सेक देना ही देना है। इसके लिए गर्म पानी की थैली या इलेक्ट्रिक hot bag इस्तेमाल कीजिए।”',
          '“• थैली और त्वचा के बीच एक पतला कपड़ा रखिए — थैली सीधे त्वचा पर नहीं।',
          '• पहले अपनी कलाई पर जाँचिए कि वह सिर्फ़ गुनगुनी है।',
          '• हर अंग पर कम से कम 1–2 मिनट — पीठ, पेट, हाथ, पैर — अच्छे से, एक-एक करके।',
          '• बच्चा बार-बार हटे या रोए तो तापमान और कम कीजिए।”',
          '“अगर गर्म पानी की थैली या इलेक्ट्रिक bag नहीं है — तो रात को सोने से पहले तेल लगाकर बच्चे को मोटा गर्म कपड़ा ओढ़ाकर सुला दीजिए। यह भी सेक का काम करता है।”',
        ].join('\n') },
        { t: 'list', id: 'abhyangSekPoints', label: TOLD, items: [
          'तेल के बाद पूरे शरीर पर सेक',
          'गर्म पानी की थैली / इलेक्ट्रिक hot bag',
          'थैली और त्वचा के बीच पतला कपड़ा',
          'कलाई पर तापमान जाँच — सिर्फ़ गुनगुना',
          'हर अंग पर कम से कम 1–2 मिनट',
          'थैली न हो तो: रात को मोटा गर्म कपड़ा ओढ़ाकर सुलाना',
        ] },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'सेक के समय बच्चे को अकेला न छोड़ें, बच्चे को इलेक्ट्रिक bag के साथ न सुलाएँ, और घाव, सूजन या जलन वाली जगह पर सेक न दें। जो बच्चा बोलकर ‘गर्म है’ नहीं बता पाता, उसके लिए तापमान हमेशा अपनी कलाई पर पहले जाँचें।' },
      ]),
    },
    {
      title: 'STEP 06 · 04 — सेक के बाद — स्नान और देखभाल',
      blocks: on(ABHY, [
        { t: 'say', text: [
          '“• सुबह लगाया हो — तेल और सेक के 15–30 मिनट बाद गुनगुने पानी से स्नान कराएँ।',
          '• रात को लगाया हो — पंखा बंद रखकर, गर्म कपड़ा ओढ़ाकर सुलाएँ; स्नान अगली सुबह गुनगुने पानी से।',
          '• त्वचा धीरे से सुखाएँ; तुरंत ठंडी हवा और धूल से बचाएँ; आरामदायक कपड़े पहनाएँ।',
          '• दर्द, त्वचा की जलन या असुविधा हो तो प्रक्रिया रोकें और सलाह लें।”',
        ].join('\n') },
        { t: 'list', id: 'abhyangAfterPoints', label: TOLD, items: [
          'सुबह: 15–30 मिनट बाद गुनगुना स्नान',
          'रात: पंखा बंद, गर्म कपड़ा, स्नान अगली सुबह',
          'त्वचा धीरे सुखाना; ठंडी हवा / धूल से बचाव',
          'दर्द / जलन / असुविधा → रोकें, सलाह लें',
        ] },
      ]),
    },
    {
      title: 'STEP 07 — बच्चे का सहयोग कैसे लें — तीनों प्रक्रियाओं में',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'ज़बरदस्ती नहीं — अनुमति और धीरे-धीरे।' },
        { t: 'say', text: '“[Child Name] को सिर / शरीर पर तेल लगवाना या चेहरे के पास कुछ करना आमतौर पर कैसा लगता है?”' },
        { t: 'one', id: 'touchResponse', label: 'बच्चे का स्पर्श-response', options: ['आराम से करवाता है', 'थोड़ा असहज', 'बिल्कुल पसंद नहीं / रोता है', 'पता नहीं — पहली बार'] },
        { t: 'say', text: [
          '“अगर [Child Name] को स्पर्श पसंद नहीं, तो पहले उसे तेल दिखाइए, उसके हाथ पर थोड़ा लगाइए, उसकी सहजता के हिसाब से शुरुआत कीजिए — पहले दिन थोड़ी जगह, फिर धीरे-धीरे बढ़ाइए। पसंद का गाना या खिलौना साथ रख सकती हैं।”',
          '“अगर बच्चा बहुत असहज हो, दर्द बताए या हटना चाहे — तो प्रक्रिया रोक दीजिए और हमें बताइए। बच्चे को पकड़कर ज़बरदस्ती कोई भी प्रक्रिया — खासकर नस्य — नहीं करनी है।”',
        ].join('\n') },
      ],
    },
    {
      title: 'STEP 08 — कब तुरंत रोकें — सुरक्षा',
      blocks: [
        { t: 'say', text: [
          '“• त्वचा पर लालिमा, खुजली, जलन या दाने — तेल लगाना रोकें, हमें बताएँ।',
          '• नस्य के दौरान या बाद में साँस में तकलीफ़, नाक से खून, लगातार खाँसी / उल्टी या असामान्य सुस्ती — प्रक्रिया रोकें और तुरंत चिकित्सकीय सहायता लें।',
          '• साँस की गंभीर तकलीफ़ हो तो तुरंत नज़दीकी अस्पताल जाएँ।',
          '• किसी भी प्रक्रिया की मात्रा या तरीका अपने से न बदलें।”',
        ].join('\n') },
        { t: 'list', id: 'stopPoints', label: TOLD, items: [
          'त्वचा की प्रतिक्रिया → रोकें',
          'नस्य में साँस / खून / खाँसी / उल्टी / सुस्ती → रोकें + चिकित्सा',
          'गंभीर साँस की तकलीफ़ → अस्पताल',
          'मात्रा / तरीका अपने से नहीं बदलना',
        ] },
      ],
    },
    {
      title: 'STEP 09 — दिन में कब क्या — तीनों का समय',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Doctor के लिखे समय सबसे ऊपर; नीचे सामान्य क्रम का उदाहरण।' },
        { t: 'info', head: ['समय', 'प्रक्रिया (जो prescribed हो)', 'ध्यान रखें'], rows: [
          ['सुबह, नहाने से पहले', 'AB · अभ्यंग (शरीर) + सेक', 'हर अंग पर 1–2 मिनट सेक; 15–30 मिनट बाद गुनगुने पानी से स्नान'],
          ['सर्दियों में विकल्प: रात, सोने से पहले', 'AB · अभ्यंग + सेक', 'पंखा बंद; थैली न हो तो मोटा गर्म कपड़ा ओढ़ाकर सुलाएँ'],
          ['नहाने के बाद', 'M5 · शिरो अभ्यंग (सिर पर हल्का तेल)', 'रोज़ की तरह हल्का-सा'],
          ['Doctor का तय समय', 'M6 · नस्य + रुमाल से सेक', 'भोजन के 1.5–2 घंटे बाद; बाद में 2–3 मिनट हल्का सेक; बुखार / जुकाम में नहीं'],
          ['शाम (यदि लिखा हो)', 'M5 / M6 का शाम वाला', 'Tracker में ‘शा.’ कॉलम'],
        ] },
        { t: 'text', id: 'panchakarmaTime', label: 'इस बच्चे के लिए तय समय — कब क्या (M5 शिरो अभ्यंग / M6 नस्य / AB अभ्यंग)', long: true, hint: 'जैसे: AB — सुबह नहाने से पहले; M5 — नहाने के बाद; M6 नस्य — ...' },
        { t: 'note', tone: 'info', text: 'यह क्रम FCF-07 के Daily Care Routine Card में जाएगा (prescription के समय के अनुसार)।' },
      ],
    },
    {
      title: 'STEP 10 — Demonstration / प्रशिक्षण',
      blocks: [
        { t: 'many', id: 'demoShiro', label: 'M5 · शिरो अभ्यंग — Demonstration (Paper का Demo box)', options: ['विधि दिखायी', 'अभिभावक ने समझा', 'प्रश्न स्पष्ट किए', 'लागू नहीं'], show: SHIRO },
        { t: 'text', id: 'demoShiroBy', label: 'M5 — किसने / तारीख', show: SHIRO },
        { t: 'many', id: 'demoNasya', label: 'M6 · नस्य — Demonstration (Paper का Demo box)', options: ['विधि दिखायी', 'अभिभावक ने करके दिखाया', 'प्रश्न स्पष्ट किए', 'Pending', 'लागू नहीं'], show: NASYA },
        { t: 'text', id: 'demoNasyaBy', label: 'M6 — किसने / तारीख', show: NASYA },
        { t: 'many', id: 'demoAbhyang', label: 'AB · अभ्यंग (शरीर) — Demonstration (Paper का Demo box)', options: ['विधि दिखायी', 'अभिभावक ने समझा', 'प्रश्न स्पष्ट किए', 'लागू नहीं'], show: ABHY },
        { t: 'text', id: 'demoAbhyangBy', label: 'AB — किसने / तारीख', show: ABHY },
        { t: 'note', tone: 'info', text: 'Paper के ‘डेमो / प्रशिक्षण’ box में चिकित्सक का नाम और तारीख भी भरवाएँ।' },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'Demonstration ‘Pending’ हो तो parent को साफ़ बताएँ कि उस प्रक्रिया को demonstration के बाद ही शुरू करना है — नस्य के लिए यह अनिवार्य है।' },
      ],
    },
    {
      title: 'STEP 11 — पंचकर्म Tracker — Paper का दूसरा पेज (180 दिन)',
      blocks: [
        { t: 'say', text: [
          '“Paper के दूसरे पेज पर 6 महीने का पंचकर्म ट्रैकर है। हर दिन के आगे पाँच बॉक्स हैं — M5 सुबह, M5 शाम, M6 सुबह, M6 शाम और AB। ‘सु.’ मतलब सुबह, ‘शा.’ मतलब शाम।”',
          '“प्रक्रिया करने के बाद ही उसके बॉक्स में ✓ लगाइए। जिस दिन जो प्रक्रिया तय नहीं है, उसका बॉक्स खाली छोड़िए। ऊपर नाम, Patient ID और शुरुआत की तारीख भर लीजिए; नीचे ‘अभिभावक हस्ताक्षर’ की जगह है, और ‘चिकित्सक समीक्षा’ हम review पर भरेंगे।”',
        ].join('\n') },
        { t: 'list', id: 'trackerPoints', label: TOLD, items: [
          '5 कॉलम समझाए (M5 सु/शा, M6 सु/शा, AB)',
          '✓ सिर्फ़ प्रक्रिया के बाद',
          'तय न हो तो खाली',
          'नाम / ID / तारीख; हस्ताक्षर और चिकित्सक समीक्षा',
        ] },
      ],
    },
    {
      title: 'STEP 12 — Teach-Back',
      blocks: [
        { t: 'say', text: '“आप अपने शब्दों में बताइए — सिर पर कौन-सा तेल कब लगाएँगी, नस्य से पहले किन बातों को देखेंगी, नस्य के बाद सेक कैसे देंगी, और शरीर की मालिश के बाद सेक और स्नान कैसे करेंगी?”' },
        { t: 'text', id: 'teachBackWords', label: 'Parent ने अपने शब्दों में क्या बताया', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back', options: ['सही बताया', 'आंशिक — दोबारा समझाया', 'समझ नहीं आया → Repeat Explanation Task'] },
      ],
    },
    {
      title: 'STEP 13 — समापन और अगला सेशन',
      blocks: [
        { t: 'say', text: [
          '“मैम, आज हमने [Child Name] की तीनों पंचकर्म प्रक्रियाएँ — सिर पर तेल, नस्य और शरीर की मालिश — पहले, दौरान और बाद की हर सावधानी के साथ समझ लीं। माली की तरह — सही समय, सही मात्रा और प्यार से देखभाल।”',
          '“हमारा अगला सेशन Neuro-Development Home Activity Training Session रहेगा। उसमें हम समझेंगे कि घर के सामान्य माहौल में, खेल और रोज़ के कामों के ज़रिए [Child Name] को सीखने के मौके कैसे देने हैं।”',
          '“हम एक-एक विषय अलग से लेकर चलते हैं, ताकि आप पर सारी बातें एक साथ याद रखने का दबाव न हो। आज के विषय में आपका कोई और सवाल है?”',
          '“बहुत धन्यवाद। अपना और [Child Name] का ध्यान रखिए।”',
        ].join('\n') },
        { t: 'link', id: 'nextSession', label: 'Next Session Date / Time (Auto Schedule + Edit)', code: 'FCF-05', options: ['Scheduled', 'Pending'] },
        { t: 'text', id: 'nextStaff', label: 'Next Session — Staff' },
        { t: 'check', id: 'nextConfirmed', label: 'Parent ने confirm किया (WhatsApp reminder जाएगा)' },
      ],
    },
    {
      title: 'Session Completion Rules & Final Status',
      blocks: [
        { t: 'list', id: 'completionRules', label: 'Session Completion Rules — MV-FCF-04 (सब ✓ = Completed)', items: [
          'Health check किया',
          'बीज से वृक्ष — पौधे की देखभाल बोला',
          'शीशियों की पहचान (M5 / M6 / AB)',
          'बच्चे का सहयोग + रोकने के संकेत',
          'दिन का समय-क्रम',
          'Demonstration Done / Task',
          'Tracker समझाया',
          'Teach-back सही',
          'अगला सेशन schedule',
        ] },
        { t: 'list', id: 'completionShiro', label: 'M5 (prescribed)', items: ['M5 शिरो अभ्यंग — समय, मात्रा, विधि'], show: SHIRO },
        { t: 'list', id: 'completionNasya', label: 'M6 (prescribed)', items: ['M6 नस्य — पूर्वकर्म, प्रधानकर्म, पश्चात्कर्म + रुमाल से सेक', 'नस्य Safety Gate + Home Start flag'], show: NASYA },
        { t: 'list', id: 'completionAbhyang', label: 'AB (prescribed)', items: ['AB अभ्यंग — पहले, दौरान, सेक, बाद (सुबह / रात विकल्प)'], show: ABHY },
        { t: 'final', id: 'final', label: 'Final Session Status', options: ['Completed', 'Completed — Task Pending', 'Partially Completed → Reschedule remaining', 'Rescheduled', 'Not Applicable', 'Escalated — Clinical Review'] },
        { t: 'text', id: 'remarks', label: 'Counsellor Remarks', long: true },
        B.taskRegister(3),
      ],
    },
  ],
};
