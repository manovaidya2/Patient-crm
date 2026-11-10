const StockItem = require('../models/StockItem');
const { moveStock } = require('../controllers/stockController');

// A medicine the doctor adds to a formulation that is not in Stocks goes into Stocks with this much, so the
// Medicine Department can draw it at preparation like every other medicine.
const NEW_MEDICINE_OPENING = 100;

const plainName = (v) => String(v || '').toLowerCase().replace(/[\s\-_.]+/g, ' ').trim();

// MEDHYA GHRIT -> MEDHYA-GHRIT; a name with no Latin letters (Hindi) gets MED.
const codeFrom = (name) => String(name || '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'MED';

const uniqueCode = (base, taken) => {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
};

// Links every medicine added to the sheet without a Stocks item: to the item of the same name when Stocks has one,
// otherwise to a new item made with NEW_MEDICINE_OPENING units (written in the ledger as its opening stock).
// Changes the sheet lines in place; returns what it did for the job's history.
async function linkNewMedicines(sheet, { user, job = null } = {}) {
  const lines = (sheet?.lines || []).filter((l) => l.added && l.packed && !l.fromHome && !l.removed && !l.components && !l.stockCode);
  if (!lines.length) return [];
  const all = await StockItem.find({}).lean();
  const taken = new Set(all.map((s) => s.code));
  const byName = new Map();
  all.filter((s) => s.isActive !== false).forEach((s) => [s.name, s.nameHindi, s.code].filter(Boolean).forEach((n) => { if (!byName.has(plainName(n))) byName.set(plainName(n), s); }));
  const done = [];
  for (const line of lines) {
    const found = byName.get(plainName(line.name));
    if (found) {
      line.stockCode = found.code;
      done.push({ name: line.name, code: found.code, created: false });
      continue;
    }
    const code = uniqueCode(codeFrom(line.name), taken);
    taken.add(code);
    const ref = job ? `${job.poNumber || job.requestId || ''} ${job.patientName || ''}`.trim() : '';
    // eslint-disable-next-line no-await-in-loop
    const item = await StockItem.create({
      code, name: line.name, kind: 'medicine', unit: line.unit, currentStock: 0,
      notes: `Added automatically: new medicine on the formulation${ref ? ` of ${ref}` : ''} by ${user?.name || 'the doctor'}. Check the quantity in Stocks.`,
    });
    // eslint-disable-next-line no-await-in-loop
    await moveStock(item, { type: 'add', quantity: NEW_MEDICINE_OPENING, delta: NEW_MEDICINE_OPENING, user: user || { name: 'System', role: '' }, refType: 'count', ref, note: 'Opening stock - new medicine added on a formulation' });
    byName.set(plainName(line.name), item);
    line.stockCode = code;
    done.push({ name: line.name, code, created: true });
  }
  return done;
}

module.exports = { linkNewMedicines, NEW_MEDICINE_OPENING, codeFrom };
