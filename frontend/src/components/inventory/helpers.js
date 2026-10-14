// Shared display + small rules for the medicine inventory screens. Stock rules themselves live on the server;
// the preview helpers here only show what a line is about to do before it is saved.

export const inputClass = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15 disabled:bg-gray-50 disabled:text-charcoal/50';
export const PACKABLE = ['ml', 'gram'];
export const PACKING_CATEGORY = 'Packing सामग्री';
export const unitText = (unit) => (unit === 'gram' ? 'g' : unit);

export const num = (value, digits = 3) => Number(Number(value || 0).toFixed(digits)).toLocaleString('en-IN');
export const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

// "2.5 L" for 2500 ml, "5 kg" for 5000 g: the side conversion people actually read.
export function convert(value, unit) {
  const v = Number(value || 0);
  if (unit === 'ml') return v >= 1000 ? `${num(v / 1000)} L` : '';
  if (unit === 'gram') return v >= 1000 ? `${num(v / 1000)} kg` : '';
  return '';
}
export const qty = (value, unit, { withConversion = true } = {}) => {
  const main = `${num(value)} ${unitText(unit)}`;
  const side = withConversion ? convert(value, unit) : '';
  return side ? `${main} (${side})` : main;
};

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const dateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export const kindFor = (unit, size) => (unit === 'gram' ? 'Jar' : size <= 15 ? 'शीशी' : 'Bottle');
export const packLabel = (size, unit) => `${num(size)} ${unitText(unit)} ${kindFor(unit, size)}`;
export const sizeKey = (size, unit) => `${size}|${unit}`;
export const sizeName = (key) => { const [size, unit] = key.split('|'); return packLabel(Number(size), unit); };

export const STATUS = {
  out: { label: 'Out of stock', badge: 'bg-[#8C3B2E]/12 text-[#8C3B2E]', dot: 'bg-[#8C3B2E]', bar: 'bg-[#A33A2E]', order: 0 },
  critical: { label: 'Critical', badge: 'bg-[#8C3B2E]/12 text-[#8C3B2E]', dot: 'bg-[#8C3B2E]', bar: 'bg-[#A33A2E]', order: 1 },
  reorder: { label: 'Reorder level', badge: 'bg-amber-100 text-amber-900', dot: 'bg-amber-600', bar: 'bg-amber-600', order: 2 },
  expired: { label: 'Expired', badge: 'bg-[#8C3B2E]/12 text-[#8C3B2E]', dot: 'bg-[#8C3B2E]', bar: 'bg-[#8C3B2E]', order: 3 },
  over: { label: 'Max se upar', badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-600', bar: 'bg-violet-600', order: 4 },
  ok: { label: 'OK', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600', bar: 'bg-emerald-700', order: 5 },
};
export const STATUS_FILTERS = [
  ['attention', 'ध्यान चाहिए', (i) => i.needsAttention],
  ['all', 'सभी', () => true],
  ['critical', 'Critical / Out', (i) => i.critical],
  ['reorder', 'Reorder level', (i) => i.reorderDue],
  ['over', 'Max से ऊपर', (i) => i.over],
  ['expiry', 'Expiry ≤ 90 दिन', (i) => i.expiring],
  ['emergency', 'सिर्फ Emergency दवाएँ', (i) => i.emergency],
];
export const statusTest = (key) => STATUS_FILTERS.find(([k]) => k === key)?.[2] || (() => true);

export const TYPE = {
  add: { label: 'Stock In', badge: 'bg-emerald-100 text-emerald-800' },
  consume: { label: 'Use / Issue', badge: 'bg-amber-100 text-amber-900' },
  adjust: { label: 'Adjust', badge: 'bg-violet-100 text-violet-800' },
  pack: { label: 'Pack', badge: 'bg-sky-100 text-sky-800' },
};
export const ACT_TO_TYPE = { in: 'add', use: 'consume', adjust: 'adjust', pack: 'pack' };

export const ENTRY_SUBTYPES = {
  in: { label: 'Stock In type', options: ['Purchase (supplier bill)', 'In-house production (batch)', 'Patient return', 'Transfer in'], ref: 'Bill no. / Batch no.', refPlaceholder: 'Bill SV-2240 ya Batch BV-0911' },
  use: { label: 'Use type', options: ['Patient order (MED)', 'Production में खपत', 'Clinic use', 'Sample / Free'], ref: 'MED ID / Patient ID', refPlaceholder: 'MED-776 · MNV-2609-025' },
  adjust: { label: 'Reason (zaroori)', options: ['Physical count difference', 'Breakage / टूट-फूट', 'Spillage / रिसाव', 'Expired', 'Damage / खराब', 'Data entry correction'], ref: 'Count sheet / Note no.', refPlaceholder: 'Count sheet CS-37' },
  pack: { label: '', options: [], ref: 'Packing batch', refPlaceholder: 'PK-0911' },
};

// Empty bottle / jar items that a filled size will use up.
export const findContainer = (items, item, size) => items.find((c) => c.category === PACKING_CATEGORY
  && c.containerUnit === (item.unit === 'gram' ? 'g' : 'ml') && Number(c.containerSize) === Number(size)
  && (item.unit === 'gram' ? c.containerKind === 'Jar' : ['Bottle', 'शीशी'].includes(c.containerKind))) || null;

// What a single entry line will do, before saving: { text, error }.
export function previewLine(act, line, item, items, { canApprove = false, subType = '' } = {}) {
  if (!item) return { text: 'दवा चुनें', error: false };
  const q = Number(line.qty);
  const now = item.currentStock;
  if (!q || q <= 0) return { text: `अभी: ${qty(now, item.unit)}`, error: false };
  const size = line.mode === 'loose' ? 1 : Number(line.mode);
  const base = q * size;
  const pack = item.packs.find((p) => Number(p.size) === size);
  const conv = size > 1 ? `${q} × ${packLabel(size, item.unit)} = ${qty(base, item.unit)}` : qty(base, item.unit);
  if (act === 'pack') {
    const container = findContainer(items, item, size);
    const errors = [];
    if (item.loose < base) errors.push(`Loose sirf ${qty(item.loose, item.unit)}`);
    if (container && container.currentStock < q) errors.push(`Khaali ${packLabel(size, item.unit)} sirf ${num(container.currentStock)}`);
    return errors.length
      ? { text: `${conv} — ${errors.join(' · ')}`, error: true }
      : { text: `Loose ${num(item.loose)} → ${num(item.loose - base)} ${unitText(item.unit)}. ${num(size)} ${unitText(item.unit)} bottle: ${pack?.count || 0} → ${(pack?.count || 0) + q}${container ? ` (khaali bottle ${num(container.currentStock)} → ${num(container.currentStock - q)})` : ''}`, error: false };
  }
  const sign = act === 'in' ? 1 : act === 'use' ? -1 : line.dir === '+' ? 1 : -1;
  if (sign < 0) {
    const have = size === 1 ? item.loose : (pack?.count || 0);
    if (have < q) return { text: size === 1 ? `Loose me sirf ${qty(item.loose, item.unit)}` : `${packLabel(size, item.unit)} sirf ${have} bhari hain, pehle Pack karein`, error: true };
  }
  const after = now + sign * base;
  let text = `${sign > 0 ? '+' : '−'}${conv}. Total ${num(now)} → ${num(after)} ${unitText(item.unit)}`;
  if (act === 'adjust' && !canApprove && (base > now * 0.05 || /^(expired|damage)/i.test(subType))) text += '. Approval zaroori';
  return { text, error: false };
}
