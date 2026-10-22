// Sample stock items (the Formulation Master's medicines, components and packing materials) loaded once when the
// Stocks collection is empty, so the medicine flow can be tried straight away. Quantities are illustrative.
const SAMPLE_STOCKS = [
  { code: 'MEDHYA-GHRIT', name: 'Medhya Ghrit', nameHindi: 'मेध्य घृत', kind: 'medicine', unit: 'ml', opening: 5000, minLevel: 1000, batchNo: 'MG-2610', notes: 'Morning, empty stomach. BT-100 bottles.' },
  { code: 'SHIVA-LEH', name: 'Shiva-Leh', nameHindi: 'शिवा-लेह', kind: 'medicine', unit: 'g', opening: 3000, minLevel: 600, batchNo: 'SL-2610', notes: 'Morning-evening with honey. grams per spoon pending validation (4-12 and 70+ bands are in spoons).' },
  { code: 'RA-SW-PD-28', name: 'RA-SW-PD-28', kind: 'component', unit: 'tablet', opening: 600, minLevel: 100, batchNo: 'RA-28', notes: 'Noon-night mix; 10 tablets = 3 g.' },
  { code: 'RY-33', name: 'RY-33', kind: 'component', unit: 'tablet', opening: 2000, minLevel: 300, batchNo: 'RY33-A', notes: 'Noon-night mix; 1 tablet = 125 mg.' },
  { code: 'RY-19', name: 'RY-19', kind: 'component', unit: 'tablet', opening: 2000, minLevel: 300, batchNo: 'RY19-A', notes: 'Noon-night mix; 1 tablet = 125 mg.' },
  { code: 'CH-SD-014', name: 'CH-SD-014', kind: 'component', unit: 'spoon', opening: 120, minLevel: 20, batchNo: 'CH14', notes: '1 spoon = 30 pinches (as told).' },
  { code: 'CH-SD-071', name: 'CH-SD-071', kind: 'component', unit: 'spoon', opening: 120, minLevel: 20, batchNo: 'CH71', notes: 'Code 071 / 072 confirmation pending.' },
  { code: 'MEDHYA-SIRUP', name: 'Medhya Syrup', nameHindi: 'मेध्य सिरप', kind: 'medicine', unit: 'ml', opening: 5000, minLevel: 1000, batchNo: 'MS-2610', notes: 'Night, with equal boiled-cooled water. BT-100 bottles.' },
  { code: 'BUDDHI-GHRIT', name: 'Buddhivardhak Ghrit / Nasya', nameHindi: 'बुद्धिवर्धक घृत / नस्य', kind: 'medicine', unit: 'ml', opening: 500, minLevel: 100, batchNo: 'BG-2610', notes: 'Drops per ml pending validation; not under 4 years. DR-05 dropper.' },
  { code: 'MEDHYA-OIL', name: 'Medhya Oil', nameHindi: 'मेध्य Oil', kind: 'medicine', unit: 'ml', opening: 4000, minLevel: 800, batchNo: 'MO-2610', notes: 'Daily morning scalp massage. BT-100 bottles.' },
  { code: 'BT-100', name: 'Bottle 100 ml (BT-100)', kind: 'packing', unit: 'piece', opening: 200, minLevel: 40, notes: 'Empty ~12 g, with cap ~13 g. Count = ceil(ml / 100).' },
  { code: 'DR-05', name: 'Dropper 5 ml (DR-05)', kind: 'packing', unit: 'piece', opening: 100, minLevel: 20 },
  { code: 'PK-60', name: 'Pouch small (PK-60)', kind: 'packing', unit: 'piece', opening: 300, minLevel: 50, notes: 'Up to 15 spoons / ~60 g.' },
  { code: 'PK-120', name: 'Pouch medium (PK-120)', kind: 'packing', unit: 'piece', opening: 200, minLevel: 40, notes: 'Up to 30 spoons / ~120 g.' },
  { code: 'PK-180', name: 'Pouch large (PK-180)', kind: 'packing', unit: 'piece', opening: 150, minLevel: 30 },
  { code: 'PK-240', name: 'Pouch largest (PK-240)', kind: 'packing', unit: 'piece', opening: 100, minLevel: 20 },
  { code: 'BX-55', name: 'Outer box 5x5 (BX-55)', kind: 'packing', unit: 'piece', opening: 60, minLevel: 10, notes: 'Usually 1-month kits.' },
  { code: 'BX-L', name: 'Outer box large (8x10 / 9x10 / 10x10)', kind: 'packing', unit: 'piece', opening: 60, minLevel: 10, notes: '4 / 5 / 6 month kits.' },
];

const seedSampleStocks = async ({ StockItem, StockTransaction, log = () => {} }) => {
  if (await StockItem.exists({})) return { created: 0 };
  let created = 0;
  for (const s of SAMPLE_STOCKS) {
    const { opening, ...rest } = s;
    // eslint-disable-next-line no-await-in-loop
    const item = await StockItem.create({ ...rest, currentStock: opening });
    // eslint-disable-next-line no-await-in-loop
    await StockTransaction.create({ item: item._id, code: item.code, type: 'add', quantity: opening, delta: opening, before: 0, after: opening, refType: 'count', note: 'Sample opening stock', byName: 'System' });
    created += 1;
  }
  log(`Stocks: loaded ${created} sample stock item(s)`);
  return { created };
};

module.exports = { SAMPLE_STOCKS, seedSampleStocks };
