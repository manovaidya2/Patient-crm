// Formulation Master (Autism / ADHD & Child Development) and the Agewise Chit Book, as code.
// Quantities are the SIX-MONTH totals per age band; a supply part takes its fraction (1+5 -> 1/6 and 5/6, 2+4 -> 2/6 and
// 4/6), exactly as the master's packing table does. Doses and chit texts come from the Chit Book.
// Items marked `pending` carry a note the doctor still has to confirm (the documents disagree or leave it open).
const { AGE_BANDS } = require('./supplyPlans');

const BANDS = Object.keys(AGE_BANDS); // '3-4', '4-12', '12-70', '70+'
const PART_FRACTION = { '6M:full': 1, '1+5:first': 1 / 6, '1+5:rest': 5 / 6, '2+4:first': 2 / 6, '2+4:rest': 4 / 6 };
const PART_MONTHS = { '6M:full': 6, '1+5:first': 1, '1+5:rest': 5, '2+4:first': 2, '2+4:rest': 4 };

// Stock codes the medicines are drawn from (see models/StockItem.js and the sample stock seed).
const STOCK = {
  MEDHYA_GHRIT: 'MEDHYA-GHRIT', SHIVA_LEH: 'SHIVA-LEH', RA: 'RA-SW-PD-28', RY33: 'RY-33', RY19: 'RY-19',
  CH014: 'CH-SD-014', CH071: 'CH-SD-071', SIRUP: 'MEDHYA-SIRUP', NASYA: 'BUDDHI-GHRIT', OIL: 'MEDHYA-OIL', BOTTLE: 'BT-100',
};

// Per band: six-month quantity and unit of every packed item.
const SIX_MONTH = {
  '3-4':   { ghrit: [225, 'ml'], shivaLeh: [150, 'g'], honey: [450, 'ml'], ra: [15, 'tablet'], ry33: [45, 'tablet'], ry19: [45, 'tablet'], ch014: [6, 'spoon'], ch071: [6, 'spoon'], sirup: [225, 'ml'], nasya: null, oil: [300, 'ml'] },
  '4-12':  { ghrit: [450, 'ml'], shivaLeh: [90, 'spoon'], honey: [900, 'ml'], ra: [30, 'tablet'], ry33: [90, 'tablet'], ry19: [90, 'tablet'], ch014: [6, 'spoon'], ch071: [6, 'spoon'], sirup: [450, 'ml'], nasya: [360, 'drop'], oil: [500, 'ml'] },
  '12-70': { ghrit: [900, 'ml'], shivaLeh: [540, 'g'], honey: [1800, 'ml'], ra: [30, 'tablet'], ry33: [180, 'tablet'], ry19: [180, 'tablet'], ch014: [6, 'spoon'], ch071: [6, 'spoon'], sirup: [900, 'ml'], nasya: [720, 'drop'], oil: [500, 'ml'] },
  '70+':   { ghrit: [450, 'ml'], shivaLeh: [90, 'spoon'], honey: [900, 'ml'], ra: [30, 'tablet'], ry33: [90, 'tablet'], ry19: [90, 'tablet'], ch014: [6, 'spoon'], ch071: [6, 'spoon'], sirup: [450, 'ml'], nasya: [360, 'drop'], oil: [500, 'ml'] },
};
// Tablet weights from the master: RA-SW-PD-28 10 tablets = 3 g; RY-33 / RY-19 one tablet = 125 mg.
const TABLET_GRAMS = { ra: 0.3, ry33: 0.125, ry19: 0.125 };

// Dose on the chit / medicine paper, by band (Chit Book + Formulation Master).
const DOSE = {
  ghrit: { '3-4': '¼ चम्मच (1.25 ml)', '4-12': '½ चम्मच (2.5 ml)', '12-70': '1 चम्मच (5 ml)', '70+': '½ चम्मच (2.5 ml)' },
  shivaLeh: {
    '3-4': '3-3 चुटकी दवाई + ¼-¼ चम्मच शहद के साथ मिलाकर लीजिए।',
    '4-12': '¼-¼ चम्मच दवाई + ½-½ चम्मच शहद के साथ मिलाकर लीजिए।',
    '12-70': '½-½ चम्मच दवाई + 1-1 चम्मच शहद के साथ मिलाकर लीजिए।',
    '70+': '¼-¼ चम्मच दवाई + ½-½ चम्मच शहद के साथ मिलाकर लीजिए।',
  },
  mix: { '3-4': '1-2 चुटकी', '4-12': '1-2 चुटकी', '12-70': '2-3 चुटकी', '70+': '1-2 चुटकी' },
  sirup: { '3-4': '¼ चम्मच (1.25 ml)', '4-12': '½ चम्मच (2.5 ml)', '12-70': '1 चम्मच (5 ml)', '70+': '½ चम्मच (2.5 ml)' },
  nasya: { '4-12': 'दाएँ 1 + बाएँ 1 = 2 बूँद/दिन, एक बार', '12-70': 'दाएँ 2 + बाएँ 2 = 4 बूँद/दिन, एक बार', '70+': 'शाम: दायाँ 1 + बायाँ 1 = 2 बूँद/दिन' },
};
// Chit Book: how many शिवा-लेह chits (containers) and the days on each, by band and supply days.
const SHIVA_LEH_SPLIT = {
  '3-4': { 180: [180], 30: [30], 150: [75, 75], 60: [60], 120: [60, 60] },
  '4-12': { 180: [90, 90], 30: [30], 150: [75, 75], 60: [60], 120: [60, 60] },
  '12-70': { 180: [60, 60, 60], 30: [30], 150: [75, 75], 60: [60], 120: [60, 60] },
  '70+': { 180: [90, 90], 30: [30], 150: [75, 75], 60: [60], 120: [60, 60] },
};
const NOTE_WATER = 'नोट: पानी आवश्यकतानुसार दवाई निगलने के लिए पीएँ, पेट भरकर नहीं।';
const TREATMENT_PAPERS = ['Medicine Paper (दवा-निर्देश)', 'Diet Plan', 'ओंकार जप / आमीन / Amen', 'Marma Points', 'Parent Guidance'];

// Points the documents leave open; shown on the job so nobody packs by guesswork.
const PENDING_NOTES = {
  shivaLeh: 'शिवा-लेह: 12-70 वर्ष में मास्टर ⅓ चम्मच और चिट बुक ½ चम्मच कहती है; 4-12 और 70+ की ग्राम मात्रा "पुष्टि बाकी" है।',
  mix: 'दोपहर-रात: 12-70 वर्ष में चिट बुक 2-3 चुटकी और मास्टर 1-2 चुटकी कहता है।',
  nasya: 'नस्य: बूँद/ml और चुना हुआ तेल/घृत डॉक्टर की पुष्टि के बाद ही पैक करें; 4 वर्ष से कम में नहीं।',
};

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const numberOf = (value, label) => {
  const n = Number(String(value ?? '').trim());
  if (!Number.isFinite(n) || n < 0) fail(`Enter a valid ${label}`);
  return round(n);
};
const scale = (pair, fraction) => (pair ? [round(pair[0] * fraction), pair[1]] : null);
const bottles = (ml) => Math.ceil(ml / 100);

// The editable part of the master, per age band: what the doctor can change on the Formulation Master page.
// The values above are the document values and stay the defaults; an edited band is stored in the FormulationMaster
// collection in this same shape (quantities as { qty, unit }).
const MASTER_ITEMS = [
  { key: 'ghrit', label: 'मेध्य घृत (Medhya Ghrit)', units: ['ml'] },
  { key: 'shivaLeh', label: 'शिवा-लेह (Shiva-Leh)', units: ['g', 'spoon'] },
  { key: 'honey', label: 'शहद (honey, patient\'s own)', units: ['ml'] },
  { key: 'ra', label: 'RA-SW-PD-28 (noon-night mix)', units: ['tablet'] },
  { key: 'ry33', label: 'RY-33 (noon-night mix)', units: ['tablet'] },
  { key: 'ry19', label: 'RY-19 (noon-night mix)', units: ['tablet'] },
  { key: 'ch014', label: 'CH-SD-014 (noon-night mix)', units: ['spoon'] },
  { key: 'ch071', label: 'CH-SD-071 (noon-night mix)', units: ['spoon'] },
  { key: 'sirup', label: 'मेध्य सिरप (Medhya Syrup)', units: ['ml'] },
  { key: 'nasya', label: 'बुद्धिवर्धक घृत / नस्य (Nasya)', units: ['drop', 'ml'], optional: true },
  { key: 'oil', label: 'मेध्य Oil (Medhya Oil)', units: ['ml'] },
];
const MASTER_DOSES = [
  { key: 'ghrit', label: 'मेध्य घृत - dose (goes inside the morning chit text)' },
  { key: 'shivaLeh', label: 'शिवा-लेह - chit text' },
  { key: 'mix', label: 'दोपहर-रात - pinches (goes inside the chit text)' },
  { key: 'sirup', label: 'मेध्य सिरप - dose (goes inside the night chit text)' },
  { key: 'nasya', label: 'नस्य - chit text', optional: true },
];
const SPLIT_DAYS = [180, 30, 150, 60, 120];
const PENDING_KEYS = ['shivaLeh', 'mix', 'nasya'];
const toObj = (pair) => (pair ? { qty: pair[0], unit: pair[1] } : null);
function defaultMasterFor(ageBand) {
  if (!BANDS.includes(ageBand)) return null;
  return {
    ageBand, version: 0, source: 'document', updatedAt: null, updatedByName: '',
    quantities: Object.fromEntries(Object.entries(SIX_MONTH[ageBand]).map(([k, pair]) => [k, toObj(pair)])),
    doses: Object.fromEntries(MASTER_DOSES.map((d) => [d.key, DOSE[d.key][ageBand] || ''])),
    shivaLehSplit: Object.fromEntries(SPLIT_DAYS.map((d) => [String(d), [...(SHIVA_LEH_SPLIT[ageBand][d] || [d])]])),
    tabletGrams: { ...TABLET_GRAMS },
    pendingNotes: { ...PENDING_NOTES },
  };
}
// Validates a master sent from the page; returns the clean editable fields (same shape as defaultMasterFor minus meta).
function normalizeMaster(input = {}, ageBand) {
  const base = defaultMasterFor(ageBand);
  if (!base) fail('Unknown age group');
  const quantities = {};
  for (const item of MASTER_ITEMS) {
    // A key left out keeps the document value; an empty box clears it (allowed only for optional items).
    const v = input.quantities?.[item.key] === undefined ? base.quantities[item.key] : input.quantities[item.key];
    if (v == null || v === '' || (typeof v === 'object' && (v.qty === '' || v.qty == null))) {
      if (!item.optional) fail(`Enter the six-month quantity of ${item.label}`);
      quantities[item.key] = null; continue;
    }
    const qty = numberOf(typeof v === 'object' ? v.qty : v, `${item.label} quantity`);
    const unit = String((typeof v === 'object' && v.unit) || base.quantities[item.key]?.unit || item.units[0]).trim();
    if (!item.units.includes(unit)) fail(`${item.label}: unit must be ${item.units.join(' or ')}`);
    quantities[item.key] = { qty, unit };
  }
  const doses = {};
  for (const d of MASTER_DOSES) {
    const text = String(input.doses?.[d.key] ?? base.doses[d.key] ?? '').trim().slice(0, 500);
    if (!text && !d.optional) fail(`Enter the dose text for ${d.label}`);
    doses[d.key] = text;
  }
  const shivaLehSplit = {};
  for (const days of SPLIT_DAYS) {
    const raw = input.shivaLehSplit?.[String(days)] ?? base.shivaLehSplit[String(days)];
    const parts = (Array.isArray(raw) ? raw : String(raw).split(/[,+]/)).map((x) => String(x).trim()).filter(Boolean).map((x) => { const n = Number(x); if (!Number.isInteger(n) || n <= 0) fail(`शिवा-लेह packs for ${days} days must be whole days`); return n; });
    if (!parts.length) fail(`Enter the शिवा-लेह packs for ${days} days`);
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== days) fail(`शिवा-लेह packs for ${days} days add up to ${sum}, not ${days}`);
    shivaLehSplit[String(days)] = parts;
  }
  const tabletGrams = {};
  for (const k of Object.keys(TABLET_GRAMS)) {
    const g = numberOf(input.tabletGrams?.[k] ?? base.tabletGrams[k], `${k.toUpperCase()} grams per tablet`);
    if (g <= 0) fail(`${k.toUpperCase()} grams per tablet must be above 0`);
    tabletGrams[k] = g;
  }
  const pendingNotes = Object.fromEntries(PENDING_KEYS.map((k) => [k, String(input.pendingNotes?.[k] ?? base.pendingNotes[k] ?? '').trim().slice(0, 500)]));
  return { quantities, doses, shivaLehSplit, tabletGrams, pendingNotes };
}

// One supply of medicine: every line with quantity, stock code, bottles, chits and dose, plus the papers that go with it.
// `master` is the (possibly doctor-edited) band master; without it the document values are used.
function formulationFor({ ageBand, plan, part }, master = null) {
  const key = `${plan}:${part}`;
  const fraction = PART_FRACTION[key];
  if (!BANDS.includes(ageBand) || !fraction) return null;
  const m = master && master.ageBand === ageBand ? master : defaultMasterFor(ageBand);
  const pairOf = (v) => (v == null ? null : Array.isArray(v) ? v : [Number(v.qty), v.unit]);
  const six = Object.fromEntries(Object.entries(m.quantities).map(([k, v]) => [k, pairOf(v)]));
  const DOSE_OF = (k) => m.doses?.[k] || '';
  const TG = m.tabletGrams || TABLET_GRAMS;
  const PN = m.pendingNotes || PENDING_NOTES;
  const SPLIT = m.shivaLehSplit || {};
  const months = PART_MONTHS[key];
  const days = months * 30;
  const first = part !== 'rest';
  const q = Object.fromEntries(Object.entries(six).map(([k, pair]) => [k, scale(pair, fraction)]));
  const line = (n, itemKey, name, when, pair, extra = {}) => ({
    n, key: itemKey, name, when, qty: pair ? pair[0] : 0, unit: pair ? pair[1] : '', packed: Boolean(pair) && extra.packed !== false,
    days, containers: extra.containers || (pair ? [days] : []), ...extra,
  });
  const lines = [
    line(1, 'ghrit', 'मेध्य घृत', 'सुबह (खाली पेट)', q.ghrit, { stockCode: STOCK.MEDHYA_GHRIT, bottles: bottles(q.ghrit[0]), dose: `सुबह खाली पेट: ${DOSE_OF('ghrit')}, दिन में एक बार। ऊपर से हल्का गुनगुना पानी आवश्यकतानुसार पीजिए, पेट भरकर नहीं।`, chitNo: 1 }),
    line(2, 'shivaLeh', 'शिवा-लेह', 'सुबह -- शाम', q.shivaLeh, { stockCode: STOCK.SHIVA_LEH, containers: SPLIT[String(days)] || [days], dose: DOSE_OF('shivaLeh'), chitNo: 2, honey: q.honey, pending: PN.shivaLeh || undefined }),
    line(3, 'mix', 'दोपहर-रात की दवाई', 'दोपहर -- रात', [round(q.ra[0] * TG.ra + q.ry33[0] * TG.ry33 + q.ry19[0] * TG.ry19), 'g'], {
      dose: `${DOSE_OF('mix')} दवाई + 3-4 घूँट गुनगुने पानी के साथ लीजिए।`, chitNo: 3, note: NOTE_WATER, pending: PN.mix || undefined,
      components: [
        { code: STOCK.RA, name: 'RA-SW-PD-28', qty: q.ra[0], unit: 'tablet', grams: round(q.ra[0] * TG.ra) },
        { code: STOCK.RY33, name: 'RY-33', qty: q.ry33[0], unit: 'tablet', grams: round(q.ry33[0] * TG.ry33) },
        { code: STOCK.RY19, name: 'RY-19', qty: q.ry19[0], unit: 'tablet', grams: round(q.ry19[0] * TG.ry19) },
        { code: STOCK.CH014, name: 'CH-SD-014', qty: q.ch014[0], unit: 'spoon', pinches: q.ch014[0] * 30 },
        { code: STOCK.CH071, name: 'CH-SD-071', qty: q.ch071[0], unit: 'spoon', pinches: q.ch071[0] * 30 },
      ],
    }),
    line(4, 'sirup', 'मेध्य सिरप', 'रात (सोते समय)', q.sirup, { stockCode: STOCK.SIRUP, bottles: bottles(q.sirup[0]), dose: `रात में सोते समय: ${DOSE_OF('sirup')} सिरप + उतना ही उबालकर ठंडा किया पानी मिलाएँ। दिन में एक बार।`, chitNo: 4 }),
    line(5, 'nasya', 'बुद्धिवर्धक घृत / चयनित नस्य', 'नाक में', q.nasya, q.nasya ? { stockCode: STOCK.NASYA, dose: DOSE_OF('nasya'), chitNo: 5, pending: PN.nasya || undefined } : { packed: false, note: '4 वर्ष से कम: नाक के अंदर ड्रॉप नहीं देना।', containers: [] }),
    line(6, 'abhyang', 'अभ्यंग Oil', 'मालिश', null, { packed: false, fromHome: true, firstOnly: true, note: 'सरसों, नारियल, तिल या औषधीय तेल हल्के हाथों से लगाएँ। तेल घर से लेना है; पैक में नहीं देना।', containers: [] }),
    line(7, 'oil', 'मेध्य Oil', 'प्रतिदिन सुबह', q.oil, { stockCode: STOCK.OIL, bottles: bottles(q.oil[0]), dose: 'प्रतिदिन सुबह मेध्य Oil से सिर की जड़ों की मालिश करें।', chitNo: 7 }),
  ].filter((l) => !(l.firstOnly && !first));
  return {
    ageBand, ageBandLabel: AGE_BANDS[ageBand], plan, part, months, days, first,
    title: `${plan === '6M' ? 'SIX MONTH' : `${months} MONTH`} FORMULATION${plan === '6M' ? '' : part === 'first' ? ' | PART 1' : ' | PART 2'}`,
    lines,
    honey: q.honey ? { qty: q.honey[0], unit: q.honey[1], note: 'शहद औषधि से अलग है; मरीज स्वयं लेता है, क्लिनिक से पैक नहीं होगा।' } : null,
    papers: first ? TREATMENT_PAPERS : [],
    papersNote: first ? 'Treatment Papers केवल पहली आपूर्ति में।' : 'Treatment Papers पहली आपूर्ति में दिए जा चुके हैं; दोबारा नहीं देने हैं।',
    pending: lines.map((l) => l.pending).filter(Boolean),
    edited: false,
    // Which master built this sheet (version 0 = the document values).
    master: { version: m.version || 0, source: m.source || 'document', updatedAt: m.updatedAt || null, updatedByName: m.updatedByName || '' },
  };
}

// What has to be drawn from stock for this supply (stock code -> quantity in the stock item's unit), bottles included.
function stockNeeds(formulation) {
  const needs = [];
  for (const l of formulation.lines) {
    if (!l.packed) continue;
    if (l.components) l.components.forEach((c) => needs.push({ code: c.code, name: c.name, qty: c.qty, unit: c.unit, for: l.name }));
    else if (l.stockCode) needs.push({ code: l.stockCode, name: l.name, qty: l.qty, unit: l.unit, for: l.name });
    if (l.bottles) needs.push({ code: STOCK.BOTTLE, name: 'BT-100 bottle', qty: l.bottles, unit: 'piece', for: l.name });
  }
  // Same code used by several lines -> one row.
  const merged = new Map();
  for (const n of needs) {
    const prev = merged.get(n.code);
    if (prev) { prev.qty = round(prev.qty + n.qty); prev.for = `${prev.for}, ${n.for}`; } else merged.set(n.code, { ...n });
  }
  return [...merged.values()];
}

// The chits to print and confirm for this supply (Chit Book cards).
function chitsFor(formulation, patientName = '') {
  const chits = [];
  for (const l of formulation.lines) {
    if (!l.packed || !l.chitNo) continue;
    l.containers.forEach((days, i) => chits.push({
      key: `${l.key}-${i + 1}`, itemKey: l.key, chitNo: l.chitNo, n: i + 1, of: l.containers.length,
      name: l.name, when: l.when, dose: l.dose, days, note: l.note || '', patientName,
    }));
  }
  return chits;
}

// A corrected sheet: the doctor / department changes quantities, dose text, pack split or mix components for this
// patient. The master value is kept beside every change (`original`) so the correction stays visible.
const TABLET_GRAMS_BY_CODE = { [STOCK.RA]: TABLET_GRAMS.ra, [STOCK.RY33]: TABLET_GRAMS.ry33, [STOCK.RY19]: TABLET_GRAMS.ry19 };
function applyOverrides(formulation, overrides = [], { byName = '' } = {}) {
  if (!formulation) fail('There is no formulation sheet to edit');
  const byKey = new Map((Array.isArray(overrides) ? overrides : []).map((o) => [o.key, o]));
  const lines = formulation.lines.map((line) => {
    const o = byKey.get(line.key);
    if (!o) return line;
    const next = { ...line, original: line.original || { qty: line.qty, unit: line.unit, dose: line.dose || '', containers: [...(line.containers || [])], components: line.components ? line.components.map((c) => ({ ...c })) : undefined } };
    const changes = [];
    if (o.packed !== undefined && !line.fromHome) { const packed = o.packed === true || o.packed === 'true'; if (packed !== line.packed) { next.packed = packed; changes.push(packed ? 'packed' : 'not packed'); } }
    if (o.dose !== undefined && String(o.dose).trim() !== (line.dose || '')) { next.dose = String(o.dose).trim().slice(0, 500); changes.push('dose'); }
    if (o.containers !== undefined) {
      const containers = (Array.isArray(o.containers) ? o.containers : String(o.containers).split(/[,+]/)).map((d) => String(d).trim()).filter(Boolean).map((d) => { const n = Number(d); if (!Number.isInteger(n) || n <= 0) fail(`Pack days for ${line.name} must be whole days`); return n; });
      if (!containers.length) fail(`Enter the pack days for ${line.name}`);
      if (containers.join('+') !== (line.containers || []).join('+')) { next.containers = containers; changes.push('packs'); }
    }
    if (line.components) {
      if (Array.isArray(o.components)) {
        const byCode = new Map(o.components.map((c) => [c.code, c]));
        next.components = line.components.map((c) => {
          const edit = byCode.get(c.code);
          if (!edit || edit.qty === undefined || edit.qty === '') return c;
          const qty = numberOf(edit.qty, `${c.name} quantity`);
          if (qty === c.qty) return c;
          changes.push(c.name);
          const perTablet = c.qty && c.grams ? c.grams / c.qty : TABLET_GRAMS_BY_CODE[c.code];
          return { ...c, qty, grams: perTablet ? round(qty * perTablet) : c.grams, pinches: c.pinches !== undefined ? qty * 30 : undefined };
        });
        next.qty = round(next.components.reduce((sum, c) => sum + (c.grams || 0), 0));
      }
    } else if (o.qty !== undefined && o.qty !== '' && line.unit) {
      const qty = numberOf(o.qty, `${line.name} quantity`);
      if (qty !== line.qty) { next.qty = qty; changes.push('quantity'); if (line.bottles !== undefined) next.bottles = bottles(qty); }
    }
    if (!changes.length) return line;
    next.edited = { byName, at: new Date().toISOString(), changes };
    return next;
  });
  return { ...formulation, lines, edited: lines.some((l) => l.edited), pending: lines.map((l) => l.pending).filter(Boolean) };
}

module.exports = { applyOverrides, formulationFor, stockNeeds, chitsFor, defaultMasterFor, normalizeMaster, BANDS, MASTER_ITEMS, MASTER_DOSES, SPLIT_DAYS, PENDING_KEYS, SIX_MONTH, STOCK, TREATMENT_PAPERS, SHIVA_LEH_SPLIT, PART_FRACTION, NOTE_WATER };
