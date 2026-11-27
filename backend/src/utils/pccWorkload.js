// The automatic PCC choice at "Schedule explanation & assign PCC" (asked 2026-11-27): the PCC with the fewest patients
// gets the new patient; an equal count goes round robin (the one given a patient longest ago first). A PCC on leave
// today comes last. Workload = the number of active patients whose PCC they are (Patient.assignedDoctor) — only the
// patients count, not their follow-ups (asked 2026-11-27).
// The ranking is pure (rankPccs); loadPccWorkload reads the database.
const mongoose = require('mongoose');

// rows: [{ id, name, patients, lastAssignedAt, onLeave }] -> the same rows ranked, with `workload` (= patients).
const rankPccs = (rows) => rows
  .map((r) => ({ ...r, patients: Number(r.patients || 0), workload: Number(r.patients || 0) }))
  .sort((a, b) => (Boolean(a.onLeave) - Boolean(b.onLeave))
    || (a.workload - b.workload)
    || ((a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0) - (b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0))
    || String(a.name).localeCompare(String(b.name)));

const loadPccWorkload = async ({ now = new Date() } = {}) => {
  if (mongoose.connection.readyState !== 1) return [];
  const { ROLES } = require('../constants/roles');
  const User = require('../models/User');
  const Patient = require('../models/Patient');
  const C = require('./careSchedule');
  const pccs = await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
  if (!pccs.length) return [];
  const ids = pccs.map((p) => p._id);
  const [patients, assigned] = await Promise.all([
    Patient.aggregate([{ $match: { isActive: { $ne: false }, assignedDoctor: { $in: ids } } }, { $group: { _id: '$assignedDoctor', n: { $sum: 1 } } }]),
    Patient.aggregate([{ $unwind: '$stages' }, { $match: { 'stages.transit.explanationDoctor': { $in: ids }, 'stages.transit.assignedAt': { $type: 'date' } } },
      { $group: { _id: '$stages.transit.explanationDoctor', at: { $max: '$stages.transit.assignedAt' } } }]),
  ]);
  const today = C.dayOf(now);
  const { leavesOf, leaveOn } = require('./careService');
  const leaves = await leavesOf(ids, today, today);
  return rankPccs(pccs.map((p) => ({
    id: String(p._id), name: p.name,
    patients: patients.find((x) => String(x._id) === String(p._id))?.n || 0,
    lastAssignedAt: assigned.find((x) => String(x._id) === String(p._id))?.at || null,
    onLeave: Boolean(leaveOn(leaves, p._id, today)),
  })));
};

module.exports = { rankPccs, loadPccWorkload };
