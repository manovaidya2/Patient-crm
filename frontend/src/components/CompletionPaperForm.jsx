const COMPLETION_PDF_CSS = `
  @page { size: A4; margin: 10mm 8mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #273238;
    font-family: "Nirmala UI", "Mangal", Arial, sans-serif;
    font-size: 11px;
    line-height: 1.35;
  }
  .pdf-print-page { width: 194mm; margin: 0 auto; }
  .pdf-paper-scroll { max-height: none !important; overflow: visible !important; border: 0 !important; background: #ffffff !important; padding: 0 !important; box-shadow: none !important; }
  .pdf-sheet { border: 1px solid rgba(39, 50, 56, 0.65); background: #fffdf8; }
  .pdf-title-bar { background: #273238; color: #fffdf8; padding: 10px 12px; text-align: center; }
  .pdf-title-brand { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: 3px; }
  .pdf-title-main { margin: 4px 0 0; font-size: 15px; font-weight: 800; text-transform: uppercase; }
  .pdf-title-sub { margin: 4px 0 0; font-size: 10px; color: rgba(255, 253, 248, 0.82); }
  .pdf-family-intro { border-bottom: 1px solid rgba(39, 50, 56, 0.45); padding: 8px 10px; font-size: 11px; }
  .pdf-family-intro p { margin: 0 0 3px; }
  .pdf-family-intro p:first-child { font-weight: 700; }
  .pdf-meta-grid { display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid rgba(39, 50, 56, 0.45); font-size: 11px; }
  .pdf-meta-label, .pdf-meta-grid > div:nth-child(odd) { background: #efe3cf; border-right: 1px solid rgba(39, 50, 56, 0.35); padding: 7px 8px; font-weight: 700; }
  .pdf-meta-value-wrap { padding: 7px 10px; }
  .pdf-meta-grid > div:nth-child(n+3) { border-top: 1px solid rgba(39, 50, 56, 0.35); }
  .pdf-meta-value { min-height: 28px; border-bottom: 1px solid rgba(39, 50, 56, 0.35); padding: 4px 4px 5px; font-size: 12px; font-weight: 700; }
  .pdf-section-title { background: #273238; color: #fffdf8; padding: 6px 9px; font-size: 11px; font-weight: 800; }
  .pdf-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; page-break-inside: auto; }
  .pdf-table tr { page-break-inside: avoid; break-inside: avoid; }
  .pdf-table th { background: #efe3cf; border: 1px solid rgba(39, 50, 56, 0.35); padding: 7px 8px; text-align: left; font-weight: 800; }
  .pdf-table td { border: 1px solid rgba(39, 50, 56, 0.25); padding: 7px 8px; vertical-align: top; }
  .pdf-point-label { font-weight: 800; }
  .pdf-row-list { border-top: 1px solid rgba(39, 50, 56, 0.12); }
  .pdf-line-record { display: grid; grid-template-columns: 240px 1fr; gap: 8px; padding: 8px; border-bottom: 1px solid rgba(39, 50, 56, 0.25); font-size: 11px; page-break-inside: avoid; break-inside: avoid; }
  .pdf-line-record p { margin: 0; font-weight: 800; }
  .pdf-template { display: grid; gap: 4px; }
  .pdf-template-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-height: 22px; color: rgba(39, 50, 56, 0.76); }
  .pdf-template-line span { white-space: pre-wrap; }
  .pdf-blank {
    height: 22px;
    min-width: 64px;
    flex: 1 1 64px;
    border: 0;
    border-bottom: 1px solid rgba(39, 50, 56, 0.38);
    background: transparent;
    color: #273238;
    font-size: 11px;
    padding: 0 4px;
    outline: 0;
  }
  .pdf-choice { display: inline-flex; align-items: center; gap: 3px; color: rgba(39, 50, 56, 0.78); }
  .pdf-check { width: 12px; height: 12px; margin: 0; accent-color: #1a73e8; }
  .pdf-notes-wrap { border-top: 1px solid rgba(39, 50, 56, 0.25); padding: 9px; }
  .pdf-notes {
    width: 100%;
    min-height: 120px;
    border: 1px solid rgba(39, 50, 56, 0.3);
    background: transparent;
    color: #273238;
    padding: 9px;
    resize: none;
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
  }
  .pdf-rule { border-top: 1px solid rgba(39, 50, 56, 0.45); padding: 8px; font-size: 10px; color: rgba(39, 50, 56, 0.68); }
`;

const getCompletionPdfHtml = (node) => {
  if (!node) return '';
  const clone = node.cloneNode(true);
  const sourceFields = node.querySelectorAll('input, textarea, select');
  const cloneFields = clone.querySelectorAll('input, textarea, select');

  sourceFields.forEach((source, index) => {
    const target = cloneFields[index];
    if (!target) return;
    target.removeAttribute('placeholder');

    if (source.type === 'checkbox') {
      if (source.checked) target.setAttribute('checked', 'checked');
      else target.removeAttribute('checked');
      return;
    }

    if (source.tagName === 'TEXTAREA') {
      target.textContent = source.value;
      return;
    }

    if (source.tagName === 'SELECT') {
      [...target.options].forEach((option, optionIndex) => {
        if (source.options[optionIndex]?.selected) option.setAttribute('selected', 'selected');
        else option.removeAttribute('selected');
      });
      return;
    }

    target.setAttribute('value', source.value || '');
  });

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${COMPLETION_PDF_CSS}</style></head><body><main class="pdf-print-page">${clone.innerHTML}</main></body></html>`;
};

const familySectionAFields = [
  ['दवा / Formulation', 'नाम/पैक, समय/मात्रा, पालन, Miss/बाधा/नोट'],
  ['दवा लेने में दिक्कत', 'मना, थूका/उल्टी, निगलना/चबाना, कितनी बार, क्या हुआ/कब'],
  ['नस्य', 'समय/तरीका, नियमित/कुछ/नहीं, Miss/बाधा/नोट'],
  ['मालिश / अभ्यंग', 'तेल/जगह, दिन/मिनट, Miss/बाधा/नोट'],
  ['लेप / भाप', 'यदि लिखी हो, तरीका, दिन/मिनट, Miss/बाधा/नोट'],
  ['ॐकार / शांत श्वास', 'बार/दिन x मिनट, नियमित/कुछ/नहीं, बच्चा कैसे जुड़ा'],
  ['मर्म / Acupressure', 'जगह/तरीका, दिन/मिनट, Miss/बाधा/नोट'],
  ['उबला गुनगुना पानी', 'घूंट-घूंट, मात्रा, पूरा/कम/नहीं, Miss/बाधा'],
  ['डाइट / बाहर का चीज', 'मना/बाहर क्या, गलत/बाहर बार, क्या'],
  ['खाना / भूख', 'पेट भर/कम/अधिक, रुचि/नापसंद, भोजन Miss, उदाहरण/बाधा'],
  ['पेट साफ / Digestion', 'साफ/कब्ज/गैस/दर्द/उल्टी, दिक्कत, clinic informed/time'],
  ['थेरेपी / Home Practice', 'Command, Communication, Eye contact, Fine force, Behaviour, दिन/मिनट, Miss/उदाहरण'],
];

const followupSectionFields = {
  'A. Back Slide / Therapy / Caregiver Compliance': [
    ['1. Medicine routine', 'दवा prescribed? No/Yes, taken, missed, issue'],
    ['2. Diet routine', 'Diet follow हुआ? No/Partial/Yes, issue'],
    ['3. Sleep routine', 'Sleep routine follow हुआ? No/Partial/Yes, issue'],
    ['4. Screen / routine', 'Screen/routine control, issue, action'],
    ['5. Home practice', 'Practice done, duration, missed reason'],
  ],
  'B. New Problem Check': [
    ['6. New symptom', 'कोई new symptom? No/Yes, detail'],
    ['7. Improvement', 'कोई improvement? Detail'],
    ['8. Emergency concern', 'Emergency/severe issue? No/Yes, detail'],
  ],
  'C. Therapy & School Compliance': [
    ['16. Speech Therapy prescribed?', 'No/Yes, Advised, Attended, Missed'],
    ['17. Occupational Therapy prescribed?', 'No/Yes, Advised, Attended, Missed'],
    ['18. Behavioural / Special Education sessions', 'Advised, Attended, Missed'],
    ['19. School routine regular?', 'Yes/Partial/No/N/A, Attendance/routine issue'],
  ],
  'D. Parent / Caregiver Compliance': [
    ['20. Parents routine follow कर रहे हैं?', 'Yes/Partial/No, Difference'],
    ['21. Grandparents / other caregivers plan disturb कर रहे हैं?', 'No/Yes, Issue'],
    ['22. Parents को instructions समझने में confusion है?', 'No/Yes, कौन-सी instruction'],
    ['23. Prescribed step practically करने में difficulty है?', 'No/Yes, कौन-सा'],
    ['24. आज सबसे ज्यादा क्या miss हो रहा है?', 'Medicine/Diet/Therapy/Exercise/Sleep/Screen/Routine/Other'],
    ['25. Miss होने का मुख्य कारण', 'भूलना/समय की कमी/Caregiver unavailable/Instruction clear नहीं/Child tolerance difficulty/Other'],
  ],
  'E. केवल New / Extra Problem Check': [
    ['26. कोई physical problem?', 'No/Yes, Detail'],
    ['27. नई sleep / feeding / toilet concern?', 'No/Yes, Detail'],
    ['28. कोई unusual physical complaint?', 'No/Yes, Detail'],
    ['29. कोई अचानक severe behaviour / safety concern?', 'No/Yes, Detail'],
    ['30. कोई नई बात जिसके लिए doctor review चाहिए?', 'No/Yes, Detail'],
  ],
  'F. Staff Action & Accountability - Mandatory': [
    ['A. आज सबसे बड़ी compliance problem', 'Write problem'],
    ['B. किसकी responsibility है?', 'Mother/Father/Caregiver/Therapist/Clinic/Other'],
    ['C. आज क्या corrective action दिया?', 'Write action'],
    ['D. अगली follow-up में सबसे पहले क्या verify करना है?', 'Write verification point'],
    ['Repeated Non-Compliance & Closure', 'No/2nd Time/3rd Time or More, Senior/Doctor informed, Compliance status, Next priority'],
  ],
};

const paperFamilySectionAFields = [
  ['दवा / Formulation', 'नाम/पैक: ____\nसमय/मात्रा: ____', '□ पूरा\n□ कुछ  □ नहीं', 'Miss: ___ | माध्यम: ___\n□ गुनगुना □ सामान्य □ ठंडा □ अन्य'],
  ['दवा लेने में दिक्कत', '□ मना  □ थूका/उल्टी\n□ निगलना/चबाना □ नहीं', 'कितनी बार: ____', 'क्या हुआ / कब: ____'],
  ['नस्य', 'समय/तरीका: ____', '□ नियमित\n□ कुछ  □ नहीं', 'Miss: ___ | बाधा/नोट: ____'],
  ['मालिश / अभ्यंग', 'तेल/जगह: ____', '___ दिन\n___ मिनट', 'Miss: ___ | बाधा/नोट: ____'],
  ['लेप / भाप', 'यदि लिखी हो | तरीका: ____', '___ दिन\n___ मिनट', 'Miss: ___ | बाधा/नोट: ____'],
  ['ॐकार / शांत श्वास', '___ बार/दिन x ___ मिनट', '□ नियमित\n□ कुछ  □ नहीं', 'Miss: ___ | बच्चा कैसे जुड़ा: ____'],
  ['मर्म / Acupressure', 'जगह/तरीका: ____', '___ दिन\n___ मिनट', 'Miss: ___ | बाधा/नोट: ____'],
  ['उबला गुनगुना पानी', 'घूंट-घूंट | मात्रा: ____', '□ पूरा\n□ कम  □ नहीं', 'Miss: ___ | बाधा: ____'],
  ['डाइट / बाहर की चीज', 'मना/बाहर क्या: ____', '□ पूरा\n□ कुछ  □ नहीं', 'गलत/बाहर: ___ बार | क्या: ____'],
  ['खाना / भूख', '□ पेट भर  □ कम  □ अधिक\n□ रुचि भोजन', 'भोजन Miss: ____', 'उदाहरण/बाधा: ____'],
  ['पेट साफ / Digestion', '□ साफ  □ कब्ज  □ गैस\n□ दस्त  □ दर्द', 'दिक्कत: ___ दिन', 'Clinic informed: □ नहीं □ हां | समय: ____'],
  ['थेरेपी / Home Practice', '□ Command □ Communication\n□ Eye contact □ Fine force □ Behaviour', '___ दिन\n___ मिनट', 'Miss: ___ | वास्तविक उदाहरण: ____'],
];

const paperFamilySectionBFields = [
  ['सबसे उपयोगी सुधार', 'वास्तविक उदाहरण: ____'],
  ['मुख्य दिक्कत / नया लक्षण', 'क्या/कब से: ____  □ Clinic informed  □ Doctor handover'],
  ['अगली अवधि के 2 लक्ष्य', '1) ____  2) ____  | जिम्मेदार: ____'],
];

const paperFollowupSectionFields = {
  'A. दवा, घरेलू प्रक्रियाएं, डाइट एवं दैनिक अभ्यास': paperFamilySectionAFields,
  'B. बदलाव, Clinical Concern एवं अगला Plan': paperFamilySectionBFields,
  'C. Therapy & School Compliance': [
    ['16. Speech Therapy prescribed है?', '□ No □ Yes   Advised: ____   Attended: ____   Missed: ____'],
    ['17. Occupational Therapy prescribed है?', '□ No □ Yes   Advised: ____   Attended: ____   Missed: ____'],
    ['18. Behavioural / Special Education sessions', 'Advised: ____   Attended: ____   Missed: ____'],
    ['19. School routine regular है?', '□ Yes □ Partial □ No □ N/A   Attendance/routine issue: ____'],
  ],
  'D. Parent / Caregiver Compliance': [
    ['20. Parents दोनों एक ही routine follow कर रहे हैं?', '□ Yes □ Partial □ No   Difference: ____'],
    ['21. Grandparents / other caregivers plan को disturb कर रहे हैं?', '□ No □ Yes   Issue: ____'],
    ['22. Parents को किसी instruction को समझने में confusion है?', '□ No □ Yes   कौन-सी instruction: ____'],
    ['23. किसी prescribed step को practically करने में difficulty है?', '□ No □ Yes   कौन-सा: ____'],
    ['24. घर पर सबसे ज्यादा क्या miss हो रहा है?', '□ Medicine □ Diet □ Therapy □ Exercise □ Sleep □ Screen □ Routine □ Other ____'],
    ['25. Miss होने का मुख्य कारण', '□ भूलना □ समय की कमी □ Caregiver unavailable □ Instruction clear नहीं □ Child tolerance difficulty □ Other ____'],
  ],
  'E. केवल NEW / EXTRA Problem Check': [
    ['26. नई physical problem?', '□ No □ Yes   Detail: ____'],
    ['27. नई sleep / feeding / toilet concern?', '□ No □ Yes   Detail: ____'],
    ['28. कोई unusual physical complaint?', '□ No □ Yes   Detail: ____'],
    ['29. कोई अचानक severe behaviour / safety concern?', '□ No □ Yes   Detail: ____'],
    ['30. कोई नई बात जिसके लिए doctor review चाहिए?', '□ No □ Yes   Detail: ____'],
  ],
  'F. Staff Action & Accountability - Mandatory': [
    ['A. आज सबसे बड़ी compliance problem', '____'],
    ['B. किसकी responsibility है?', '□ Mother □ Father □ Caregiver □ Therapist □ Clinic □ Other'],
    ['C. आज क्या corrective action दिया?', '____'],
    ['D. अगली follow-up में सबसे पहले क्या verify करना है?', '____'],
    ['Repeated Non-Compliance & Closure', 'इस follow-up में भी miss था? □ No □ 2nd Time □ 3rd Time or More   Senior/Doctor informed: □ Yes □ No   □ Good Compliance □ Partial Compliance □ Major Missing Points   Next follow-up priority: ____'],
  ],
};

const createEmptyCompletionForm = (formType) => {
  const sections =
    formType === 'family_section_a'
      ? { 'A. दवा, घरेलू प्रक्रियाएं, डाइट एवं दैनिक अभ्यास': paperFamilySectionAFields }
      : paperFollowupSectionFields;
  return Object.entries(sections).reduce((acc, [section, fields]) => {
    acc[section] = fields.reduce((fieldAcc, [label]) => ({ ...fieldAcc, [label]: '' }), {});
    return acc;
  }, { 'Additional Notes / अतिरिक्त नोट': { Notes: '' } });
};

const getCompletionPlaceholder = (formType, label) => {
  const fields = formType === 'family_section_a' ? paperFamilySectionAFields : Object.values(paperFollowupSectionFields).flat();
  return fields.find(([field]) => field === label)?.[1] || 'Fill details';
};

const getPaperRowCells = (formType, label) => {
  const fields = formType === 'family_section_a' ? paperFamilySectionAFields : Object.values(paperFollowupSectionFields).flat();
  const row = fields.find(([field]) => field === label) || [];
  return {
    method: row[1] || '',
    compliance: row[2] || '',
    note: row[3] || 'Fill details',
  };
};

const flattenCompletionSummary = (formData) =>
  Object.entries(formData)
    .flatMap(([section, fields]) => [
      section,
      ...Object.entries(fields || {}).map(([label, value]) => {
        if (value && typeof value === 'object') {
          const checked = Object.entries(value.checks || {})
            .filter(([, isChecked]) => isChecked)
            .map(([name]) => name)
            .join(', ');
          const blanks = Object.entries(value.blanks || {})
            .map(([name, blankValue]) => `${name}: ${blankValue || '-'}`)
            .join(', ');
          return `${label}: ${[checked && `Checked: ${checked}`, blanks].filter(Boolean).join(' | ') || '-'}`;
        }
        return `${label}: ${value || '-'}`;
      }),
    ])
    .join('\n');

const PaperLineInput = ({ value, placeholder, onChange }) => (
  <textarea
    rows={1}
    value={value}
    placeholder={placeholder}
    onChange={onChange}
    className="min-h-[32px] w-full resize-y border-0 border-b border-charcoal/35 bg-transparent px-1 py-1 text-[12px] leading-snug text-charcoal placeholder:text-charcoal/35 focus:border-sage focus:outline-none focus:ring-0"
  />
);

const toPaperCellValue = (value) =>
  value && typeof value === 'object' ? value : { checks: {}, blanks: {}, note: value || '' };

const PaperFillableText = ({ text, value, onChange }) => {
  const paperValue = toPaperCellValue(value);
  let blankIndex = 0;
  const lines = String(text || '').split('\n');

  const setCheck = (label, checked) => {
    onChange({
      ...paperValue,
      checks: { ...(paperValue.checks || {}), [label]: checked },
    });
  };

  const setBlank = (key, blankValue) => {
    onChange({
      ...paperValue,
      blanks: { ...(paperValue.blanks || {}), [key]: blankValue },
    });
  };

  const renderLine = (line, lineIndex) => {
    const checkboxParts = line.split(/(?=□|â–¡)/g).filter(Boolean);
    if (checkboxParts.length > 1 || /^[□â]/.test(line.trim())) {
      return (
        <div key={lineIndex} className="flex flex-wrap gap-x-3 gap-y-1">
          {checkboxParts.map((part, partIndex) => {
            const label = part.replace(/^(□|â–¡)\s*/, '').trim();
            if (!label) return null;
            return (
              <label key={`${lineIndex}-${partIndex}`} className="inline-flex items-center gap-1 text-[11px] text-charcoal/75">
                <input
                  type="checkbox"
                  checked={!!paperValue.checks?.[label]}
                  onChange={(event) => setCheck(label, event.target.checked)}
                  className="h-3 w-3 rounded border-charcoal/35 text-sage focus:ring-sage"
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    const segments = line.split(/(___+)/g);
    return (
      <div key={lineIndex} className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-charcoal/75">
        {segments.map((segment, segmentIndex) => {
          if (!/^___+$/.test(segment)) return <span key={segmentIndex}>{segment}</span>;
          const blankKey = `${lineIndex}-${blankIndex++}`;
          return (
            <input
              key={segmentIndex}
              value={paperValue.blanks?.[blankKey] || ''}
              onChange={(event) => setBlank(blankKey, event.target.value)}
              className="h-6 min-w-[64px] flex-1 border-0 border-b border-charcoal/35 bg-transparent px-1 text-[11px] text-charcoal focus:border-sage focus:outline-none focus:ring-0"
            />
          );
        })}
      </div>
    );
  };

  return <div className="space-y-1">{lines.map(renderLine)}</div>;
};

const PaperFillableTemplate = ({ text, value, onChange }) => {
  const paperValue = toPaperCellValue(value);
  const lines = String(text || '').split('\n');

  const setCheck = (label, checked) => {
    onChange({
      ...paperValue,
      checks: { ...(paperValue.checks || {}), [label]: checked },
    });
  };

  const setBlank = (key, blankValue) => {
    onChange({
      ...paperValue,
      blanks: { ...(paperValue.blanks || {}), [key]: blankValue },
    });
  };

  const renderLine = (line, lineIndex) => {
    let blankIndex = 0;
    const segments = line
      .split(/(□\s*[^□_\n]+|â–¡\s*[^â–¡_\n]+|Ã¢â€“Â¡\s*[^Ã¢_\n]+|___+)/g)
      .filter(Boolean);

    return (
      <div key={lineIndex} className="pdf-template-line flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-charcoal/75">
        {segments.map((segment, segmentIndex) => {
          if (/^___+$/.test(segment)) {
            const blankKey = `${lineIndex}-${blankIndex++}`;
            return (
              <input
                key={segmentIndex}
                value={paperValue.blanks?.[blankKey] || ''}
                onChange={(event) => setBlank(blankKey, event.target.value)}
                className="pdf-blank h-6 min-w-[64px] flex-1 border-0 border-b border-charcoal/35 bg-transparent px-1 text-[11px] text-charcoal focus:border-sage focus:outline-none focus:ring-0"
              />
            );
          }

          if (/^(□|â–¡|Ã¢â€“Â¡)/.test(segment.trim())) {
            const label = segment.replace(/^(□|â–¡|Ã¢â€“Â¡)\s*/, '').trim();
            if (!label) return null;
            return (
              <label key={segmentIndex} className="pdf-choice inline-flex items-center gap-1 text-[11px] text-charcoal/75">
                <input
                  type="checkbox"
                  checked={!!paperValue.checks?.[label]}
                  onChange={(event) => setCheck(label, event.target.checked)}
                  className="pdf-check h-3 w-3 rounded border-charcoal/35 text-sage focus:ring-sage"
                />
                <span>{label}</span>
              </label>
            );
          }

          return (
            <span key={segmentIndex} className="whitespace-pre-wrap">
              {segment}
            </span>
          );
        })}
      </div>
    );
  };

  return <div className="pdf-template space-y-1">{lines.map(renderLine)}</div>;
};

const PaperMetaValue = ({ children }) => (
  <div className="pdf-meta-value min-h-[32px] border-b border-charcoal/35 px-1 py-1 text-[12px] font-semibold leading-snug text-charcoal">
    {children || '-'}
  </div>
);

const PaperCompletionForm = ({ formType, formData, onChange, patientMeta }) => {
  const isFamily = formType === 'family_section_a';
  const setValue = (section, label, value) => {
    onChange((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [label]: value,
      },
    }));
  };

  return (
    <div className="pdf-paper-scroll max-h-[62vh] overflow-auto rounded-sm border border-charcoal/45 bg-[#FFFDF8] p-2 sm:p-3 text-charcoal shadow-inner">
      <div className="pdf-sheet min-w-[700px] border border-charcoal/55 sm:min-w-0">
        <div className="pdf-title-bar bg-charcoal px-3 py-2 text-offwhite-100">
          <p className="pdf-title-brand text-center text-[10px] font-semibold tracking-[0.18em]">MANOVAIDYA</p>
          <h3 className="pdf-title-main mt-1 text-center font-display text-sm font-bold uppercase tracking-wide">
            {isFamily ? 'Family Session Record' : 'Autism Follow-Up - Routine & Compliance Check'}
          </h3>
          {!isFamily && (
            <p className="pdf-title-sub mt-1 text-center text-[10px] text-offwhite-100/80">
              Back Slide | Therapy | Caregiver Compliance | New Problem Check | Action & Accountability
            </p>
          )}
        </div>

        {isFamily && (
          <div className="pdf-family-intro border-b border-charcoal/45 p-2 text-[11px] leading-relaxed">
            <p className="font-semibold">टेम्पलेट 1 | ऑटिज्म / चाइल्ड फैमिली सेशन</p>
            <p>पालन, मिसिंग और बदलाव की चेकलिस्ट</p>
            <p>एक review period का रिकॉर्ड - वास्तविक समस्या लिखें, अनुमान नहीं</p>
          </div>
        )}

        <div className="pdf-meta-grid grid grid-cols-[120px_1fr] border-b border-charcoal/45 text-[11px] sm:grid-cols-[160px_1fr]">
          <div className="border-r border-charcoal/35 bg-offwhite-200 px-2 py-1.5 font-semibold">पैरेंट / ID / उम्र</div>
          <div className="pdf-meta-value-wrap px-2 py-1.5">
            <PaperMetaValue>{patientMeta?.patientLine}</PaperMetaValue>
          </div>
          <div className="border-r border-t border-charcoal/35 bg-offwhite-200 px-2 py-1.5 font-semibold">तारीख / रिकॉर्ड अवधि</div>
          <div className="pdf-meta-value-wrap border-t border-charcoal/35 px-2 py-1.5">
            <PaperMetaValue>{patientMeta?.dateLine}</PaperMetaValue>
          </div>
        </div>

        {Object.entries(formData).map(([section, fields]) => (
          <div key={section}>
            <div className="pdf-section-title bg-charcoal px-2 py-1.5 text-[11px] font-bold text-offwhite-100">{section}</div>
            {section.startsWith('Additional Notes') ? (
              <div className="pdf-notes-wrap border-t border-charcoal/25 p-2">
                <textarea
                  rows={6}
                  value={fields.Notes || ''}
                  placeholder="Yahan detailed notes likhein..."
                  onChange={(event) => setValue(section, 'Notes', event.target.value)}
                  className="pdf-notes w-full resize-y rounded-sm border border-charcoal/30 bg-transparent px-2 py-2 text-[12px] leading-relaxed text-charcoal placeholder:text-charcoal/35 focus:border-sage focus:outline-none focus:ring-1 focus:ring-sage/20"
                />
              </div>
            ) : section.startsWith('A.') ? (
              <table className="pdf-table w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-offwhite-300/55 text-left">
                    <th className="w-[24%] border border-charcoal/35 px-2 py-1.5">बिंदु</th>
                    <th className="w-[30%] border border-charcoal/35 px-2 py-1.5">सब सेक्शन / मात्रा</th>
                    <th className="w-[18%] border border-charcoal/35 px-2 py-1.5">पालन</th>
                    <th className="border border-charcoal/35 px-2 py-1.5">Miss / बाधा / नोट</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fields).map(([label, value]) => {
                    const cells = getPaperRowCells(formType, label);
                    const paperValue = toPaperCellValue(value);
                    return (
                    <tr key={label}>
                      <td className="pdf-point-label border border-charcoal/25 px-2 py-1.5 align-top font-semibold">{label}</td>
                      <td className="border border-charcoal/25 px-2 py-1.5 align-top text-charcoal/70">
                        <PaperFillableTemplate
                          text={cells.method}
                          value={paperValue.method}
                          onChange={(nextValue) => setValue(section, label, { ...paperValue, method: nextValue })}
                        />
                      </td>
                      <td className="border border-charcoal/25 px-2 py-1.5 align-top text-charcoal/60">
                        <PaperFillableTemplate
                          text={cells.compliance}
                          value={paperValue.compliance}
                          onChange={(nextValue) => setValue(section, label, { ...paperValue, compliance: nextValue })}
                        />
                      </td>
                      <td className="border border-charcoal/25 px-2 py-1.5 align-top">
                        <PaperFillableTemplate
                          text={cells.note}
                          value={paperValue.note}
                          onChange={(nextValue) => setValue(section, label, { ...paperValue, note: nextValue })}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : section.startsWith('B.') ? (
              <table className="pdf-table w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-offwhite-300/55 text-left">
                    <th className="w-[34%] border border-charcoal/35 px-2 py-1.5">क्या दर्ज करना है?</th>
                    <th className="border border-charcoal/35 px-2 py-1.5">भरें</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fields).map(([label, value]) => (
                    <tr key={label}>
                      <td className="pdf-point-label border border-charcoal/25 px-2 py-1.5 align-top font-semibold">{label}</td>
                      <td className="border border-charcoal/25 px-2 py-1.5 align-top">
                        <PaperFillableTemplate
                          text={getCompletionPlaceholder(formType, label)}
                          value={value}
                          onChange={(nextValue) => setValue(section, label, nextValue)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="pdf-row-list divide-y divide-charcoal/25">
                {Object.entries(fields).map(([label, value]) => (
                  <div key={label} className="pdf-line-record grid gap-2 px-2 py-2 text-[11px] sm:grid-cols-[240px_1fr]">
                    <div>
                      <p className="font-semibold">{label}</p>
                    </div>
                    <PaperFillableTemplate
                      text={getCompletionPlaceholder(formType, label)}
                      value={value}
                      onChange={(nextValue) => setValue(section, label, nextValue)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="pdf-rule border-t border-charcoal/45 p-2 text-[10px] text-charcoal/65">
          Rule: जो applicable field नहीं है, वहां N/A करें. Treatment outcome या judgement language न लिखें.
        </div>
      </div>
    </div>
  );
};

export { PaperCompletionForm, createEmptyCompletionForm, flattenCompletionSummary, getCompletionPdfHtml };
