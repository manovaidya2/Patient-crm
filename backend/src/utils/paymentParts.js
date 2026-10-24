// Part payments of the approved program fee (post-counselling record section E and the PO paper, section F).
// "Due" after a part is the balance left once that part and every earlier part are paid:
//   Part 1 due = fee - Part 1, Part 2 due = Part 1 due - Part 2, Part 3 due = Part 2 due - Part 3.
// Parts are filled in order (Part 2 only after Part 1, ...). A due is empty while its part is empty.
const PARTS = [1, 2, 3];
const round2 = (n) => Math.round(n * 100) / 100;

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });

// `values` holds partNAmount as numbers ('' when empty). Returns { part1Due, part2Due, part3Due }.
const workOutDues = (values, fee) => {
  const total = Number(fee || 0);
  const dues = {};
  let paid = 0;
  let gapAt = 0;
  for (const n of PARTS) {
    const amount = values[`part${n}Amount`];
    if (amount === '' || amount === null || amount === undefined) { dues[`part${n}Due`] = ''; if (!gapAt) gapAt = n; continue; }
    if (gapAt) throw fail(`Fill Part ${gapAt} before Part ${n}`);
    paid = round2(paid + Number(amount));
    if (total > 0 && paid > total) throw fail(`The parts add up to Rs ${paid.toLocaleString('en-IN')}, more than the approved fee of Rs ${total.toLocaleString('en-IN')}`);
    // Without a known fee there is nothing to subtract from, so the due stays empty.
    dues[`part${n}Due`] = total > 0 ? round2(Math.max(total - paid, 0)) : '';
  }
  return dues;
};

// Text written in an old free-text "Due" box is kept as a note (never lost), unless it is just the worked-out amount.
const dueNote = (rawDue, rawNote, computed) => {
  const note = String(rawNote ?? '').trim();
  if (note) return note.slice(0, 100);
  const raw = String(rawDue ?? '').trim();
  if (!raw) return '';
  const asNumber = Number(raw.replace(/,/g, ''));
  if (computed !== '' && Number.isFinite(asNumber) && asNumber === Number(computed)) return '';
  return raw.slice(0, 100);
};

// Works out the dues and keeps any old due text, for a set of values already cleaned (amounts as numbers).
const applyParts = (cleaned, raw, fee) => {
  const dues = workOutDues(cleaned, fee);
  for (const n of PARTS) {
    cleaned[`part${n}Due`] = dues[`part${n}Due`];
    cleaned[`part${n}DueNote`] = dueNote(raw?.[`part${n}Due`], raw?.[`part${n}DueNote`], dues[`part${n}Due`]);
  }
  return cleaned;
};

module.exports = { PARTS, workOutDues, dueNote, applyParts };
