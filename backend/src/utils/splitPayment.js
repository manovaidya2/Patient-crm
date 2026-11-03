// One payment received in several ways on the same day (e.g. Rs 32,000 = Rs 10,000 online + Rs 10,000 cash +
// Rs 12,000 card). It stays ONE payment entry (one approval, one receipt line) with paymentMode "split" and each part in
// `splits`; utr / receivedBy hold the parts' references joined so pages that show or search them keep working.
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const round2 = (n) => Math.round(n * 100) / 100;

const SPLIT_MODES = { online: 'Online', cash: 'Cash', card: 'Card' };
// Parts that reach a bank account (counted in the bank summaries).
const BANK_MODES = ['online', 'card'];

// Accepts an array or a JSON string (multipart forms send strings); drops fully empty rows.
const parseSplits = (raw) => {
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw || '[]'); } catch { throw fail('The split payment could not be read'); }
  }
  if (!Array.isArray(list)) return [];
  return list.slice(0, 10).map((row) => ({
    mode: text(row?.mode, 10),
    amount: String(row?.amount ?? '').replace(/,/g, '').trim(),
    utr: text(row?.utr ?? row?.reference ?? (row?.mode !== 'cash' ? row?.ref : '')),
    receivedBy: text(row?.receivedBy ?? (row?.mode === 'cash' ? row?.ref : '')),
  })).filter((row) => row.amount !== '' || row.utr || row.receivedBy);
};

// Checks the parts and works out what to save: { amount, splits, utr, receivedBy, needsProof }.
const resolveSplit = (raw) => {
  const rows = parseSplits(raw);
  if (rows.length < 2) throw fail('A split payment needs at least two parts (e.g. online + cash)');
  const splits = rows.map((row, index) => {
    const n = index + 1;
    if (!SPLIT_MODES[row.mode]) throw fail(`Choose online, cash or card for part ${n}`);
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw fail(`Enter the amount of part ${n}`);
    if (row.mode === 'online' && !row.utr) throw fail(`Enter the UTR / reference of the online part (part ${n})`);
    if (row.mode === 'cash' && !row.receivedBy) throw fail(`Enter who received the cash (part ${n})`);
    return { mode: row.mode, amount: round2(amount), utr: row.mode === 'cash' ? '' : row.utr, receivedBy: row.mode === 'cash' ? row.receivedBy : '' };
  });
  return {
    amount: round2(splits.reduce((sum, s) => sum + s.amount, 0)),
    splits,
    utr: splits.map((s) => s.utr).filter(Boolean).join(', '),
    receivedBy: [...new Set(splits.map((s) => s.receivedBy).filter(Boolean))].join(', '),
    needsProof: splits.some((s) => s.mode === 'online'),
  };
};

const rupees = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
// "Online Rs 10,000 (UTR 123) + Cash Rs 10,000 (Ramesh) + Card Rs 12,000"
const splitText = (payment) => (payment?.splits || []).map((s) => `${SPLIT_MODES[s.mode] || s.mode} ${rupees(s.amount)}${s.utr ? ` (${s.utr})` : s.receivedBy ? ` (${s.receivedBy})` : ''}`).join(' + ');
const isSplit = (payment) => payment?.paymentMode === 'split' && (payment.splits || []).length > 0;
// What went to a bank: all of an online payment, the online / card parts of a split one.
const bankAmountOf = (payment) => {
  if (isSplit(payment)) return round2(payment.splits.filter((s) => BANK_MODES.includes(s.mode)).reduce((sum, s) => sum + Number(s.amount || 0), 0));
  return (payment?.paymentMode || 'online') === 'online' ? Number(payment?.amount || 0) : 0;
};
// The label pages show for the mode.
const modeLabelOf = (payment) => (isSplit(payment) ? `Split: ${splitText(payment)}` : ({ cash: 'Cash', online: 'Online', split: 'Split' }[payment?.paymentMode || 'online'] || payment?.paymentMode));

module.exports = { SPLIT_MODES, BANK_MODES, parseSplits, resolveSplit, splitText, isSplit, bankAmountOf, modeLabelOf };
