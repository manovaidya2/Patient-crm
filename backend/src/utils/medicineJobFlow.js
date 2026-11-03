// The Medicine Department's thirteen fulfilment stages (Packing SOP V3 + Fulfilment Desk), with the checklist, fields and
// owner of each. Everything the page shows per stage is defined here, so the backend validates exactly what the UI asks.
const { ROLES } = require('../constants/roles');
const { AGE_BANDS, supplyLabel } = require('../constants/supplyPlans');
const { medicineDelays } = require('./medicineDelay');

const MED = [ROLES.MEDICINE_DEPARTMENT, ROLES.ADMIN];
const DOC = [ROLES.DOCTOR, ROLES.ADMIN];
const TRANSIT = [ROLES.IN_TRANSIT, ROLES.ADMIN];
// The PCC the admin chose for treatment papers (checked in the controller; see controllers/treatmentPaperController).
const PCC = [ROLES.ASSISTANT_DOCTOR, ROLES.ADMIN];
// Each stage is filled by its owner only (admin can step in anywhere): the doctor fills the doctor stages, In Transit
// the final check (from the PO timeline), the Medicine Department everything else. Kept as a name for the stages the doctor used to share.
const MED_DOC = MED;

// field: { key, label, type: text|date|number|select|textarea, required, options }
const STAGES = [
  { key: 'accept', n: 1, label: 'Accept Order', hi: 'ऑर्डर स्वीकार', roles: MED, sop: 'SOP S0',
    purpose: 'Accept the request from In Transit and commit to a ready date. Acceptance starts the department timeline.',
    checks: ['Patient ID, name and phase match the purchase order', 'Supply (6 months / 1+5 / 2+4 part) and age group identified', 'Patient file (Records Room) read, or Reception asked to scan it', 'Ready-by date is achievable'],
    fields: [{ key: 'readyByDate', label: 'Medicine will be ready by', type: 'date', required: true }] },
  // Step 2 is the doctor's: the formulation of this patient is made from the prescription (built from the Formulation
  // Master and edited, or created for a custom supply / 0-3 years). Changes are for this patient's request only; the
  // Formulation Master is not touched. The Medicine Department waits (their page shows the step locked).
  { key: 'formula', n: 2, label: 'Prescription & formulation (Doctor)', hi: 'पर्चा व फ़ॉर्मूला - डॉक्टर', roles: DOC, sop: 'Doctor sign-off',
    purpose: 'The doctor reads the prescription and the patient file and makes this patient\'s formulation: edit the sheet (dose, timing, quantity), add or remove medicines, or create it when there is no Formulation Master. Completing this step sends the formulation to the Medicine Department.',
    checks: ['Prescription and patient file read', 'Every medicine, dose, timing and total quantity is right for this patient', 'Medicines to add or remove for this patient are done on the sheet'],
    fields: [{ key: 'remarks', label: 'Doctor remarks', type: 'textarea' }] },
  // Step 3: the Medicine Department gets the formulation exactly as the doctor sent it and works from it. Nothing is
  // changed here; an unclear point goes back to the doctor (hold).
  { key: 'review', n: 3, label: 'Formulation from doctor', hi: 'डॉक्टर का फ़ॉर्मूला', roles: MED, sop: 'SOP 5 · HR-17',
    purpose: 'The formulation sheet as the doctor sent it. Read it before stock and preparation: doses, totals, packs and days. Anything unclear goes back to the doctor - nothing is changed or assumed here.',
    checks: ['Formulation sheet received from the doctor; patient name and ID match', 'Age group and supply part match the purchase order', 'Every medicine, dose, timing and total quantity is clear', 'Unclear points asked to the doctor - nothing assumed'],
    fields: [] },
  { key: 'stock', n: 3, label: 'Stock match', hi: 'स्टॉक मिलान', roles: MED, sop: 'SOP 6 · D-19',
    purpose: 'Every ingredient and bottle is in stock with a valid batch; shortages are requested now, not when the shelf is empty.',
    checks: ['Required quantities compared with Stocks (table below)', 'Batch / expiry valid beyond the treatment end date', 'Bottles, droppers, pouches, chits and labels available', 'Shortage request raised where needed'],
    // The batch of each item is already shown in the stock table (from Stocks), so nothing is typed here.
    fields: [] },
  { key: 'prepare', n: 4, label: 'Medicine preparation', hi: 'दवा बनाना', roles: MED, sop: 'SOP S1 · D-11-14',
    purpose: 'Prepare in prescription order for one patient at a time. Completing this stage draws the actual quantities from Stocks.',
    checks: ['Morning checklist (1-10) complete; hands, table and tools clean; cap, mask, gloves', 'One patient at a time; other patient material kept apart', 'Medicines prepared in prescription order 1 → 2 → 3 … and ticked', 'Every component weighed / measured, not estimated', 'Tools cleaned and dried between medicines'],
    // The person completing the stage is recorded as the preparer; nothing else is typed.
    fields: [] },
  { key: 'fill', n: 5, label: 'Primary packing & chits', hi: 'पैकिंग व चिट', roles: MED, sop: 'SOP S2 · SOP 7',
    purpose: 'Fill each bottle, dropper and pouch, record actual fill, and confirm every chit below on its pack.',
    checks: ['Each unit filled and actual ml / g recorded; caps and inner seals secure, no leak', 'Powder pouch folded three times with safe outer closure; no exposed staple', 'Every pack carries name, code, patient ID, pack x/n and dose chit', 'Like medicines grouped 2-4 per band; no mixing of codes', 'Morning-evening and noon-night chits not swapped'],
    fields: [] },
  { key: 'pack1', n: 7, label: 'Packing-1 (open kit)', hi: 'पैकिंग-1 खुली किट', roles: MED, sop: 'SOP S4',
    purpose: 'All packs in one open tray per patient, countable, with papers in a separate sleeve. Nothing is sealed yet: In Transit checks the open kit next (quality check).',
    checks: ['All medicines in one open tray / envelope for this patient', 'Each medicine group with its code and pack count in front', 'Bottles, droppers, packets and chits all visible; nothing loose', 'Packing-1 checklist (name, ID, age, formula, months, supply) attached; not bubble-wrapped', 'One photo of all the medicines together, every name / code visible'],
    // The photo of the open kit (all medicines together) is taken here, where the medicines are.
    fields: [], files: [{ key: 'photoA', label: 'All medicines together', required: true }] },
  // Step 8: In Transit checks the open kit the Medicine Department packed (key kept as 'qc'). HOLD puts the job on hold
  // for the Medicine Department to correct; they resume it and In Transit checks again. The Medicine Department can
  // ring an alarm on In Transit's screen while it waits.
  { key: 'qc', n: 8, label: 'Quality check', hi: 'क्वालिटी जाँच', roles: TRANSIT, sop: 'SOP S3 · HR-23-25',
    purpose: 'In Transit checks the open kit (Packing-1): identity, quantity, appearance, closure, integrity and chits. HOLD sends it back to the Medicine Department to correct.',
    checks: ['Identity: medicine code, formulation version, batch match the job', 'Quantity: actual g / ml of every pack and pack count match', 'Appearance: colour, smell, moisture, lumps, foreign particles OK', 'Closure and integrity: folds, caps, no leak, tear or loose staple', 'Chits: name, dose, timing, days, pack x/n readable and correct', 'Treatment papers (first supply) present'],
    fields: [{ key: 'result', label: 'QC result', type: 'select', required: true, options: ['PASS', 'HOLD'] }, { key: 'findings', label: 'Findings / deviations', type: 'textarea' }] },
  // Key kept as 'photos' (older jobs carry it). Every paper that goes with the kit is photographed page by page.
  // Step 9: the treatment papers are made by the PCC the admin chose (Make Treatment Paper page). The Medicine
  // Department waits (locked) and can ring the PCC's alarm. Papers are added by name with every page.
  { key: 'photos', n: 9, label: 'Make treatment papers', hi: 'ट्रीटमेंट पेपर बनाना', roles: PCC, sop: 'SOP S6',
    purpose: 'The PCC chosen by the admin makes this kit\'s treatment papers (medicine paper, diet plan ...) from the doctor\'s formulation and adds each one with its name and every page. The doctor checks them in the next step.',
    checks: ['Every paper for this supply is made, with the patient name and ID on it', 'Doses and timings on the papers match the formulation from the doctor', 'Every page of every paper added and readable'],
    fields: [] },
  { key: 'doctor', n: 10, label: 'Doctor verification', hi: 'डॉक्टर सत्यापन', roles: DOC, sop: 'SOP S5',
    purpose: 'The doctor checks the open kit against the prescription and verifies steps 7, 8 and 9 (Packing-1, the quality check and the medicine dose papers, shown below): patient, supply part, every medicine, dose, counts, packaging and papers.',
    checks: ['Packing-1 (step 7), quality check (step 8) and the dose papers (step 9) checked below', 'Patient identity, age group, program and current approved order', 'Supply part correct (full 6 months, or first / rest of 1+5 / 2+4)', 'Every medicine name, code and formulation version; approved substitutions only', 'Dose, timing, route, duration per prescription; age contraindications', 'Bottle, dropper and pack counts; full / partial fills', 'Packaging safe: no leak, legible print, no metal contact', 'Treatment papers: right patient, ID and version; nothing extra or missing'],
    // A HOLD says what to correct in the stage notes; the kit goes back to Packing-1.
    fields: [{ key: 'result', label: 'Decision', type: 'select', required: true, options: ['PASS', 'HOLD'] }] },
  { key: 'pack2', n: 10, label: 'Packing-2 (final parcel)', hi: 'पैकिंग-2 अंतिम पार्सल', roles: MED, sop: 'SOP S7',
    purpose: 'Secure bundle, bubble wrap, tested box, tape, logo and recipient label. Parents / Courier slip faces outward.',
    checks: ['Doctor PASS; medicine photo and every paper page accepted', 'Parents / Courier information slip on the correct outward side', 'Bottles and droppers upright, leak-safe cushioning; pouches and papers protected', 'Box size tested for this kit; voids filled; no movement', 'Tape, logo stickers and recipient label applied'],
    fields: [{ key: 'boxCode', label: 'Box used', type: 'select', required: true, options: ['BX-55 (5x5)', 'BX-L 8x10', 'BX-L 9x10', 'BX-L 10x10', 'Other'] }, { key: 'weight', label: 'Parcel weight (kg)', type: 'number', step: 'any', required: true }, { key: 'materials', label: 'Materials used / wastage', type: 'text' }] },
  { key: 'final', n: 11, label: 'Final check pending', hi: 'अंतिम जाँच', roles: TRANSIT, sop: 'SOP S8',
    purpose: 'In Transit checks the packed parcel against the job before it goes out. PASS marks the medicine READY (not released).',
    checks: ['Patient, prescription and supply part match', 'Bottle, dropper and packet counts reconciled; lids and seals intact', 'Medicine papers: same patient name and code on each; first / repeat set complete', 'Medicine photo and every dose-paper page linked and accepted', 'Outer box intact, correct size, logo; recipient details verified'],
    fields: [{ key: 'remarks', label: 'Remarks', type: 'textarea' }] },
  { key: 'release', n: 12, label: 'Release to In Transit', hi: 'रिलीज़', roles: MED, sop: 'SOP S8 · SOP 2',
    purpose: 'Hand the parcel to In Transit. Allowed only after full verified payment; the medicine stays in department custody until then.',
    checks: ['Full payment verified by In Transit (checked automatically)', 'Parcel and package ID match this job', 'Receiving In Transit staff recorded'],
    fields: [] },
];
// Numbered in order (1 ... 13).
STAGES.forEach((s, i) => { s.n = i + 1; });
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

// A request from before the fulfilment timeline (no purchase order) is moved through its stages by the admin and the
// doctor too, so the old requests still waiting can be completed.
const isOldFlow = (job) => !job?.purchaseOrder && !job?.poNumber;
const stageRoles = (stage, job) => (stage && isOldFlow(job) ? [...new Set([...stage.roles, ROLES.ADMIN, ROLES.DOCTOR])] : stage?.roles || []);

const iso = (v) => (v ? new Date(v).toISOString() : null);
const plain = (v) => (v?.toObject ? v.toObject() : v) || {};

// Hours left to the ready date, and the SOP priority band.
function urgency(readyByDate, now = new Date()) {
  if (!readyByDate) return { hours: null, level: 'normal' };
  const hours = Math.round((new Date(readyByDate).setHours(23, 59, 59, 999) - now.getTime()) / 3600000);
  return { hours, level: hours < 0 ? 'breached' : hours <= 24 ? 'critical' : hours <= 48 ? 'risk' : 'normal' };
}

function buildJobView(jobDoc, { stocks = [], payment = null, master = null, includeEvents = false, dispatch = {}, now = new Date() } = {}) {
  const job = plain(jobDoc);
  const done = new Map((job.stages || []).map((s) => [s.key, s]));
  const current = job.status === 'released' ? STAGES.length : job.currentStage || 0;
  const stages = STAGES.map((s, i) => {
    const rec = done.get(s.key);
    const roles = stageRoles(s, job);
    // Definition (checks, fields, files) plus what was recorded (values, notes, who, when).
    return {
      ...s, roles,
      state: rec?.doneAt ? 'done' : i === current && job.status !== 'cancelled' ? 'current' : 'todo',
      doneAt: iso(rec?.doneAt), doneByName: rec?.doneByName || '', doneByRole: rec?.doneByRole || '',
      values: rec?.fields || {}, notes: rec?.notes || '', snapshot: rec?.snapshot || null,
      // Which checklist lines were ticked when the stage was completed.
      checksDone: rec ? s.checks.map((_, n) => rec.checks?.[n] !== false) : [],
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
    // Before the fulfilment timeline (no PO): the admin and the doctor can fill every stage.
    oldFlow: isOldFlow(job),
    id: String(job._id),
    patientId: String(job.patient), patientCode: job.patientCode, patientName: job.patientName, phase: job.phase, requestId: job.requestId,
    purchaseOrderId: job.purchaseOrder ? String(job.purchaseOrder) : '', poNumber: job.poNumber,
    supplyPlan: job.supplyPlan, supplyPart: job.supplyPart, supplyLabel: supplyLabel(job.supplyPlan, job.supplyPart), ageBand: job.ageBand, ageBandLabel: AGE_BANDS[job.ageBand] || '',
    medicines: job.medicines, caseCategory: job.caseCategory || '', requestNotes: job.requestNotes, requestedAt: iso(job.requestedAt), requestedByName: job.requestedByName, readyByDate: iso(job.readyByDate),
    status: job.status, currentStage: current, currentKey: STAGES[current]?.key || '', totalStages: STAGES.length,
    progress: Math.round((stages.filter((s) => s.state === 'done').length / STAGES.length) * 100),
    hold: job.hold?.active ? { ...job.hold, at: iso(job.hold.at) } : null,
    returned: job.returned?.at ? { reason: job.returned.reason, at: iso(job.returned.at), byName: job.returned.byName } : null,
    // The last alarm the Medicine Department rang for In Transit (for the step it was rung on).
    transitAlarm: job.transitAlarm?.at ? { at: iso(job.transitAlarm.at), byName: job.transitAlarm.byName || '', note: job.transitAlarm.note || '', stageKey: job.transitAlarm.stageKey || '' } : null,
    returns: (job.returns || []).map((r) => ({ reason: r.reason, at: iso(r.at), byName: r.byName, resentAt: iso(r.resentAt), resentByName: r.resentByName || '' })),
    urgency: u,
    // Days late against the date fixed in post counselling: made (final check) and released to In Transit.
    delay: medicineDelays({ expected: job.readyByDate, madeAt: done.get('final')?.doneAt, releasedAt: done.get('release')?.doneAt, ...dispatch, now }),
    formulation: job.formulation || null,
    stockTable,
    consumption: (job.consumption || []).map((c) => ({ ...c, txId: c.txId ? String(c.txId) : null })),
    chits: (job.chits || []).map((c) => ({ ...c, confirmedAt: iso(c.confirmedAt) })),
    photos: { overview: job.photos?.overview || [], papers: job.photos?.papers || [], paperSets: job.photos?.paperSets || [] },
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
    id: v.id, status: v.status, currentKey: v.currentKey, progress: v.progress, hold: v.hold, returned: v.returned, photos: v.photos, urgency: v.urgency, readyByDate: v.readyByDate, delay: v.delay,
    currentLabel: v.status === 'released' ? 'Released to In Transit' : v.status === 'ready' ? 'Medicine ready - awaiting release' : (STAGES[v.currentStage]?.label || ''),
    stages: v.stages.map((s) => ({
      key: s.key, n: s.n, label: s.label, state: s.state, doneAt: s.doneAt, doneByName: s.doneByName, purpose: s.purpose || '', roles: s.roles, checks: s.checks,
      // Ticked checklist lines, filled values and notes of a finished stage.
      done: s.state === 'done' ? [
        ...s.checks.filter((_, n) => s.checksDone[n]),
        ...(s.fields || []).map((f) => [f.label, s.values?.[f.key]]).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => `${label}: ${value}`),
        ...(s.notes ? [`Notes: ${s.notes}`] : []),
      ] : [],
    })),
  };
}

module.exports = { STAGES, STAGE_INDEX, isOldFlow, stageRoles, buildJobView, jobSummary, urgency };

