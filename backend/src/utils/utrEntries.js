// One payment entry paid as several online transfers on the same day (e.g. 5 × Rs 2,000 = Rs 10,000).
// The entry keeps each transfer (UTR, transaction id, amount) in `utrEntries`, and `utr` / `transactionId` hold all of
// them joined ("UTR1, UTR2"), so every page that shows or searches the UTR keeps working unchanged.
// With one transfer nothing changes: `utrEntries` stays empty and utr / transactionId are filled as before.
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const round2 = (n) => Math.round(n * 100) / 100;

// Accepts an array or a JSON string (multipart forms send strings); drops fully empty rows.
const parseUtrEntries = (raw) => {
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw || '[]'); } catch { throw fail('UTR list could not be read'); }
  }
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).map((row, index) => {
    const amountText = String(row?.amount ?? '').replace(/,/g, '').trim();
    const amount = amountText === '' ? '' : Number(amountText);
    if (amount !== '' && (!Number.isFinite(amount) || amount <= 0)) throw fail(`Enter a valid amount for UTR ${index + 1}`);
    return { utr: text(row?.utr), transactionId: text(row?.transactionId), amount };
  }).filter((row) => row.utr || row.transactionId || row.amount !== '');
};

// Works out what to save. `amount` is the amount typed for the entry (used when there is only one transfer).
// Returns { amount, utr, transactionId, utrEntries }.
const resolveUtrs = ({ entries, amount, utr, transactionId }) => {
  if (entries.length >= 2) {
    entries.forEach((row, index) => {
      if (!row.utr && !row.transactionId) throw fail(`Enter the UTR or transaction ID for transfer ${index + 1}`);
      if (row.amount === '') throw fail(`Enter the amount for transfer ${index + 1}`);
    });
    const total = round2(entries.reduce((sum, row) => sum + Number(row.amount), 0));
    return {
      amount: total,
      utr: entries.map((row) => row.utr).filter(Boolean).join(', '),
      transactionId: entries.map((row) => row.transactionId).filter(Boolean).join(', '),
      utrEntries: entries.map((row) => ({ utr: row.utr, transactionId: row.transactionId, amount: Number(row.amount) })),
    };
  }
  const only = entries[0];
  return {
    amount,
    utr: text(only ? only.utr : utr),
    transactionId: text(only ? only.transactionId : transactionId),
    utrEntries: [],
  };
};

module.exports = { parseUtrEntries, resolveUtrs };
