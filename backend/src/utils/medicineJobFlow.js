// The Medicine Department's twelve fulfilment stages (Packing SOP V3 + Fulfilment Desk), with the checklist, fields and
// owner of each. Everything the page shows per stage is defined here, so the backend validates exactly what the UI asks.
const { ROLES } = require('../constants/roles');
const { AGE_BANDS, supplyLabel } = require('../constants/supplyPlans');

const MED = [ROLES.MEDICINE_DEPARTMENT, ROLES.ADMIN];
const DOC = [ROLES.DOCTOR, ROLES.ADMIN];
// Each stage is filled by its owner only (admin can step in anywhere): the doctor fills Doctor verification, the
// Medicine Department everything else. Kept as a name for the stages the doctor used to share.
const MED_DOC = MED;

// field: { key, label, type: text|date|number|select|textarea, required, options }
const STAGES = [
  { key: 'accept', n: 1, label: 'Order accepted', hi: 'ऑर्डर स्वीकार', roles: MED, sop: 'SOP S0',
    purpose: 'Accept the request from In Transit and commit to a ready date. Acceptance starts the department timeline.',
    checks: ['Patient ID, name and phase match the purchase order', 'Supply (6 months / 1+5 / 2+4 part) and age group identified', 'Prescription attached and readable', 'Ready-by date is achievable'],
    fields: [{ key: 'readyByDate', label: 'Medicine will be ready by', type: 'date', required: true }] },
  { key: 'review', n: 2, label: 'Prescription & formulation check', hi: 'पर्चा व मात्रा मिलान', roles: MED_DOC, sop: 'SOP 5 · HR-17',
    purpose: 'Match the prescription with the Formulation Master sheet below. Doses, totals, packs and days must agree before anything is weighed.',
    checks: ['Age group and supply part confirmed against the patient age and PO', 'Every medicine, dose and total quantity matched with the prescription', 'What was supplied earlier and what remains checked (for a second part)', 'Unclear dose or instruction clarified with the doctor - nothing assumed'],
    fields: [{ key: 'formulaRef', label: 'Doctor approval / formula reference', type: 'text', required: true }, { key: 'exceptions', label: 'Patient-specific changes to the master (if any)', type: 'textarea' }] },
  { key: 'stock', n: 3, label: 'Stock match', hi: 'स्टॉक मिलान', roles: MED, sop: 'SOP 6 · D-19',
    purpose: 'Every ingredient and bottle is in stock with a valid batch; shortages are requested now, not when the shelf is empty.',
    checks: ['Required quantities compared with Stocks (table below)', 'Batch / expiry valid beyond the treatment end date', 'Bottles, droppers, pouches, chits and labels available', 'Shortage request raised where needed'],
    fields: [{ key: 'batchRefs', label: 'Batch / lot references used', type: 'text', required: true }] },
  { key: 'prepare', n: 4, label: 'Medicine preparation', hi: 'दवा बनाना', roles: MED, sop: 'SOP S1 · D-11-14',
    purpose: 'Prepare in prescription order for one patient at a time. Completing this stage draws the actual quantities from Stocks.',
    checks: ['Morning checklist (1-10) complete; hands, table and tools clean; cap, mask, gloves', 'One patient at a time; other patient material kept apart', 'Medicines prepared in prescription order 1 → 2 → 3 … and ticked', 'Every component weighed / measured, not estimated', 'Tools cleaned and dried between medicines'],
    fields: [{ key: 'batchNo', label: 'Preparation batch / job reference', type: 'text', required: true }, { key: 'preparerName', label: 'Prepared by (operator)', type: 'text', required: true }] },
  { key: 'fill', n: 5, label: 'Primary packing & chits', hi: 'पैकिंग व चिट', roles: MED, sop: 'SOP S2 · SOP 7',
    purpose: 'Fill each bottle, dropper and pouch, record actual fill, and confirm every chit below on its pack.',
    checks: ['Each unit filled and actual ml / g recorded; caps and inner seals secure, no leak', 'Powder pouch folded three times with safe outer closure; no exposed staple', 'Every pack carries name, code, patient ID, pack x/n and dose chit', 'Like medicines grouped 2-4 per band; no mixing of codes', 'Morning-evening and noon-night chits not swapped'],
    fields: [{ key: 'unitLog', label: 'Per-unit fill log reference', type: 'text', required: true }] },
  { key: 'qc', n: 6, label: 'Pack QC (independent)', hi: 'क्वालिटी जाँच', roles: MED_DOC, sop: 'SOP S3 · HR-23-25',
    purpose: 'A different person than the preparer checks identity, quantity, appearance, closure, integrity and chits.',
    checks: ['Identity: medicine code, formulation version, batch match the job', 'Quantity: actual g / ml of every pack and pack count match', 'Appearance: colour, smell, moisture, lumps, foreign particles OK', 'Closure and integrity: folds, caps, no leak, tear or loose staple', 'Chits: name, dose, timing, days, pack x/n readable and correct', 'Treatment papers (first supply) present'],
    fields: [{ key: 'result', label: 'QC result', type: 'select', required: true, options: ['PASS', 'HOLD'] }, { key: 'findings', label: 'Findings / deviations', type: 'textarea' }] },
  { key: 'pack1', n: 7, label: 'Packing-1 (open kit)', hi: 'पैकिंग-1 खुली किट', roles: MED, sop: 'SOP S4',
    purpose: 'All QC-passed packs in one open tray per patient, countable, with papers in a separate sleeve. Nothing is sealed yet.',
    checks: ['All QC-passed medicines in one open tray / envelope for this patient', 'Each medicine group with its code and pack count in front', 'Bottles, droppers, packets and chits all visible; nothing loose', 'Treatment papers (as applicable) in a separate clean sleeve', 'Packing-1 checklist (name, ID, age, formula, months, supply) attached; not bubble-wrapped'],
    fields: [{ key: 'kitLocation', label: 'Kit tray / location', type: 'text', required: true }] },
  { key: 'doctor', n: 8, label: 'Doctor verification', hi: 'डॉक्टर सत्यापन', roles: DOC, sop: 'SOP S5',
    purpose: 'The doctor physically checks the open kit against the prescription: patient, supply part, every medicine, dose, counts, packaging and papers.',
    checks: ['Patient identity, age group, program and current approved order', 'Supply part correct (full 6 months, or first / rest of 1+5 / 2+4)', 'Every medicine name, code and formulation version; approved substitutions only', 'Dose, timing, route, duration per prescription; age contraindications', 'Bottle, dropper and pack counts; full / partial fills', 'Packaging safe: no leak, legible print, no metal contact', 'Treatment papers: right patient, ID and version; nothing extra or missing'],
    fields: [{ key: 'result', label: 'Decision', type: 'select', required: true, options: ['PASS', 'HOLD'] }, { key: 'remarks', label: 'Remarks', type: 'textarea', required: true }] },
  { key: 'photos', n: 9, label: 'Photos A & B', hi: 'फोटो', roles: MED, sop: 'SOP S6',
    purpose: 'One circular overview photo of all medicines (Photo A) and one readable overview of the treatment papers (Photo B).',
    checks: ['Photo A: all medicines in a circle, every name / code facing the camera, counts visible, job ID slip in frame', 'Photo B: every paper heading, patient name and ID readable (or an approved scan attached)', 'Both photos sharp, well lit and reviewed for readability'],
    fields: [], files: [{ key: 'photoA', label: 'Photo A - medicine overview', required: true }, { key: 'photoB', label: 'Photo B - treatment papers', required: false }] },
  { key: 'pack2', n: 10, label: 'Packing-2 (final parcel)', hi: 'पैकिंग-2 अंतिम पार्सल', roles: MED, sop: 'SOP S7',
    purpose: 'Secure bundle, bubble wrap, tested box, tape, logo and recipient label. Parents / Courier slip faces outward.',
    checks: ['Doctor PASS and both photos accepted', 'Parents / Courier information slip on the correct outward side', 'Bottles and droppers upright, leak-safe cushioning; pouches and papers protected', 'Box size tested for this kit; voids filled; no movement', 'Tape, logo stickers and recipient label applied'],
    fields: [{ key: 'boxCode', label: 'Box used', type: 'select', required: true, options: ['BX-55 (5x5)', 'BX-L 8x10', 'BX-L 9x10', 'BX-L 10x10', 'Other'] }, { key: 'weight', label: 'Parcel weight (g)', type: 'number', required: true }, { key: 'materials', label: 'Materials used / wastage', type: 'text' }] },
  { key: 'final', n: 11, label: 'Final check - medicine ready', hi: 'अंतिम जाँच', roles: MED_DOC, sop: 'SOP S8',
    purpose: 'An independent final checker reconciles the parcel with the job. PASS marks the medicine READY (not released).',
    checks: ['Patient, prescription and supply part match', 'Bottle, dropper and packet counts reconciled; lids and seals intact', 'Medicine papers: same patient name and code on each; first / repeat set complete', 'Photo A and Photo B linked and accepted', 'Outer box intact, correct size, logo; recipient details verified'],
    fields: [{ key: 'checkerName', label: 'Final checker (different from packer)', type: 'text', required: true }, { key: 'remarks', label: 'Remarks', type: 'textarea' }] },
  { key: 'release', n: 12, label: 'Release to In Transit', hi: 'रिलीज़', roles: MED, sop: 'SOP S8 · SOP 2',
    purpose: 'Hand the parcel to In Transit. Allowed only after full verified payment; the medicine stays in department custody until then.',
    checks: ['Full payment verified by In Transit (checked automatically)', 'Parcel and package ID match this job', 'Receiving In Transit staff recorded'],
    fields: [{ key: 'handedTo', label: 'Handed to (In Transit staff)', type: 'text', required: true }] },
];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

const iso = (v) => (v ? new Date(v).toISOString() : null);
const plain = (v) => (v?.toObject ? v.toObject() : v) || {};

// Hours left to the ready date, and the SOP priority band.
function urgency(readyByDate, now = new Date()) {
  if (!readyByDate) return { hours: null, level: 'normal' };
  const hours = Math.round((new Date(readyByDate).setHours(23, 59, 59, 999) - now.getTime()) / 3600000);
  return { hours, level: hours < 0 ? 'breached' : hours <= 24 ? 'critical' : hours <= 48 ? 'risk' : 'normal' };
}

function buildJobView(jobDoc, { stocks = [], payment = null, master = null, includeEvents = false, now = new Date() } = {}) {
  const job = plain(jobDoc);
  const done = new Map((job.stages || []).map((s) => [s.key, s]));
  const current = job.status === 'released' ? STAGES.length : job.currentStage || 0;
  const stages = STAGES.map((s, i) => {
    const rec = done.get(s.key);
    // Definition (checks, fields, files) plus what was recorded (values, notes, who, when).
    return {
      ...s,
      state: rec?.doneAt ? 'done' : i === current && job.status !== 'cancelled' ? 'current' : 'todo',
      doneAt: iso(rec?.doneAt), doneByName: rec?.doneByName || '', doneByRole: rec?.doneByRole || '',
      values: rec?.fields || {}, notes: rec?.notes || '',
    };
  });
  const stockByCode = new Map(stocks.map((s) => [s.code, s]));
  const needs = job.formulation ? require('../constants/formulationMaster').stockNeeds(job.formulation) : [];
  const stockTable = needs.map((n) => {
    const item = stockByCode.get(n.code);
    let needInStock = n.qty; let convertible = true;
    if (item && item.unit !== n.unit) {
      if (n.unit === 'spoon' && item.unit === 'g' && item.gramsPerSpoon) needInStock = Math.round(n.qty * item.gramsPerSpoon * 100) / 100;
      else if (n.unit === 'drop' && item.unit === 'ml' && item.dropsPerMl) needInStock = Math.round((n.qty / item.dropsPerMl) * 100) / 100;
      else convertible = false;
    }
    const available = item ? Number(item.currentStock || 0) : null;
    return {
      ...n, itemId: item ? String(item._id) : null, stockUnit: item?.unit || '', available, needInStock: convertible ? needInStock : null, convertible,
      balance: item && convertible ? Math.round((available - needInStock) * 100) / 100 : null,
      expiryDate: iso(item?.expiryDate), batchNo: item?.batchNo || '',
      status: !item ? 'missing' : !convertible ? 'manual' : available < needInStock ? 'short' : item.expiryDate && job.readyByDate && new Date(item.expiryDate) < new Date(new Date(job.readyByDate).getTime() + (job.formulation?.days || 0) * 86400000) ? 'expires' : 'ok',
    };
  });
  const u = urgency(job.readyByDate, now);
  return {
    id: String(job._id),
    patientId: String(job.patient), patientCode: job.patientCode, patientName: job.patientName, phase: job.phase, requestId: job.requestId,
    purchaseOrderId: job.purchaseOrder ? String(job.purchaseOrder) : '', poNumber: job.poNumber,
    supplyPlan: job.supplyPlan, supplyPart: job.supplyPart, supplyLabel: supplyLabel(job.supplyPlan, job.supplyPart), ageBand: job.ageBand, ageBandLabel: AGE_BANDS[job.ageBand] || '',
    medicines: job.medicines, requestNotes: job.requestNotes, requestedAt: iso(job.requestedAt), requestedByName: job.requestedByName, readyByDate: iso(job.readyByDate),
    status: job.status, currentStage: current, currentKey: STAGES[current]?.key || '', totalStages: STAGES.length,
    progress: Math.round((stages.filter((s) => s.state === 'done').length / STAGES.length) * 100),
    hold: job.hold?.active ? { ...job.hold, at: iso(job.hold.at) } : null,
    urgency: u,
    formulation: job.formulation || null,
    stockTable,
    consumption: (job.consumption || []).map((c) => ({ ...c, txId: c.txId ? String(c.txId) : null })),
    chits: (job.chits || []).map((c) => ({ ...c, confirmedAt: iso(c.confirmedAt) })),
    photos: job.photos || { overview: [], papers: [] },
    payment,
    stages,
    preparerName: done.get('prepare')?.fields?.preparerName || done.get('prepare')?.doneByName || '',
    // The doctor changed the Formulation Master after this sheet was built and the sheet can still be rebuilt.
    masterVersion: master?.version ?? null,
    masterOutdated: Boolean(master && master.source === 'edited' && job.formulation && (job.formulation.master?.version || 0) < (master.version || 0) && job.status === 'open' && current <= STAGE_INDEX.stock),
    packerName: done.get('pack2')?.doneByName || '',
    createdAt: iso(job.createdAt), updatedAt: iso(job.updatedAt),
    ...(includeEvents ? { events: [...(job.events || [])].reverse().map((e) => ({ ...plain(e), at: iso(e.at) })) } : {}),
  };
}

// Compact progress for the PO details page (In Transit sees which Medicine Department steps are done).
function jobSummary(jobDoc) {
  if (!jobDoc) return null;
  const v = buildJobView(jobDoc);
  return {
    id: v.id, status: v.status, progress: v.progress, hold: v.hold, urgency: v.urgency, readyByDate: v.readyByDate,
    currentLabel: v.status === 'released' ? 'Released to In Transit' : v.status === 'ready' ? 'Medicine ready - awaiting release' : (STAGES[v.currentStage]?.label || ''),
    stages: v.stages.map((s) => ({ key: s.key, n: s.n, label: s.label, state: s.state, doneAt: s.doneAt, doneByName: s.doneByName })),
  };
}

module.exports = { STAGES, STAGE_INDEX, buildJobView, jobSummary, urgency };
