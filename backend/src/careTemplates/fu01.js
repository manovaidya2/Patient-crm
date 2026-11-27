// MV-FU-01 • पहला फॉलो-अप: Guidance & Step-by-Step Training (Day 20): Main Guidance Call — Family Session 01 में मिली बातों के हिसाब से parent को समझाना और कराना.
const B = require('./blocks');

const CONCERN = { id: 'safety', not: ['No New Concern'] };
const MED_OK = 'सभी शुरू और नियमित (→ अगले Step)';
const MED_PROBLEM = { id: 'medStatus', not: [MED_OK] };
const REDEMO = 'समझ नहीं आया → Therapist Re-demonstration Task';
const OTHER_ISSUE = 'अन्य issue (FS-01 से)';
const SUPPORT_NEEDED = 'Support Needed → Task (नीचे)';
const OPEN_ISSUE = ['Resolved', 'In Progress → Existing Task update', 'Unresolved → Escalate'];

const FUTURE_VISION_RULE = 'यह Medical Follow-up है — इसमें next phase या आगे की care की counselling नहीं होगी। Parent कोई सुधार बताए तो सिर्फ़ एक लाइन में सराहें: “यह बहुत अच्छा कदम है — [Child Name] के पौधे में नई पत्ती जैसा। Family Session में इसे और आगे जोड़ेंगे।” और CRM में ‘Parent-reported win’ नोट करें (FS में Auto जाएगा)।';

// STEP 05 guidance table: issue → क्यों होता है → घर पर 3 स्टेप → क्या न करें → कब clinic बुलाएँ.
const GUIDANCE_HEAD = ['Issue (FS-01 ✓)', 'क्यों होता है (सरल)', 'घर पर 3 स्टेप', 'क्या न करें', 'कब clinic बुलाएँ'];
const GUIDANCE = [
  ['Hyperactivity / बहुत भागना, चढ़ना',
    'बच्चे के शरीर-मन को ऊर्जा निकालने और शांत होने में कठिनाई — यह बदमाशी नहीं।',
    '1. रोज़ तय समय पर बाहर की गतिविधि (दौड़ना, चढ़ना, झूला) • 2. हर काम छोटा: 2–3 मिनट का काम, फिर खेल • 3. शांत होने की तय जगह / समय; screen सीमित',
    'डाँटना, पकड़कर बिठाना, एक साथ कई निर्देश',
    'चोट का ख़तरा, बाहर भाग जाना, नींद बहुत बिगड़ना'],
  ['Chewing / खाना, निवाले',
    'मुँह की माँसपेशियाँ, स्वाद-बनावट की संवेदनशीलता और पाचन — तीनों जुड़े हैं।',
    '1. तय समय पर मेज़ / कुर्सी पर, mobile-TV बंद • 2. जो खाता है उसके साथ एक नई चीज़ बहुत थोड़ी मात्रा में • 3. छोटे टुकड़े, हर कोशिश पर शाबाशी',
    'ज़बरदस्ती, screen का लालच, अकेले खाते छोड़ना (घुटन से सावधानी)',
    'बार-बार उबकाई / घुटन, वज़न गिरना, खाना पूरा मना'],
  ['Attention / बैठना',
    'ध्यान टिकना धीरे-धीरे बढ़ता है; शुरुआत छोटी अवधि से होती है।',
    '1. पसंदीदा activity 2 मिनट साथ बैठकर • 2. एक बार में एक निर्देश, छोटे शब्द + इशारा • 3. 2→3→5 मिनट धीरे-धीरे; पूरा होते ही शाबाशी',
    'अचानक लंबा समय, बीच-बीच में टोकना',
    'अचानक ध्यान / होश खो देना'],
  ['Speech / बोलना-समझना',
    'समझ, इशारे और आवाज़ चरणों में आती है; पहले जुड़ाव।',
    '1. आँख के स्तर पर एक-दो शब्द (“पानी”, “गेंद”) • 2. दो चीज़ें दिखाकर चुनने दें • 3. जवाब का 3–5 सेकंड इंतज़ार; कोशिश पर शाबाशी',
    '“बोलो-बोलो” का दबाव, बार-बार जाँचना',
    'सुनने की शंका → सुनने की जाँच (BERA) के लिए Doctor से पूछें'],
  ['Behaviour / ज़िद, गुस्सा, रोना',
    'बच्चा अपनी ज़रूरत या असहजता बता नहीं पा रहा।',
    '1. Trigger नोट करें (कब, कहाँ, पहले क्या हुआ) • 2. शांत रहें, कम बोलें, सुरक्षित जगह दें • 3. शांत होने पर इशारे / शब्द / चित्र से माँगना सिखाएँ',
    'मारना, चिल्लाना, उसी समय समझाना, चुप कराने को mobile देना',
    'ख़ुद को / दूसरों को चोट पहुँचाना'],
  ['Sleep / दिनचर्या',
    'नींद के बिना ध्यान, व्यवहार और पाचन सब बिगड़ते हैं।',
    '1. सोने-उठने का समय रोज़ एक जैसा • 2. सोने से 1 घंटा पहले screen बंद • 3. हल्की रात की दिनचर्या (शांत खेल, कहानी, गुनगुनी बातें)',
    'देर रात तक जगाए रखना',
    'बहुत लगातार नींद की समस्या, डरावने / दौरे जैसे संकेत'],
  ['Sensory / आवाज़, स्पर्श, कपड़े',
    'इंद्रियों से मिली जानकारी को सँभालने में कठिनाई।',
    '1. Trigger पहचानकर लिखें • 2. बहुत छोटी मात्रा से, बच्चे की रफ़्तार से परिचय • 3. आराम देने वाली चीज़ / जगह उपलब्ध',
    'ज़बरदस्ती संपर्क, अचानक तेज़ आवाज़',
    'बहुत ज़्यादा दर्द / घबराहट के संकेत'],
  ['Toilet / Self-care',
    'संकेत समझना और समय बाँधना सीखने से आता है।',
    '1. तय समय पर बैठाना; संकेत देखना • 2. सफल होने पर तुरंत शाबाशी • 3. गलती पर शांत रहें, कपड़े बदलें',
    'डाँट-फटकार, शर्मिंदा करना',
    'पेशाब-शौच में दर्द / रुकावट'],
];
const ISSUES = GUIDANCE.map((row) => row[0]);

const callInfo = B.callInfo();
callInfo.blocks.unshift({ t: 'note', tone: 'info', text: 'यह कॉल सामान्य “हाल-चाल” वाली नहीं है। Family Session 01 में विकास का सिस्टम (बच्चे में विकास कैसे होता है) समझाया जा चुका है और counsellor ने बच्चे की कमियाँ व parent की guidance-ज़रूरतें देखकर plan बनाया है। इस कॉल में उसी plan की हर बात parent को सरल भाषा में समझाई जाती है और स्टेप-बाय-स्टेप कराई जाती है — वही मुद्दे, जो FS-01 में tick हुए थे।' });

module.exports = {
  code: 'FU-01',
  key: 'MV-FU-01',
  version: 2,
  kind: 'followup',
  seq: 1,
  day: 20,
  title: 'पहला फॉलो-अप: Guidance & Step-by-Step Training',
  subtitle: 'Main Guidance Call • Family Session 01 में मिली बातों के हिसाब से — parent को समझाना और कराना • काउंसलर फ़ॉर्म — कॉल के साथ-साथ भरें',
  meta: [
    ['Template Code', 'MV-FU-01'],
    ['Scheduled', 'Day 20 (Family Session 01 के 5 दिन बाद)'],
    ['Target Duration', '15–20 मिनट'],
    ['Responsible', 'Trained Medical Counsellor'],
    ['Based On', 'Family Session 01 — Day 15 (observation + plan). पुराने FU-01 (Day 10) और FU-02 (Day 20) मिलाकर एक'],
    ['Next', 'Follow-up 02 — Day 50'],
    ['Status', 'Clinical approval required before implementation'],
    ['Clinic', 'बुधवार को क्लिनिक बंद • हेल्पलाइन: 8810627477 • www.manovaidya.org'],
  ],
  sections: [
    callInfo,
    {
      title: 'BEFORE CALL — STAFF PREPARATION (2 मिनट, कॉल से पहले)',
      blocks: [
        { t: 'note', tone: 'info', text: 'Family Session 01 का record खोलकर नीचे उतारें। यह सब पहले से दर्ज है — parent से दोबारा न पूछें। जो बात FS-01 में Clear हो चुकी है, उसके लिए इस कॉल में सिर्फ़ एक पुष्टि-वाक्य (“पिछली बार जो तय हुआ था, वह साफ़ है ना?”) काफ़ी है।' },
        { t: 'facts', id: 'prep', rows: [
          { id: 'openIssues', label: 'सभी Open Issues (सभी विभाग)', from: 'openIssues', hint: 'CRM Auto' },
          { id: 'childIssues', label: 'FS-01: बच्चे में देखी गई कमियाँ / issues (✓ वाली)', from: 'ans:FS-01:childIssues', hint: 'FS-01 Step 02' },
          { id: 'mainConcern', label: 'FS-01: parent की मुख्य परेशानी 1 / 2', from: 'ans:FS-01:mainConcern', hint: 'FS-01 Q1' },
          { id: 'concernWords', label: 'FS-01: परेशानी — parent के अपने शब्दों में', from: 'ans:FS-01:concernWords', hint: 'FS-01 Q1' },
          { id: 'goal', label: 'FS-01: Approved Goal + Functional Purpose', from: '', hint: 'Journey Card' },
          { id: 'papers', label: 'FS-01: Papers — Confusion / Missing / Not Explained', from: 'ans:FS-01:papersStatus', hint: 'FS-01 Step 05' },
          { id: 'homeActions', label: 'FS-01: Home Action 01 / 02', from: 'actions:FS-01', hint: 'FS-01 Step 06' },
          { id: 'teachBack', label: 'FS-01: Teach-Back Result', from: 'ans:FS-01:teachBack', hint: 'FS-01 Step 06' },
          { id: 'caregiver', label: 'FS-01: Caregiver', from: 'ans:FS-01:caregiver', hint: 'FS-01 Step 07' },
          { id: 'caregiverSupport', label: 'FS-01: अतिरिक्त support की ज़रूरत', from: 'ans:FS-01:caregiverSupport', hint: 'FS-01 Step 07' },
          { id: 'guidanceNeeds', label: 'FS-01: Parent Guidance की ज़रूरत (✓)', from: 'ans:FS-01:guidanceNeeds', hint: 'FS-01 Part C' },
          { id: 'medicine', label: 'Medicine Schedule', from: 'prescription', hint: 'CRM Auto' },
          { id: 'dispatch', label: 'अगली Refill / Dispatch तारीख', from: 'nextDispatch', hint: 'CRM Auto' },
        ] },
        { t: 'note', label: 'Rule', tone: 'rule', text: 'जो मुद्दे FS-01 में नहीं आए उन्हें नया न खोलें। नया diagnosis, नई assessment या नया goal इस कॉल में नहीं बनेगा। Parent की history और concern दोबारा न पूछें। मुद्दे 2–3 से ज़्यादा एक साथ न सिखाएँ — सबसे ज़रूरी पहले।' },
        { t: 'note', label: 'Future Vision Rule (इस कॉल में)', tone: 'info', text: FUTURE_VISION_RULE },
      ],
    },
    B.greeting({
      time: '30 सेकंड',
      say: [
        '“नमस्ते, मैं MANOVAIDYA Clinic से [Counsellor Name] बोल रही/रहा हूँ। क्या मेरी बात [Child Name] के मम्मी या पापा से हो रही है?”',
        '“पाँच दिन पहले हमारा Family Session हुआ था। आज हम उसी में तय हुई बातें आराम से, स्टेप-बाय-स्टेप समझेंगे और घर पर करना शुरू करेंगे। इसमें लगभग 15–20 मिनट लगेंगे — क्या अभी समय है?”',
      ].join('\n'),
    }),
    {
      title: 'STEP 02 — SAFETY SCREEN (सबसे पहले)',
      time: '30–40 सेकंड',
      blocks: [
        { t: 'say', text: '“Family Session के बाद बच्चे को कोई नई या बढ़ी हुई शारीरिक परेशानी हुई, या किसी दवाई से कोई तकलीफ़ हुई?”' },
        { t: 'one', id: 'safety', label: 'Safety', options: ['No New Concern', 'New Concern', 'Existing Concern Worsened'] },
        { t: 'triage', id: 'triage', label: 'Triage Level (एक चुनें)', show: CONCERN, levels: [
          { value: 'Emergency', timing: 'तुरंत — कॉल के दौरान', action: 'गंभीर एलर्जी, साँस की तकलीफ़, दौरे या दूसरे emergency संकेत: परिवार को तुरंत emergency medical care की सलाह और clinic escalation। आज की training रोक दें।' },
          { value: 'Urgent Doctor Review', timing: 'Clinical Lead के approved समय में (लक्ष्य: उसी दिन)', action: 'दवा के बाद नई / बढ़ी तकलीफ़, उल्टी, पेट ख़राब, एलर्जी, ज़्यादा सुस्ती, गंभीर नींद की समस्या, पानी की कमी, अचानक regression / skill का खोना: Doctor Review Task आज ही।' },
          { value: 'Routine Support', timing: '____ कार्यदिवस में', action: 'सिर्फ़ दवा देने की असुविधा / सामान्य सवाल। नया clinical symptom इस श्रेणी में नहीं आता।' },
        ] },
        { t: 'text', id: 'triageEscalateTo', label: 'Escalate किसे / कब', show: CONCERN },
        { t: 'note', tone: 'info', text: 'Task ID: Auto — Emergency या Urgent Doctor Review चुनने पर form save होते ही doctor को advice request अपने-आप जाती है (Task ID वहीं से)।', show: { id: 'triage', any: ['Emergency', 'Urgent Doctor Review'] } },
      ],
    },
    {
      title: 'STEP 03 — MEDICINE: शुरू हुई? नियमित? देने का तरीक़ा',
      time: '2–3 मिनट',
      blocks: [
        { t: 'facts', id: 'medInputs', rows: [
          { id: 'medTimes', label: 'Medicine slots / parent का समय', from: 'ans:FCF-02:medicineTimes', hint: 'FCF-02' },
          { id: 'nasyaHome', label: 'Nasya Home Start Allowed', from: 'ans:FCF-04:nasyaHomeStart', hint: 'FCF-04' },
        ] },
        { t: 'say', text: '“सभी निर्धारित दवाइयाँ शुरू हो गई हैं ना, और तय समय पर दे पा रहे हैं? देने में कोई परेशानी या बच्चा मना करता है?”' },
        { t: 'many', id: 'medStatus', label: 'Medicine', options: [MED_OK, 'कोई दवाई शुरू नहीं हुई', 'कभी-कभी छूटती है', 'बच्चा लेने से मना करता है', 'समय / slot उलझ रहा', 'Prescription समझ नहीं आई', 'दवा रुकी / ख़त्म होने वाली'] },
        { t: 'many', id: 'medSlots', label: 'सिर्फ़ यदि परेशानी हो — कौन सा slot', options: ['M1 सुबह खाली पेट', 'M2 सुबह–शाम', 'M3 दोपहर–रात', 'M4 रात', 'M5 Nasya', 'M6 बाहरी तेल'], show: MED_PROBLEM },
        { t: 'matrix', id: 'medIssues', label: 'दवा की परेशानी', show: MED_PROBLEM, columns: [
          { id: 'slot', label: 'कौन सी दवाई / slot', type: 'text' },
          { id: 'gap', label: 'कमी क्या है (parent के शब्दों में)', type: 'text' },
          { id: 'help', label: 'कैसे सहायता दी (approved तरीक़ा)', type: 'text' },
        ], rows: [{ id: 'r1', label: '1' }, { id: 'r2', label: '2' }] },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'दवा की मात्रा, समय या दवा का नाम अपनी तरफ़ से नहीं बदलना। सिर्फ़ prescription के अनुसार सरल तरीक़े बताएँ (जैसे समय का रिमाइंडर, दवा की slot-वार रखाई) और ज़रूरत हो तो Doctor / Pharmacy को Task दें।' },
        { t: 'auto', id: 'refillDate', label: 'अगली Refill तारीख', from: 'nextDispatch', hint: 'CRM Auto' },
      ],
    },
    {
      title: 'STEP 04 — आज की बातचीत का रास्ता (1 मिनट रिकैप)',
      time: 'विकास-सिस्टम FS-01 में समझाया जा चुका है',
      blocks: [
        { t: 'say', text: '“Family Session में हमने देखा था कि बच्चे का विकास बीज से वृक्ष की तरह चरणों में होता है, हर क्षेत्र की अपनी गति से। उसी में आपके बच्चे के लिए हमने [Approved Goal] चुना था, ताकि [Functional Purpose] में उसे मदद मिले। आज हम वही बातें, एक-एक करके, घर पर करने के तरीक़े में बदलेंगे।”' },
        { t: 'one', id: 'recap', label: 'रिकैप', options: ['Parent को रिकैप स्पष्ट है', 'थोड़ी और व्याख्या चाहिए (नीचे लिखें)'] },
        { t: 'text', id: 'recapQuestion', label: 'Parent का सवाल / ज़रूरी बात', long: true },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: '“छह महीने में पूरा ठीक हो जाएगा” जैसा कोई वादा न करें। Autism को “cured” न कहें। गति हर बच्चे की अलग है; परिणाम की guarantee न दें।' },
      ],
    },
    {
      title: 'STEP 05 — Parent Guidance: बच्चे की कमियों के हिसाब से',
      time: 'मुख्य हिस्सा • 6–8 मिनट',
      blocks: [
        { t: 'note', label: 'कैसे करें', tone: 'info', text: 'FS-01 में जिन issues पर ✓ है, सिर्फ़ उन्हीं की पंक्ति देखें (अधिकतम 2–3, सबसे ज़रूरी पहले)। हर issue में चार बातें बोलें: क्यों होता है → घर पर 3 स्टेप → क्या न करें → कब clinic बुलाएँ। नीचे की भाषा सिर्फ़ संकेत है; Clinical Lead के approved paper की भाषा ही बोलें।' },
        { t: 'auto', id: 'fs01Issues', label: 'FS-01 में ✓ issues', from: 'ans:FS-01:childIssues', hint: 'FS-01 Step 02' },
        { t: 'many', id: 'issuesToday', label: 'आज किन issues पर guidance दी (FS-01 ✓ वाले — अधिकतम 2–3, सबसे ज़रूरी पहले) — चुने गए issue की पंक्ति नीचे दिखेगी', options: [...ISSUES, OTHER_ISSUE], other: OTHER_ISSUE },
        ...GUIDANCE.map((row) => ({ t: 'info', head: GUIDANCE_HEAD, rows: [row], show: { id: 'issuesToday', any: [row[0]] } })),
      ],
    },
    {
      title: 'STEP 06 — स्टेप-बाय-स्टेप अभ्यास और Teach-Back',
      time: '3–4 मिनट',
      blocks: [
        { t: 'say', text: '“अब हम इनमें से सबसे ज़रूरी बात को अभी एक बार साथ करके देखते हैं। मैं बोलूँगी/बोलूँगा कि कैसे करना है, फिर आप अपने शब्दों में बताइए कि घर पर कैसे करेंगे।”' },
        { t: 'matrix', id: 'ladder', label: '5 दिन की सीढ़ी — parent का Reminder Card (approved paper से भरें, बोलकर समझाएँ)', columns: [
          { id: 'issue', label: 'Issue / Home Action', type: 'text' },
          { id: 's1', label: 'दिन 1–2: स्टेप 1', type: 'text' },
          { id: 's2', label: 'दिन 3–4: स्टेप 2', type: 'text' },
          { id: 's3', label: 'दिन 5+: स्टेप 3', type: 'text' },
          { id: 'when', label: 'कब / कितनी देर · कौन करवाएगा', type: 'text' },
        ], rows: [{ id: 'i1', label: '1.' }, { id: 'i2', label: '2. (ज़रूरत हो तभी)' }] },
        { t: 'say', text: 'Q1 “मैंने जो बताया, उसमें से आप घर पर कल सबसे पहले क्या करेंगे, और कैसे?”' },
        { t: 'text', id: 'teachBackText', label: 'Parent ने जो बताया (संक्षेप में)', long: true },
        { t: 'one', id: 'teachBack', label: 'Teach-Back', options: ['सही बताया', 'आंशिक — दोबारा समझाया', REDEMO] },
        { t: 'note', tone: 'warn', text: 'Therapist Re-demonstration Task नीचे Task Register (Step 08) में Owner और Due Date के साथ दर्ज करें।', show: { id: 'teachBack', any: [REDEMO] } },
        { t: 'one', id: 'homeDifficulty', label: 'Q2 “इसे घर पर करने में सबसे ज़्यादा कठिनाई किस बात की आ सकती है?” (Single Select)', options: ['तरीक़ा साफ़ नहीं', 'बच्चा रुचि नहीं लेगा', 'बच्चा असहज होगा', 'समय की कमी', 'सामान नहीं', 'कोई कठिनाई नहीं', 'अन्य'], other: 'अन्य' },
        { t: 'note', label: 'Staff Rule', tone: 'rule', text: 'फ़ोन पर बोलकर तरीक़ा बताना “Demonstration Completed” नहीं है — वह Verbal Understanding है। Practical demonstration clinic / video पर हो तब ही Done। एक बार में 2–3 से ज़्यादा activities न जोड़ें।' },
      ],
    },
    {
      title: 'STEP 07 — Papers और Parent Guidance (सिर्फ़ जो FS-01 में flagged था)',
      time: '2 मिनट',
      blocks: [
        { t: 'note', tone: 'info', text: 'जो paper FS-01 में “Delivered & Clear” था, उसे दोबारा न पूछें। जिस पर ✓ (Confusion / Missing / Not Explained) था, आज उसे समझाएँ।' },
        { t: 'auto', id: 'papersFlagged', label: 'FS-01 Papers Status', from: 'ans:FS-01:papersStatus', hint: 'FS-01 Step 05' },
        { t: 'matrix', id: 'papers', label: 'Papers', columns: [
          { id: 'flagged', label: 'FS-01 में flagged', type: 'check' },
          { id: 'explained', label: 'आज समझाया', type: 'check' },
          { id: 'understanding', label: 'Parent की समझ', type: 'one', options: ['Clear', 'Partial'] },
          { id: 'task', label: 'Task (अगर Missing)', type: 'text' },
        ], rows: [
          { id: 'medicine', label: 'Medicine Paper' },
          { id: 'diet', label: 'Diet Plan' },
          { id: 'marma', label: 'Marma Points Guidance' },
          { id: 'guidance', label: 'Parent Guidance' },
          { id: 'homeTherapy', label: 'Home Therapy / Special Training Paper' },
        ] },
        { t: 'note', label: 'Open Issue (किसी भी विभाग का) बचा हो तो', tone: 'info', text: 'Unresolved → Escalate' },
        { t: 'say', text: '“पिछली बार जो [Issue] बताई गई थी, उसकी अब क्या स्थिति है?”' },
        { t: 'one', id: 'openIssue', label: 'Open Issue', options: OPEN_ISSUE },
        { t: 'text', id: 'openIssueRef', label: 'Open Issue / Task ID (CRM Register से)', show: { id: 'openIssue', any: OPEN_ISSUE } },
      ],
    },
    {
      title: 'STEP 08 — Parent का सहयोग और समापन',
      time: '2 मिनट',
      blocks: [
        { t: 'one', id: 'support', label: 'Q3 “इन सबके अलावा कोई ज़रूरी बात है जिसमें हमारी टीम की सहायता चाहिए?” (Single Select)', options: ['No Further Support', SUPPORT_NEEDED] },
        { ...B.taskRegister(3), label: 'Support / Task — Department / Owner — Task ID — Due (हर पंक्ति = एक Task)' },
        { t: 'say', text: '“आज हमने दो बातें तय कीं — [Issue 1] और [Issue 2], और उन्हें करने के तीन स्टेप। अगले कुछ दिन सिर्फ़ यही कीजिए, ज़्यादा नहीं। हर दिन बच्चे की एक छोटी बात नोट कर लीजिए — बस कॉपी में दो पंक्तियाँ। अगला मेडिकल फॉलो-अप लगभग Day 50 पर रहेगा और पहला Development Tracker लगभग Day 60 पर — उसकी तैयारी हम अलग से बताएँगे। इस बीच कोई नई या बढ़ती हुई परेशानी, दवा से तकलीफ़ या safety की चिंता हो तो इंतज़ार न करें, clinic से संपर्क करें; emergency हो तो तुरंत नज़दीकी अस्पताल जाएँ।”' },
        { t: 'one', id: 'verify', label: 'Verify: “क्या आपको साफ़ है कि घर पर क्या करना है और किस परेशानी में तुरंत संपर्क करना है?”', options: ['Clear', 'Needs Clarification'] },
        { t: 'link', id: 'fu02Link', label: 'Follow-up 02 (Day 50)', code: 'FU-02', options: ['Scheduled', 'Pending'] },
        { t: 'link', id: 'dt01Link', label: 'Development Tracker 01 (≈ Day 60)', code: 'DT-01', options: ['Planned', 'Scheduling Pending'] },
        { t: 'final', id: 'final', label: 'CALL OUTCOME (एक चुनें)', options: ['Completed — Parent समझ गए', 'Completed — Support Task Assigned', 'Doctor Review Required', 'Urgent Clinical Escalation', 'Rescheduled', 'Therapist Re-demo Pending'] },
        { t: 'text', id: 'parentWin', label: 'Parent-reported win (Future Vision Rule — सिर्फ़ अगर parent ने कोई सुधार बताया; FS में Auto जाएगा)', long: true },
        { t: 'text', id: 'counsellorNotes', label: 'काउंसलर के नोट्स', long: true },
        { t: 'text', id: 'parentFeedback', label: 'Parent से शिकायत / सुझाव (अगर दिया)', long: true },
      ],
    },
  ],
};
