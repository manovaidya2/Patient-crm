// MV-FCF-06 • Family Care Foundation Program — Session 06 / 07 (Day 6): Neuro-Development Home Activity Training Session.
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

// The 12 activities of the HOME THERAPY & ACTIVITIES paper (Step 05). Only the assigned ones are shown.
const ACTS = [
  { n: 1, name: 'पसंद की चीज़ माँगना', area: 'Communication',
    material: 'पसंदीदा खिलौना, गेंद या खाने की वस्तु',
    how: 'बच्चे को पसंद की चीज़ दिखाएँ। थोड़ा रुकें। बच्चा हाथ बढ़ाए, इशारा करे, तस्वीर दिखाए या शब्द बोले तो तुरंत उसकी माँग का जवाब दें। ज़रूरत हो तो दो विकल्प दिखाएँ।',
    see: 'बिना रोए अपनी ज़रूरत जताने के प्रयास; इशारे/शब्द/तस्वीर का उपयोग',
    next: 'इशारे से → एक शब्द या चित्र से → दो शब्द (‘पानी दो’) → भविष्य में: भूख, प्यास, दर्द खुद बता सकेगा',
    dont: 'चीज़ हाथ में पहले ही दे देना — बच्चे को माँगने का मौका नहीं मिलता' },
  { n: 2, name: 'बच्चे की रुचि में शामिल होना', area: 'Joint Attention',
    material: 'बच्चे का पसंदीदा खिलौना',
    how: 'बच्चा जिस चीज़ में रुचि दिखाए, उसी में शामिल हों। वह कार चलाता है तो पास में दूसरी कार चलाएँ। छोटी टिप्पणी करें—‘कार चली!’ और उसकी प्रतिक्रिया का इंतज़ार करें।',
    see: 'साझा खेल, आपकी ओर देखना या प्रतिक्रिया देना; नज़र मिलाना अनिवार्य नहीं',
    next: 'आपको खेल में आने देना → खुद चीज़ दिखाना → भविष्य में: दूसरों के साथ जुड़कर सीख सकेगा',
    dont: 'अपना खेल थोपना या खिलौना छीनकर ‘ऐसे खेलो’ कहना' },
  { n: 3, name: 'बारी-बारी से गेंद खेलना', area: 'Social Interaction',
    material: 'नरम गेंद',
    how: 'सामने बैठकर गेंद धीरे लुढ़काएँ। कहें ‘मेरी बारी—तुम्हारी बारी’। शुरू में मदद दें; बाद में बच्चे को स्वयं लौटाने का अवसर दें।',
    see: 'कितनी बार बारी ली; सहायता कम हुई या नहीं',
    next: 'आपके साथ → भाई-बहन के साथ → दूसरे बच्चों के साथ → भविष्य में: दोस्ती और समूह खेल',
    dont: 'गेंद ज़ोर से फेंकना या बारी न आने पर डाँटना' },
  { n: 4, name: 'मज़ेदार नकल का खेल', area: 'Imitation',
    material: 'ताली, खिलौना ढोल, ब्लॉक्स',
    how: 'बच्चे के सामने ताली बजाएँ या मेज़ थपथपाएँ। वह नकल करे तो खुशी दिखाएँ। न करे तो पहले उसकी क्रिया की नकल करके खेल में जुड़ें, फिर एक नई आसान क्रिया दिखाएँ।',
    see: 'एक नई क्रिया की नकल या सहभागी खेल',
    next: 'क्रिया की नकल → आवाज़ की नकल → शब्द की नकल → भविष्य में: नई चीज़ें देखकर सीख सकेगा',
    dont: 'पकड़कर ज़बरदस्ती हाथ से नकल करवाना' },
  { n: 5, name: 'दो तस्वीरों से चुनाव', area: 'Functional Communication',
    material: 'पानी, खिलौना या गतिविधियों की तस्वीरें',
    how: 'दो अलग चीज़ों की वास्तविक वस्तु/तस्वीर दिखाकर पूछें ‘कौन-सा?’ बच्चा इशारा करे, तस्वीर दे या शब्द कहे—सभी उपयुक्त उत्तर स्वीकार करें।',
    see: 'अपनी पसंद स्पष्ट बताने के अवसर',
    next: 'दो में से चुनना → तीन में से → बिना तस्वीर बताना → भविष्य में: अपनी पसंद खुद बता सकेगा',
    dont: 'एक साथ 4–5 विकल्प दिखाना — बच्चा उलझता है' },
  { n: 6, name: 'छोटे निर्देश—खेल में', area: 'Understanding',
    material: 'गेंद, डिब्बा, ब्लॉक',
    how: 'पहले एक आसान निर्देश दें—‘गेंद दो’। ज़रूरत पर इशारा या मॉडल दें। सफलता पर खेल जारी रखें। समझ बढ़े तो ‘गेंद डिब्बे में रखो’ जैसा अगला कदम जोड़ें।',
    see: 'कितने निर्देश इशारे सहित/बिना समझे',
    next: 'इशारे के साथ → बिना इशारे → दो-step निर्देश → भविष्य में: घर और स्कूल के रोज़ के काम कर सकेगा',
    dont: 'एक साथ लंबा निर्देश — ‘गेंद उठाकर डिब्बे में रखो और बैठो’' },
  { n: 7, name: 'ब्लॉक्स से बनाना और साथ खेलना', area: 'Play & Fine Motor',
    material: 'बड़े सुरक्षित ब्लॉक्स',
    how: 'पहले बच्चा स्वतंत्र रूप से बनाए। फिर आप दो ब्लॉक लगाकर दिखाएँ और बच्चे को एक जोड़ने दें। उसका बनाया गिर जाए तो बिना दबाव फिर प्रयास करें।',
    see: 'जुड़कर खेलने की अवधि; ब्लॉक लगाने की कोशिश',
    next: 'नकल करके बनाना → मॉडल देखकर बनाना → भविष्य में: हाथों का कौशल — लिखना, बटन लगाना',
    dont: 'बच्चे का बनाया तोड़ना या ‘गलत’ कहना' },
  { n: 8, name: 'ड्रेसिंग में एक कदम स्वयं', area: 'Daily Living',
    material: 'ढीली टी-शर्ट या पैंट',
    how: 'कपड़े पहनाते समय आसान आख़िरी हिस्सा बच्चे को करने दें—जैसे आस्तीन से हाथ बाहर निकालना। धीरे-धीरे मदद कम करें। पसंद और संवेदी असुविधा का सम्मान करें।',
    see: 'कितने चरण खुद किए; कितनी मदद चाहिए',
    next: 'एक step → दो-तीन steps → ज़्यादातर कम मदद से → भविष्य में: सुबह की तैयारी में आत्मनिर्भरता',
    dont: 'सब खुद पहना देना क्योंकि जल्दी है' },
  { n: 9, name: 'हाथ धोने की तस्वीर-क्रम गतिविधि', area: 'Self Care',
    material: 'साबुन, पानी, 3–4 तस्वीरें',
    how: 'नल खोलना, हाथ गीले करना, साबुन, धोना, सुखाना—तस्वीरों से क्रम दिखाएँ। बच्चे को एक चरण से शुरू कराएँ; बाकी में मदद करें।',
    see: 'स्वतंत्र किए चरण; चरणों का क्रम',
    next: 'एक चरण → तस्वीर देखकर पूरा क्रम → बिना तस्वीर → भविष्य में: स्वच्छता की आदत खुद',
    dont: 'सारे चरण एक साथ सिखाना' },
  { n: 10, name: 'कहानी में साझेदारी', area: 'Language & Interaction',
    material: 'बड़ी तस्वीरों वाली किताब',
    how: 'बच्चे की पसंद का चित्र खोलें। तस्वीर पर छोटी टिप्पणी करें, आवाज़ निकालें, इशारा दिखाएँ। प्रश्नों की लगातार बौछार न करें; बच्चा जिस तरह जवाब दे उसे आगे बढ़ाएँ।',
    see: 'इशारा, आवाज़, शब्द या तस्वीर में भागीदारी',
    next: 'चित्र दिखाना → चित्र का नाम → छोटी बात बताना → भविष्य में: बातचीत और सीखने में भागीदारी',
    dont: 'सवालों की बौछार — ‘ये क्या है? बोलो!’' },
  { n: 11, name: 'छोटा मूवमेंट गेम', area: 'Gross Motor',
    material: 'खाली सुरक्षित जगह, कुशन',
    how: 'बच्चे की क्षमता के अनुसार ‘चलो–रुको’, ज़मीन पर बनी लाइन पर चलना या हल्की बाधा पार करना खेलें। संतुलन/चलने में परेशानी हो तो विशेषज्ञ की सलाह लें।',
    see: 'दिए गए निर्देश का पालन, संतुलन और सहभागिता',
    next: '‘रुको’ पर रुकना → खेल के नियम मानना → भविष्य में: सड़क और बाहर सुरक्षित रहना',
    dont: 'बिना सुरक्षित जगह के भाग-दौड़' },
  { n: 12, name: 'शांत होने की अपनी पसंद', area: 'Regulation',
    material: 'शांत कोना, मनपसंद किताब/खिलौना',
    how: 'शांत समय में दो आरामदायक विकल्प दिखाएँ—जैसे किताब देखना या शांत कोने में बैठना। परेशान होने पर बच्चे को सहारा दें; ज़बरदस्ती श्वास अभ्यास, स्पर्श या संवेदी उत्तेजना न दें।',
    see: 'बच्चा अपनी पसंद का शांत होने का तरीका चुन सके',
    next: 'सहारे से शांत होना → खुद ‘ब्रेक’ माँगना → भविष्य में: अपनी भावनाएँ खुद सँभाल सकेगा',
    dont: 'रोते समय ज़बरदस्ती श्वास अभ्यास या स्पर्श' },
];
const actOption = (a) => `${a.n} · ${a.name} (${a.area})`;
const ACT_OPTIONS = ACTS.map(actOption);
const CONCERN = ['कोई नहीं', 'समझ नहीं आया', 'समय नहीं', 'बच्चा रुचि नहीं लेता'];

// One activity block of Step 05 (5 parts + Explained / Parent ने करके दिखाया / Parent Concern), shown only when assigned.
const activitySection = (a) => {
  const show = { id: 'assignedActs', any: [actOption(a)] };
  return {
    title: `STEP 05 · Activity ${a.n} — ${a.name}`,
    time: a.area,
    blocks: [
      { t: 'say', text: `“सामान: ${a.material}\nकैसे कराएँ: ${a.how}\nक्या देखें: ${a.see}\nअगला कदम: ${a.next}”`, show },
      { t: 'note', tone: 'warn', label: 'क्या न करें', text: a.dont, show },
      { t: 'many', id: `a${a.n}Done`, label: `Activity ${a.n}`, options: ['Explained', 'Parent ने करके दिखाया'], show },
      { t: 'many', id: `a${a.n}Concern`, label: 'Parent Concern', options: CONCERN, show },
    ],
  };
};

module.exports = {
  code: 'FCF-06',
  key: 'MV-FCF-06',
  version: 1,
  kind: 'foundation',
  seq: 6,
  day: 6,
  title: 'Neuro-Development Home Activity Training Session',
  subtitle: 'घर का माहौल ही सीखने की जगह — खेल और रोज़ के कामों से, एक-एक कदम',
  meta: [
    ['Program', 'Family Care Foundation Program • Session 06'],
    ['Session Code', 'MV-FCF-06'],
    ['CRM Schedule', 'Foundation Day 6'],
    ['Session Name', 'Neuro-Development Home Activity Training'],
    ['हिंदी नाम', 'घरेलू विकास गतिविधि प्रशिक्षण'],
    ['Conducted By', 'Trained Medical Counsellor'],
    ['Mode', 'Call / Video Call / Clinic में'],
    ['Reference Paper', 'HOME THERAPY & ACTIVITIES (12 गतिविधियाँ, 7-दिन उदाहरण, साप्ताहिक प्रगति)'],
    ['Applicability', 'Always'],
    ['Prerequisite', 'Therapy Session (FCF-05) Completed / N/A'],
    ['Next Session (Auto)', 'MV-FCF-07 · Parent Guidance & Integrated Daily Routine Session'],
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
          { id: 'goals', label: 'Approved Developmental Goals (1–3)', from: '', hint: 'Doctor / Assessment Plan' },
          { id: 'activities', label: 'Assigned Activities — paper की 12 में से 3–5 (नंबर, Level, आवृत्ति)', from: '', hint: 'Therapy Module' },
          { id: 'likes', label: 'बच्चे की पसंद की चीज़ें / खिलौने · डर / sensory परेशानी (History)', from: '', hint: 'Clinical History' },
          { id: 'choking', label: 'छोटे हिस्से निगलने का जोखिम (उम्र / आदत)', from: '', hint: 'Clinical History' },
          { id: 'practiceTime', label: 'Verbal / Sensory अभ्यास का समय (FCF-05)', from: 'ans:FCF-05:therapyTime', hint: 'FCF-05' },
        ] },
        { t: 'list', id: 'preChecklist', label: 'Pre-Session Checklist (सब ✓ होने पर ही Session शुरू करें)', items: [
          'Approved goals CRM में हैं (नहीं → Clarification Task)',
          'Assigned activities (3–5) देख लीं',
          'Home Activities paper parent को भेजा',
          'Demonstration की ज़रूरत देख ली',
        ] },
        { t: 'note', tone: 'info', label: 'कैसे चलाना है', text: 'Parent को Home Activities paper सामने रखवाएँ। पहले सोच (Step 02), फिर नियम (Step 04), फिर सिर्फ़ assigned activities एक-एक करके (Step 05) — बाकी activities parent paper में खुद देख सकता है। हर activity के बाद parent से करके दिखवाएँ।' },
      ],
    },
    {
      title: 'STEP 01 — सेशन की शुरुआत + पिछले सेशन से जोड़',
      blocks: [
        { t: 'say', text: [
          '“नमस्ते मैम/सर, मैं MANOVAIDYA Clinic की Medical Care Team से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
          '“आज आपके बच्चे का Neuro-Development Home Activity Training Session है। आज हम समझेंगे कि [Child Name] के लिए कौन-सी activities तय की गई हैं, और आप उन्हें घर पर खेल और रोज़ के कामों के ज़रिए कैसे करवा सकती हैं। Home Therapy & Activities वाला paper सामने रख लीजिए।”',
          '“इसमें लगभग 10–15 मिनट लगेंगे। क्या अभी आप आराम से बात कर सकते हैं?”',
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
        { t: 'say', text: '“कल आपने स्पर्श और ध्वनि-अनुकरण सीखा था — वह एक तय समय का अभ्यास है। आज की activities उससे अलग हैं — ये पूरे दिन के खेल और रोज़ के कामों में घुल-मिल जाती हैं। कल की ‘आ’ आज ‘पसंद की चीज़ माँगने’ के खेल में भी काम आएगी।”' },
      ],
    },
    {
      title: 'STEP 02 — Parent की सोच — विकास का मतलब सिर्फ़ बोलना नहीं',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'Parent की अपेक्षा सही दिशा में; ‘पढ़ाना / test लेना’ की जगह ‘मौके देना’।' },
        { t: 'say', text: [
          '“मैम, बच्चे के विकास का मतलब सिर्फ़ बोलना शुरू कर देना नहीं है। बच्चा अपनी ज़रूरत कैसे बताता है, दूसरों से कैसे जुड़ता है, नकल करता है, खेलता है, और धीरे-धीरे रोज़ के छोटे काम खुद करने लगता है — ये सब विकास के हिस्से हैं।”',
          '“इन activities का मकसद बच्चे से हर हाल में ‘सही जवाब’ दिलवाना नहीं, बल्कि मिलकर संवाद और सीखने के सुखद मौके बढ़ाना है। बच्चे को हर समय पढ़ाना या उसका test लेना ज़रूरी नहीं — और दूसरे बच्चों से तुलना बिल्कुल नहीं।”',
        ].join('\n') },
      ],
    },
    {
      title: 'FUTURE VISION POINT — हर छोटी activity एक बीज है',
      time: '1 मिनट',
      blocks: [
        { t: 'say', text: [
          '“बीज से वृक्ष वाला उदाहरण याद कीजिए। आज की 5 मिनट की activity सिर्फ़ खेल नहीं — आगे की एक क्षमता का बीज है। इसीलिए paper में हर activity के नीचे लिखा है — अगला कदम और भविष्य में उपयोग।”',
          '“जैसे — आज [Child Name] रोकर माँगता है; ‘पसंद की चीज़ माँगना’ से वह इशारे से माँगना सीख सकता है; फिर एक शब्द या चित्र से; और आगे भूख, प्यास, दर्द खुद बता सकेगा। हम हमेशा सिर्फ़ अगला एक कदम देखेंगे।”',
        ].join('\n') },
        { t: 'facts', id: 'futureRecord', label: 'Future Development Record (Doctor / Therapist approved)', rows: [
          { id: 'ability', label: 'आज की क्षमता (Current Ability)', from: '', hint: 'Future Development Record' },
          { id: 'goal', label: 'अभी का लक्ष्य (Current Approved Goal)', from: '', hint: 'Future Development Record' },
          { id: 'next', label: 'अगली संभावित क्षमता (Next Possible Ability)', from: '', hint: 'Future Development Record' },
          { id: 'benefit', label: 'भविष्य में उपयोग (Future Life Benefit)', from: '', hint: 'Future Development Record' },
        ] },
        { t: 'note', tone: 'rule', label: 'Staff Rule', text: 'Auto Fetch: Future Development Record (Doctor / Therapist approved)। खाली हो तो अपने से न भरें → Clinical Clarification Task।' },
      ],
    },
    {
      title: 'STEP 03 — बच्चे के goals और चुनी गई activities',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'सिर्फ़ approved goals और assigned activities — counsellor अपने से नई activity नहीं जोड़ेगा।' },
        { t: 'say', text: '“Doctor और हमारी developmental team के assessment के अनुसार अभी [Child Name] की मुख्य प्राथमिकताएँ हैं — [Goal 1], [Goal 2], [Goal 3]। इन्हीं के लिए paper की 12 activities में से ये चुनी गई हैं —”' },
        { t: 'many', id: 'assignedActs', label: 'Assigned Activities (Therapy Module से, paper नंबर) — Step 05 में सिर्फ़ यही activities दिखेंगी', options: ACT_OPTIONS },
        { t: 'matrix', id: 'assignedTable', label: 'Assigned Activity — किस goal के लिए, Level', columns: [
          { id: 'activity', label: 'Assigned Activity (paper नंबर)', type: 'one', options: ACT_OPTIONS },
          { id: 'goal', label: 'किस goal के लिए', type: 'text' },
          { id: 'level', label: 'Level', type: 'text' },
        ], rows: [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }, { id: 'r3', label: '3' }, { id: 'r4', label: '4 (यदि)' }, { id: 'r5', label: '5 (यदि)' }] },
        { t: 'note', tone: 'rule', label: 'चुनने का नियम (paper)', text: 'शुरुआत में 3 activities काफ़ी हैं — कम से कम एक संवाद (1, 5), एक साझा खेल / नकल (2, 3, 4, 7, 10) और एक दैनिक जीवन (8, 9) की। बच्चे की व्यक्तिगत प्राथमिकताएँ सबसे ऊपर।' },
      ],
    },
    {
      title: 'STEP 04 — हर दिन कैसे करें — 5 नियम (paper)',
      blocks: [
        { t: 'say', text: [
          '“अब paper का ‘हर दिन कैसे करें’ वाला हिस्सा —',
          '• 3–5 activities — शुरू में 3 भी काफ़ी। हर एक का लगभग 3–8 मिनट का लचीला समय; बच्चे की रुचि और थकान के हिसाब से कम-ज़्यादा।',
          '• कम से कम एक संवाद, एक साझा खेल / नकल और एक दैनिक जीवन की activity।',
          '• लक्ष्य वही, खेल बदल सकते हैं — जैसे माँगना खिलौने से भी, पानी और खाने के समय भी।',
          '• शांत और सुरक्षित माहौल। बच्चे का इशारा, तस्वीर, आवाज़ या शब्द — कोई भी संवाद स्वीकार करें। ज़बरदस्ती eye contact, पकड़कर नकल या मजबूर करके बोलवाना नहीं।',
          '• बच्चा रोए, थके या असहज लगे — रोकें; अगली बार अभ्यास आसान करें।”',
        ].join('\n') },
        { t: 'list', id: 'dailyRulesTold', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          '3–5 activities, हर एक 3–8 मिनट',
          'संवाद + साझा खेल + दैनिक जीवन',
          'लक्ष्य वही, खेल बदलें',
          'हर तरह का संवाद स्वीकार; ज़बरदस्ती नहीं',
          'रोए / थके → रोकें, अगली बार आसान',
        ] },
      ],
    },
    {
      title: 'STEP 05 — Activity Training — एक-एक करके (सिर्फ़ assigned)',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'हर activity के 5 हिस्से: सामान · कैसे कराएँ · क्या देखें · अगला कदम · क्या न करें। हर activity के बाद parent से करके दिखवाएँ।' },
        { t: 'note', tone: 'rule', text: 'नीचे सिर्फ़ वही activities दिखती हैं जो Step 03 में Assigned चुनी गईं (Therapy Module के paper नंबर से) — बाकी छिपी रहती हैं। हर activity में ‘Explained’, ‘Parent ने करके दिखाया’ और ‘Parent Concern’ भरें।' },
      ],
    },
    ...ACTS.map(activitySection),
    {
      title: 'STEP 06 — एक activity ऐसे दिखती है — उदाहरण',
      time: '5 मिनट',
      blocks: [
        { t: 'say', text: [
          '“उदाहरण — ‘पसंद की चीज़ माँगना’ —',
          '1. बच्चे का पसंदीदा बिस्किट / खिलौना पारदर्शी डिब्बे में या ऊँची जगह पर, जहाँ वह देख सके पर खुद न ले सके।',
          '2. उसके सामने, आँखों के स्तर पर बैठिए। डिब्बा दिखाइए — और 3–5 सेकंड चुप रहकर इंतज़ार कीजिए।',
          '3. बच्चा हाथ बढ़ाए, इशारा करे, आवाज़ निकाले — तुरंत दीजिए और शब्द जोड़िए: ‘बिस्किट! तुमने माँगा!’',
          '4. कुछ न करे — तो उसका हाथ हल्का-सा डिब्बे की तरफ़ दिखाकर दे दीजिए; कोई डाँट नहीं।',
          '5. ऐसे 4–5 मौके, फिर activity ख़त्म — खुशी के पल पर।”',
        ].join('\n') },
      ],
    },
    {
      title: 'STEP 07 — 7-दिन का उदाहरण — बदल-बदलकर कराना',
      blocks: [
        { t: 'say', text: '“Paper में 7 दिन का एक उदाहरण है — हर दिन अलग-अलग activities, ताकि बच्चा बोर न हो और एक ही skill अलग-अलग खेल में आए। रविवार को बच्चे की पसंद की 3 activities, परिवार के साथ। यह सिर्फ़ उदाहरण है — [Child Name] की assigned activities के हिसाब से हम इसे बदलेंगे।”' },
        { t: 'matrix', id: 'weekPlan', label: 'दिन — Activity नंबर (paper उदाहरण) → बच्चे के लिए (assigned से)', columns: [
          { id: 'acts', label: 'बच्चे के लिए Activity नंबर (assigned से)', type: 'text' },
        ], rows: [
          { id: 'mon', label: 'सोमवार — paper: 1, 2, 3, 8' },
          { id: 'tue', label: 'मंगलवार — paper: 1, 4, 6, 9' },
          { id: 'wed', label: 'बुधवार — paper: 5, 2, 7, 8' },
          { id: 'thu', label: 'गुरुवार — paper: 1, 3, 10, 9' },
          { id: 'fri', label: 'शुक्रवार — paper: 5, 4, 6, 11' },
          { id: 'sat', label: 'शनिवार — paper: 1, 2, 7, 10' },
          { id: 'sun', label: 'रविवार — paper: बच्चे की पसंद की 3' },
        ] },
      ],
    },
    {
      title: 'STEP 08 — कौन-सी activity कब बदलें (paper)',
      blocks: [
        { t: 'say', text: [
          '“• बच्चा खुशी से भाग ले रहा है — उसी लक्ष्य पर कम से कम 1–2 हफ़्ते लगातार मौके दीजिए।',
          '• 3 बार से ज़्यादा तनाव या बार-बार असफलता — activity छोटी / आसान कीजिए, सामान बदलिए, या हमसे तकनीक पूछिए।',
          '• बच्चा खुद करने लगे — मदद कम कीजिए, फिर paper में लिखा ‘अगला कदम’ जोड़िए; उससे पहले FU में एक बार पुष्टि।',
          '• घर के सामान्य कामों में भी वही skill दोहराइए — सिर्फ़ मेज़ पर बैठाकर अभ्यास ज़रूरी नहीं।”',
        ].join('\n') },
        { t: 'list', id: 'changeRulesTold', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          'खुशी से कर रहा → 1–2 हफ़्ते वही',
          '3+ बार तनाव → आसान करें / पूछें',
          'खुद करे → मदद कम, अगला कदम (पुष्टि के बाद)',
          'रोज़ के कामों में दोहराव',
        ] },
      ],
    },
    {
      title: 'STEP 09 — साप्ताहिक प्रगति — सिर्फ़ 3 लक्ष्य',
      blocks: [
        { t: 'say', text: '“Paper में एक छोटी तालिका है — इस हफ़्ते के 3 लक्ष्य, शुरू में कैसा था और हफ़्ते के अंत में कैसा। गिनती में लिखिए — जैसे ‘5 मौकों में 2 बार इशारा किया’, ‘3 बार गेंद लौटाई’, ‘हाथ धोने के 2 चरण बिना मदद’। इससे छोटी-छोटी जीत दिखती है — और Follow-up में हम इसी को देखेंगे।”' },
        { t: 'list', id: 'progressTold', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          '3 लक्ष्य वाली तालिका दिखाई',
          'गिनती में लिखना (उदाहरण दिए)',
          'FU में साझा करना है',
        ] },
      ],
    },
    {
      title: 'STEP 10 — सावधानियाँ (paper)',
      blocks: [
        { t: 'say', text: [
          '“• छोटे हिस्से निगलने का जोखिम हो तो छोटे ब्लॉक / मोती न दें।',
          '• झूला, deep pressure, oral-motor, खाने की बनावट बदलना या संतुलन से जुड़ी विशेष activities — प्रशिक्षित विशेषज्ञ की सलाह के बिना न जोड़ें।',
          '• गंभीर व्यवहार बदलाव, दर्द या पहले से आती skill में कमी — doctor / therapist से संपर्क।”',
        ].join('\n') },
        { t: 'list', id: 'precautionsTold', label: 'Counsellor ने हर बिंदु बताया — ✓ करें', items: [
          'छोटे हिस्से / निगलने का जोखिम',
          'विशेष activities बिना विशेषज्ञ नहीं',
          'व्यवहार बदलाव / दर्द / skill में कमी → संपर्क',
        ] },
      ],
    },
    {
      title: 'STEP 11 — Parents की आम गलतियाँ + आम सवाल',
      blocks: [
        { t: 'info', head: ['आम गलती', 'सही तरीका'], rows: [
          ['हर activity को ‘पढ़ाई’ बना देना', 'खेल की तरह, हँसी-खुशी में'],
          ['बच्चे से हर बार ‘सही जवाब’ चाहना', 'कोशिश की तारीफ़ — इशारा भी जवाब है'],
          ['एक दिन में 8–10 activities', '3–5, छोटी-छोटी'],
          ['बोर होने पर भी वही खेल ज़बरदस्ती', 'लक्ष्य वही, खेल बदलें'],
          ['बच्चे की जगह खुद कर देना', 'इंतज़ार करें, सिर्फ़ ज़रूरी मदद'],
          ['दूसरे बच्चों से तुलना', 'सिर्फ़ अपने बच्चे की पिछली हफ़्ते से तुलना'],
          ['सिर्फ़ मेज़ पर बैठाकर', 'रोज़ के कामों में भी — खाना, नहाना, कपड़े'],
        ] },
        { t: 'info', head: ['सवाल', 'जवाब'], rows: [
          ['बच्चा activity में बैठता ही नहीं', '“1–2 मिनट से शुरू कीजिए, उसकी पसंद की चीज़ से। बैठना भी धीरे-धीरे बढ़ता है।”'],
          ['इतना समय कहाँ से लाएँ?', '“अलग समय नहीं चाहिए — खाने, नहाने, कपड़े पहनने के समय में ही 2–3 activities हो जाती हैं।”'],
          ['बच्चा कुछ नहीं कर रहा, बेकार लग रहा', '“पहले हफ़्ते में अक्सर बदलाव कम दिखता है। साप्ताहिक तालिका भरिए — FU में साथ देखेंगे; ज़रूरत हो तो activity बदलेंगे।”'],
          ['क्या ये therapy की जगह है?', '“नहीं — paper में भी लिखा है, यह व्यक्तिगत उपचार का विकल्प नहीं; यह घर पर रोज़ के मौके बढ़ाने के लिए है।”'],
        ] },
      ],
    },
    {
      title: 'STEP 12 — कौन करवाएगा और कब',
      blocks: [
        { t: 'note', tone: 'info', label: 'उद्देश्य', text: 'यही जानकारी आगे Daily Routine सेशन और Family Session 01 में Auto जाएगी (Carry Forward)।' },
        { t: 'one', id: 'activityPerson', label: '“घर पर ये activities मुख्य रूप से कौन करवाएगा?” (Carry Forward)', options: PERSON, other: 'अन्य' },
        { t: 'time', id: 'activityTime', label: '“दिन का कौन-सा समय सबसे सुविधाजनक रहेगा, जब बच्चा थका या भूखा न हो?” — समय (Carry Forward)' },
        { t: 'one', id: 'activitySlot', label: 'सुबह / दोपहर / शाम (ध्वनि-अनुकरण के 3 समय के साथ जोड़ सकते हैं)', options: ['सुबह', 'दोपहर', 'शाम'] },
      ],
    },
    {
      title: 'STEP 13 — Demonstration + Teach-Back',
      blocks: [
        { t: 'one', id: 'demoStatus', label: 'Demonstration Status', options: [
          'Clinic में दिखाई', 'Video Call पर — parent ने करके दिखाया', 'Pending → Therapist Training Task', 'Not Required',
        ] },
        { t: 'text', id: 'teachBackText', label: 'Teach-Back — “आज की पहली activity आप घर पर कैसे करेंगी — शुरू से बताइए; और बच्चा रोने लगे तो क्या करेंगी?” — Parent ने अपने शब्दों में क्या बताया', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back Result', options: ['सही बताया', 'आंशिक — दोबारा समझाया', 'समझ नहीं आया → Repeat Explanation Task'] },
      ],
    },
    {
      title: 'STEP 14 — समापन और अगला सेशन',
      blocks: [
        { t: 'say', text: [
          '“मैम, activities तय करना पहला कदम है — उन्हें घर पर सहज तरीके से अपनाना अगला। आप माली हैं — रोज़ के ये छोटे-छोटे पल ही इस पौधे का पानी हैं।”',
          '“हमारा अगला सेशन Parent Guidance & Integrated Daily Routine Session रहेगा। उसमें हम बात करेंगे कि [Child Name] को उसकी आज की क्षमता से कैसे समझें, परिवार की प्रतिक्रिया कैसी हो — और फिर सब कुछ एक दिनचर्या में जोड़ेंगे।”',
          '“हम एक-एक विषय अलग से लेकर चलते हैं, ताकि आप पर सारी बातें एक साथ याद रखने का दबाव न हो। आज के विषय में आपका कोई और सवाल है?”',
          '“बहुत धन्यवाद। अपना और [Child Name] का ध्यान रखिए।”',
        ].join('\n') },
        { t: 'link', id: 'nextLink', label: 'Next Session — MV-FCF-07 · Date / Time (Auto Schedule + Edit; WhatsApp reminder जाएगा)', code: 'FCF-07', options: ['Scheduled', 'Pending'] },
        { t: 'text', id: 'nextStaff', label: 'Staff' },
        { t: 'check', id: 'nextConfirmed', label: 'Parent ने confirm किया' },
      ],
    },
    {
      title: 'SESSION COMPLETION RULES & FINAL STATUS — MV-FCF-06',
      blocks: [
        B.taskRegister(3),
        { t: 'list', id: 'completionRules', label: 'Session Completion Rules — MV-FCF-06 (सब ✓ = Completed)', items: [
          'Health check + पिछले सेशन से जोड़',
          'सोच — सही जवाब नहीं, सुखद मौके',
          'बीज से वृक्ष — हर activity एक बीज',
          'Approved goals + assigned activities',
          'हर दिन के 5 नियम',
          'हर assigned activity के 5 हिस्से + parent ने करके दिखाया',
          'उदाहरण activity',
          '7-दिन उदाहरण',
          'कब बदलें',
          'साप्ताहिक प्रगति तालिका',
          'सावधानियाँ',
          'आम गलतियाँ + सवाल',
          'करवाने वाला + समय (Carry Forward)',
          'Demonstration Done / Task',
          'Teach-back सही',
          'अगला सेशन schedule',
        ] },
        { t: 'final', id: 'final', label: 'Final Session Status (एक चुनें)', options: [
          'Completed', 'Completed — Task Pending', 'Partially Completed → Reschedule remaining', 'Rescheduled', 'Not Applicable', 'Escalated — Clinical Review',
        ] },
        { t: 'text', id: 'remarks', label: 'Counsellor Remarks', long: true },
      ],
    },
  ],
};
