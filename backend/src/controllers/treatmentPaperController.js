// Make Treatment Paper: fulfilment step 9 is done by one PCC (Patient Care Coordinator, role assistant_doctor), chosen
// by the admin. That PCC gets every kit waiting for its treatment papers on this page; the Medicine Department waits
// (and can ring the PCC's alarm).
const mongoose = require('mongoose');
const MedicineJob = require('../models/MedicineJob');
const User = require('../models/User');
const InventorySetting = require('../models/InventorySetting');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { STAGES, STAGE_INDEX } = require('../utils/medicineJobFlow');
const { AGE_BANDS, supplyLabel } = require('../constants/supplyPlans');

const KEY = 'treatmentPaperPcc';
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };

// The PCC the admin chose: { id, name } or null (then any PCC may make the papers).
const getPaperPcc = async () => {
  const doc = await InventorySetting.findOne({ key: KEY }).lean();
  return doc?.value?.id ? { id: String(doc.value.id), name: doc.value.name || '' } : null;
};
// Throws when a PCC other than the chosen one tries step 9.
const assertPaperPcc = async (user) => {
  if (user.role !== ROLES.ASSISTANT_DOCTOR) return;
  const pcc = await getPaperPcc();
  if (pcc && pcc.id !== String(user._id)) fail(`Treatment papers are made by ${pcc.name} (chosen by the admin)`, 403);
};
// Whether this user sees the Make Treatment Paper requests.
const isPaperMaker = async (user) => isAdminLike(user) || (user.role === ROLES.ASSISTANT_DOCTOR && (!(await getPaperPcc()) || (await getPaperPcc()).id === String(user._id)));

// @route GET /api/treatment-papers/setting
const getSetting = asyncHandler(async (req, res) => {
  const pccs = await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
  res.json({ success: true, pcc: await getPaperPcc(), pccs: pccs.map((u) => ({ id: String(u._id), name: u.name })) });
});

// @route PUT /api/treatment-papers/setting   body: { pccId }  (admin)
const saveSetting = asyncHandler(async (req, res) => {
  const id = String(req.body?.pccId || '');
  let value = null;
  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) fail('Select a PCC');
    const user = await User.findOne({ _id: id, role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').lean();
    if (!user) fail('Select an active PCC');
    value = { id: String(user._id), name: user.name, setByName: req.user.name, setAt: new Date() };
  }
  await InventorySetting.findOneAndUpdate({ key: KEY }, { $set: { value } }, { upsert: true, new: true });
  res.json({ success: true, pcc: value ? { id: value.id, name: value.name } : null });
});

const rowOf = (j) => {
  const stage = (j.stages || []).find((s) => s.key === 'photos');
  const alarm = j.transitAlarm?.at && j.transitAlarm.stageKey === 'photos' ? j.transitAlarm : null;
  return {
    id: String(j._id), purchaseOrderId: j.purchaseOrder ? String(j.purchaseOrder) : '', patientName: j.patientName, patientCode: j.patientCode || '', phase: j.phase, poNumber: j.poNumber || '',
    supplyLabel: supplyLabel(j.supplyPlan, j.supplyPart), ageBandLabel: AGE_BANDS[j.ageBand] || '', readyByDate: j.readyByDate || null,
    waitingSince: (j.stages || []).find((s) => s.key === 'qc')?.doneAt || null,
    doneAt: stage?.doneAt || null, doneByName: stage?.doneByName || '',
    papers: (j.photos?.paperSets || []).map((p) => ({ name: p.name, pages: (p.files || []).length })),
    alarm: alarm ? { at: alarm.at, byName: alarm.byName, note: alarm.note } : null,
  };
};

// @route GET /api/treatment-papers?view=pending|done
const listPapers = asyncHandler(async (req, res) => {
  const pcc = await getPaperPcc();
  if (!(await isPaperMaker(req.user))) return res.json({ success: true, pcc, mine: false, rows: [] });
  const view = req.query.view === 'done' ? 'done' : 'pending';
  const filter = view === 'pending'
    ? { status: 'open', currentStage: STAGE_INDEX.photos }
    : { 'stages.key': 'photos', 'stages.doneAt': { $ne: null } };
  const jobs = await MedicineJob.find(filter).select('patientName patientCode phase poNumber purchaseOrder supplyPlan supplyPart ageBand readyByDate stages photos transitAlarm').sort(view === 'pending' ? { readyByDate: 1 } : { updatedAt: -1 }).limit(view === 'pending' ? 500 : 100).lean();
  res.json({ success: true, pcc, mine: true, step: STAGES[STAGE_INDEX.photos].label, rows: jobs.map(rowOf) });
});

// @route GET /api/treatment-papers/alarms   The Medicine Department rang the PCC's alarm for a kit still waiting.
const paperAlarms = asyncHandler(async (req, res) => {
  if (!(await isPaperMaker(req.user)) || isAdminLike(req.user)) return res.json({ success: true, alarms: [] });
  const jobs = await MedicineJob.find({ status: 'open', currentStage: STAGE_INDEX.photos, 'transitAlarm.stageKey': 'photos', 'transitAlarm.at': { $ne: null } })
    .select('patientName patientCode phase poNumber transitAlarm').lean();
  res.json({ success: true, alarms: jobs.map((j) => ({ id: String(j._id), patientName: j.patientName, patientCode: j.patientCode || '', phase: j.phase, poNumber: j.poNumber || '', step: STAGES[STAGE_INDEX.photos].label, stepNo: STAGE_INDEX.photos + 1, at: j.transitAlarm.at, byName: j.transitAlarm.byName, note: j.transitAlarm.note })) });
});

// Pending count for the sidebar badge (only the chosen PCC, or the admin, has this work).
const pendingPaperCount = async (user) => ((await isPaperMaker(user)) ? MedicineJob.countDocuments({ status: 'open', currentStage: STAGE_INDEX.photos }) : 0);

module.exports = { getPaperPcc, assertPaperPcc, getSetting, saveSetting, listPapers, paperAlarms, pendingPaperCount };
