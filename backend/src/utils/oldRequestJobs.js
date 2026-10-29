// Medicine requests made before the fulfilment timeline have no MedicineJob until someone opens one, so they wait on
// the Medicine Requests page and never reach the fulfilment queue. On startup every such request still in progress
// gets its job (at the stage its status says), where the admin, the doctor and the Medicine Department move it on.
// Idempotent: a request that already has a job is skipped.
const ACTIVE = ['requested', 'in_process', 'made'];
const SYSTEM = { name: 'System', role: 'admin' };

const requestsOf = (stage) => [
  ...(stage.medicineRequests || []),
  ...(stage.medicineRequest && ACTIVE.includes(stage.medicineRequest.status) ? [stage.medicineRequest] : []),
];

async function openJobsForOldRequests({ log = () => {} } = {}) {
  const Patient = require('../models/Patient');
  const MedicineJob = require('../models/MedicineJob');
  const { findOrCreateJob } = require('../controllers/medicineJobController');
  const patients = await Patient.find({ $or: [{ 'stages.medicineRequests.status': { $in: ACTIVE } }, { 'stages.medicineRequest.status': { $in: ACTIVE } }] });
  let opened = 0;
  for (const patient of patients) {
    for (const stage of patient.stages || []) {
      for (const request of requestsOf(stage)) {
        if (!ACTIVE.includes(request.status)) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await MedicineJob.exists({ patient: patient._id, phase: stage.number, requestId: request.requestId || 'legacy' })) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await findOrCreateJob({ patient, stage, request, user: SYSTEM });
          opened += 1;
        } catch (error) { log(`Old request ${patient.patientName} Phase ${stage.number}: job not opened (${error.message})`); }
      }
    }
  }
  if (opened) log(`Medicine jobs opened for ${opened} old request(s)`);
  return { opened };
}

// Jobs opened in the middle of an old request (at "in process", "made" or "sent to courier"), or made before a stage
// was added, have stages before their current one with no record: those show as "not done" though the job is past
// them, and they lock. Each such stage gets a record "done in the old flow", so the job reads in order and goes on from
// where it is. A job whose medicine already left (dispatched / delivered) in the old flow is closed as released.
// Nothing is reset and no stock moves. Idempotent: only missing records are added.
const OLD_FLOW_NOTE = 'Done before the fulfilment timeline (old request) - no record of this step';
async function settleOldJobs({ log = () => {} } = {}) {
  const MedicineJob = require('../models/MedicineJob');
  const Patient = require('../models/Patient');
  const { STAGES } = require('./medicineJobFlow');
  const jobs = await MedicineJob.find({ status: { $in: ['open', 'ready', 'released'] } });
  let filled = 0; let closed = 0;
  for (const job of jobs) {
    let upTo = job.status === 'released' ? STAGES.length : (job.currentStage || 0);
    // Medicine that already reached the patient in the old flow: the job is done.
    if (job.status !== 'released') {
      // eslint-disable-next-line no-await-in-loop
      const patient = await Patient.findById(job.patient).select('stages.number stages.medicineRequests stages.medicineRequest').lean();
      const stage = (patient?.stages || []).find((s) => s.number === job.phase);
      const request = [...(stage?.medicineRequests || []), stage?.medicineRequest].find((r) => r && (r.requestId || 'legacy') === job.requestId);
      if (request && ['dispatched', 'delivered'].includes(request.courier?.status)) { upTo = STAGES.length; job.status = 'released'; job.currentStage = STAGES.length; closed += 1; }
    }
    const have = new Set(job.stages.map((s) => s.key));
    const missing = STAGES.slice(0, upTo).filter((s) => !have.has(s.key));
    if (!missing.length && job.isModified('status') === false) continue;
    // Dated like the first stage after it that has a record (else the job's own start).
    const doneAtOf = (key) => {
      const later = STAGES.slice(STAGES.findIndex((s) => s.key === key) + 1).map((s) => job.stages.find((r) => r.key === s.key)).find(Boolean);
      return later?.doneAt || job.requestedAt || job.createdAt || new Date();
    };
    missing.forEach((s) => job.stages.push({ key: s.key, doneAt: doneAtOf(s.key), doneByName: 'Old request', doneByRole: '', checks: [], fields: {}, notes: OLD_FLOW_NOTE, snapshot: { oldFlow: true } }));
    if (missing.length) {
      job.events.push({ at: new Date(), action: 'Old request settled', details: `Marked as done in the old flow: ${missing.map((s) => s.label).join(', ')}`, byName: 'System', byRole: '' });
      filled += 1;
    }
    // eslint-disable-next-line no-await-in-loop
    await job.save();
  }
  if (filled || closed) log(`Old medicine jobs settled: ${filled} job(s) got their earlier steps, ${closed} closed as already handed over`);
  return { filled, closed };
}

module.exports = { openJobsForOldRequests, settleOldJobs };
