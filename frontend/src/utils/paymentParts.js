// Same rule as the backend (backend/src/utils/paymentParts.js): the due after a part is the balance left once that
// part and every earlier part are paid. Used to show dues live while typing; the server works them out again on save.
export const PARTS = [1, 2, 3];
const round2 = (n) => Math.round(n * 100) / 100;
const amountOf = (value) => {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

// { dues: { 1: number|'' , 2, 3 }, paid, problem: '' | message }
export const workOutDues = (values, fee) => {
  const total = Number(fee || 0);
  const dues = {};
  let paid = 0;
  let gapAt = 0;
  let problem = '';
  PARTS.forEach((n) => {
    const amount = amountOf(values?.[`part${n}Amount`]);
    if (amount === null) { dues[n] = ''; if (!gapAt) gapAt = n; return; }
    if (gapAt && !problem) problem = `Fill Part ${gapAt} before Part ${n}`;
    paid = round2(paid + amount);
    if (total > 0 && paid > total && !problem) problem = `The parts add up to Rs ${paid.toLocaleString('en-IN')}, more than the approved fee of Rs ${total.toLocaleString('en-IN')}`;
    dues[n] = total > 0 ? round2(Math.max(total - paid, 0)) : '';
  });
  return { dues, paid, problem };
};

// The note kept from an old free-text due box: the saved note, or old text that is not just the worked-out amount.
export const oldDueNote = (values, n, computed) => {
  const note = String(values?.[`part${n}DueNote`] ?? '').trim();
  if (note) return note;
  const raw = String(values?.[`part${n}Due`] ?? '').trim();
  if (!raw) return '';
  const asNumber = Number(raw.replace(/,/g, ''));
  return Number.isFinite(asNumber) && (computed === '' || asNumber === Number(computed)) ? '' : raw;
};

// A part can be typed once the part before it has an amount (Part 1 always).
export const partOpen = (values, n) => n === 1 || amountOf(values?.[`part${n - 1}Amount`]) !== null || amountOf(values?.[`part${n}Amount`]) !== null;
