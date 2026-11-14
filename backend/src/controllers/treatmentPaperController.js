// Treatment papers belong to the Medicine Department while PCC assignment is paused.
// The final medicine check still belongs to the PCC chosen by the admin in Settings.
const mongoose = require('mongoose');
const MedicineJob = require('../models/MedicineJob');
const User = require('../models/User');
const InventorySetting = require('../models/InventorySetting');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { STAGES, STAGE_INDEX } = require('../utils/medicineJobFlow');
const { AGE_BANDS, supplyLabel } = require('../constants/supplyPlans');

const KINDS = {
  papers: { key: 'treatmentPaperPcc', stage: 'photos', after: 'pack1', what: 'makes the treatment papers' },
  final: { key: 'finalCheckPcc', stage: 'final', after: 'pack2', what: 'does the final medicine check' },
};
const kindOf = (value) => (KINDS[value] ? value : 'papers');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };

// The PCC chosen for this kind: { id, name } or null.
const getKindPcc = async (kind = 'papers') => {
  // Treatment-paper PCC assignment is paused; retain the saved setting for later.
  if (kindOf(kind) === 'papers') return null;
  const doc = await InventorySetting.findOne({ key: KINDS[kindOf(kind)].key }).lean();
  return doc?.value?.id ? { id: String(doc.value.id), name: doc.value.name || '' } : null;
};
// Throws when a PCC other than the chosen one tries the step (the admin can always step in).
const assertKindPcc = async (kind, user) => {
  if (kindOf(kind) === 'papers') {
    if (!isAdminLike(user) && user.role !== ROLES.MEDICINE_DEPARTMENT) fail('Treatment papers are made by the Medicine Department', 403);
    return;
  }
  if (user.role !== ROLES.ASSISTANT_DOCTOR) return;
  const pcc = await getKindPcc(kind);
  const { what } = KINDS[kindOf(kind)];
  if (!pcc) fail(`The admin has not chosen who ${what} yet (Settings)`, 403);
  if (pcc.id !== String(user._id)) fail(`${pcc.name} ${what} (chosen by the admin)`.replace(/^./, (c) => c.toUpperCase()), 403);
};
// Whether this user gets this kind's requests.
const isKindWorker = async (kind, user) => {
  if (isAdminLike(user)) return true;
  if (kindOf(kind) === 'papers') return user.role === ROLES.MEDICINE_DEPARTMENT;
  if (user.role !== ROLES.ASSISTANT_DOCTOR) return false;
  const pcc = await getKindPcc(kind);
  return Boolean(pcc) && pcc.id === String(user._id);
};

// @route GET /api/treatment-papers/setting?kind=papers|final
const getSetting = asyncHandler(async (req, res) => {
  if (kindOf(req.query.kind) === 'papers') return res.json({ success: true, pcc: null, pccs: [], disabled: true });
  const pccs = await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
  res.json({ success: true, pcc: await getKindPcc(req.query.kind), pccs: pccs.map((u) => ({ id: String(u._id), name: u.name })) });
});

// @route PUT /api/treatment-papers/setting?kind=papers|final   body: { pccId }  (admin)
const saveSetting = asyncHandler(async (req, res) => {
  if (kindOf(req.query.kind) === 'papers') fail('Treatment-paper assignment is paused. The Medicine Department makes the treatment papers.', 409);
  const id = String(req.body?.pccId || '');
  let value = null;
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) fail('Select a PCC');
    const user = await User.findOne({ _id: id, role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').lean();
    if (!user) fail('Select an active PCC');
    value = { id: String(user._id), name: user.name, setByName: req.user.name, setAt: new Date() };
  }
  await InventorySetting.findOneAndUpdate({ key: KINDS[kindOf(req.query.kind)].key }, { $set: { value } }, { upsert: true, new: true });
  res.json({ success: true, pcc: value ? { id: value.id, name: value.name } : null });
});

const rowOf = (j, kind) => {
  const { stage: key, after } = KINDS[kind];
  const stage = (j.stages || []).find((s) => s.key === key);
  const alarm = j.transitAlarm?.at && j.transitAlarm.stageKey === key ? j.transitAlarm : null;
  return {
    id: String(j._id), purchaseOrderId: j.purchaseOrder ? String(j.purchaseOrder) : '', patientName: j.patientName, patientCode: j.patientCode || '', phase: j.phase, poNumber: j.poNumber || '',
    supplyLabel: supplyLabel(j.supplyPlan, j.supplyPart), ageBandLabel: AGE_BANDS[j.ageBand] || '', readyByDate: j.readyByDate || null,
    waitingSince: (j.stages || []).find((s) => s.key === after)?.doneAt || null,
    doneAt: stage?.doneAt || null, doneByName: stage?.doneByName || '',
    papers: (j.photos?.paperSets || []).map((p) => ({ name: p.name, pages: (p.files || []).length })),
    alarm: alarm ? { at: alarm.at, byName: alarm.byName, note: alarm.note } : null,
  };
};

// @route GET /api/treatment-papers?kind=papers|final&view=pending|done
const listPapers = asyncHandler(async (req, res) => {
  const kind = kindOf(req.query.kind);
  const { stage } = KINDS[kind];
  const pcc = await getKindPcc(kind);
  if (!(await isKindWorker(kind, req.user))) return res.json({ success: true, pcc, mine: false, rows: [] });
  const view = req.query.view === 'done' ? 'done' : 'pending';
  const filter = view === 'pending'
    ? { status: 'open', currentStage: STAGE_INDEX[stage] }
    : { stages: { $elemMatch: { key: stage, doneAt: { $ne: null } } } };
  const jobs = await MedicineJob.find(filter).select('patientName patientCode phase poNumber purchaseOrder supplyPlan supplyPart ageBand readyByDate stages photos transitAlarm').sort(view === 'pending' ? { readyByDate: 1 } : { updatedAt: -1 }).limit(view === 'pending' ? 500 : 100).lean();
  res.json({ success: true, pcc, mine: true, step: STAGES[STAGE_INDEX[stage]].label, stepNo: STAGE_INDEX[stage] + 1, rows: jobs.map((j) => rowOf(j, kind)) });
});

// @route GET /api/treatment-papers/alarms?kind=papers|final   The Medicine Department rang this PCC's alarm.
const paperAlarms = asyncHandler(async (req, res) => {
  const kind = kindOf(req.query.kind);
  if (kind === 'papers') return res.json({ success: true, alarms: [] });
  const { stage } = KINDS[kind];
  if (!(await isKindWorker(kind, req.user)) || isAdminLike(req.user)) return res.json({ success: true, alarms: [] });
  const jobs = await MedicineJob.find({ status: 'open', currentStage: STAGE_INDEX[stage], 'transitAlarm.stageKey': stage, 'transitAlarm.at': { $ne: null } })
    .select('patientName patientCode phase poNumber transitAlarm').lean();
  res.json({ success: true, alarms: jobs.map((j) => ({ id: String(j._id), patientName: j.patientName, patientCode: j.patientCode || '', phase: j.phase, poNumber: j.poNumber || '', step: STAGES[STAGE_INDEX[stage]].label, stepNo: STAGE_INDEX[stage] + 1, at: j.transitAlarm.at, byName: j.transitAlarm.byName, note: j.transitAlarm.note })) });
});

// Pending count for the sidebar badge (only the chosen PCC, or the admin, has this work).
const pendingPaperCount = async (user, kind = 'papers') => ((await isKindWorker(kind, user)) ? MedicineJob.countDocuments({ status: 'open', currentStage: STAGE_INDEX[KINDS[kindOf(kind)].stage] }) : 0);
// The PCC who owns a fulfilment stage key ('photos' / 'final'), or null.
const pccForStage = async (stageKey) => {
  const kind = Object.keys(KINDS).find((k) => KINDS[k].stage === stageKey);
  return kind ? getKindPcc(kind) : null;
};

const getPaperPcc = () => getKindPcc('papers');
const assertPaperPcc = (user) => assertKindPcc('papers', user);

module.exports = { KINDS, getKindPcc, assertKindPcc, pccForStage, getPaperPcc, assertPaperPcc, getSetting, saveSetting, listPapers, paperAlarms, pendingPaperCount };
