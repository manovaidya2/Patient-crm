// Bottles on the Stocks page: the medicines filled into BT-100 bottles (ghrit, syrup, oil), how many bottles their stock
// fills, and how many bottles each one has used in prepared medicine jobs (so BT-100 use is seen per medicine).
const { STOCK } = require('../constants/formulationMaster');

const BOTTLE_CODE = STOCK.BOTTLE;
const BOTTLE_ML = 100;
const IST_OFFSET_MS = 330 * 60000;

// Start of this month in India time.
const monthStart = (now = new Date()) => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
};

// Bottles per medicine stock code from the jobs whose preparation is done (that is when bottles are drawn).
// `jobs`: [{ stages: [{ key, doneAt }], formulation: { lines } }]. A reverted preparation has no 'prepare' record any more.
function bottleUsageFrom(jobs, now = new Date()) {
  const from = monthStart(now).getTime();
  const byCode = new Map();
  for (const job of jobs) {
    const prepared = (job.stages || []).find((s) => s.key === 'prepare' && s.doneAt);
    if (!prepared) continue;
    const thisMonth = new Date(prepared.doneAt).getTime() >= from;
    for (const line of job.formulation?.lines || []) {
      if (!line.packed || !line.stockCode || !(Number(line.bottles) > 0)) continue;
      const row = byCode.get(line.stockCode) || { code: line.stockCode, name: line.name, total: 0, month: 0 };
      row.total += Number(line.bottles);
      if (thisMonth) row.month += Number(line.bottles);
      byCode.set(line.stockCode, row);
    }
  }
  return byCode;
}

// Adds `bottles` to the formatted stock items: per bottled medicine and, for BT-100, the split by medicine.
function withBottles(items, usage) {
  const bottledCodes = new Set(usage.keys());
  // A medicine counts as bottled when the formulation fills it in bottles (even before its first use).
  [STOCK.MEDHYA_GHRIT, STOCK.SIRUP, STOCK.OIL].forEach((c) => bottledCodes.add(c));
  const medicines = items.filter((i) => bottledCodes.has(i.code));
  const fills = (i) => Math.floor(Number(i.currentStock || 0) / BOTTLE_ML);
  return items.map((i) => {
    if (i.code === BOTTLE_CODE) {
      const byMedicine = [...usage.values()].map((u) => ({ ...u, name: items.find((x) => x.code === u.code)?.name || u.name }));
      return {
        ...i,
        bottles: {
          size: BOTTLE_ML,
          usedTotal: byMedicine.reduce((s, u) => s + u.total, 0),
          usedMonth: byMedicine.reduce((s, u) => s + u.month, 0),
          byMedicine,
          // Bottles the medicine now in stock would fill, against the empty bottles there are.
          neededForStock: medicines.reduce((s, m) => s + fills(m), 0),
        },
      };
    }
    if (!bottledCodes.has(i.code) || i.unit !== 'ml') return i;
    const u = usage.get(i.code) || { total: 0, month: 0 };
    return { ...i, bottles: { size: BOTTLE_ML, bottleCode: BOTTLE_CODE, inStock: fills(i), usedTotal: u.total, usedMonth: u.month } };
  });
}

module.exports = { BOTTLE_CODE, BOTTLE_ML, monthStart, bottleUsageFrom, withBottles };
