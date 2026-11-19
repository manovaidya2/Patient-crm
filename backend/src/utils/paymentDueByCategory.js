// Control Room: active patients whose phase still has payment due, grouped by the category of that phase's supply
// (1 month, 45 days, 6 months ...). Due is counted as on the Payment Due Ledger: package total of the phase minus the
// approved payments (refunds paid out taken off); payments waiting for approval are shown beside it.
const { lengthOf, requestsOf, PROGRAM } = require('./lastMedicineSupply');

const approved = (p) => (p.approvalStatus || 'approved') === 'approved';
const refunded = (p) => (p.refunds || []).filter((r) => ['paid', 'settled'].includes(r.status)).reduce((s, r) => s + Number(r.amount || 0), 0);
const net = (p) => (approved(p) ? Number(p.amount || 0) - refunded(p) : 0);
const time = (d) => (d ? new Date(d).getTime() : 0);
const iso = (d) => (d ? new Date(d).toISOString() : null);

// The supply of a phase: its newest purchase order, else its newest medicine request (the fulfilment job's plan wins
// for that request, as the doctor can correct it). `posOf(patientId, phase)` -> POs; `jobPlanOf(patientId, phase,
// requestId)` -> { plan, part } or null.
function phaseSupply(patient, stage, posOf, jobPlanOf) {
  const pos = posOf(String(patient._id), stage.number).filter((po) => po.supplyPlan).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const requests = requestsOf(stage).filter((r) => r.status && r.status !== 'cancelled').sort((a, b) => time(b.requestedAt) - time(a.requestedAt));
  const request = requests[0];
  const job = request ? jobPlanOf(String(patient._id), stage.number, request.requestId || 'legacy') : null;
  if (job?.plan) return { plan: job.plan, part: job.part, poNumber: request.poNumber || pos[0]?.poNumber || '' };
  if (pos[0]) return { plan: pos[0].supplyPlan, part: pos[0].supplyPart, poNumber: pos[0].poNumber || '' };
  if (request?.supplyPlan) return { plan: request.supplyPlan, part: request.supplyPart, poNumber: request.poNumber || '' };
  return { plan: '', part: '', poNumber: pos[0]?.poNumber || request?.poNumber || '' };
}

function paymentDueByCategory(patients, { posOf = () => [], jobPlanOf = () => null } = {}) {
  const groups = new Map();
  for (const patient of patients) {
    for (const stage of patient.stages || []) {
      const totalAmount = Number(stage.totalAmount || 0);
      if (totalAmount <= 0) continue;
      const payments = stage.payments || [];
      const paidAmount = payments.reduce((s, p) => s + net(p), 0);
      const dueAmount = Math.max(totalAmount - paidAmount, 0);
      if (dueAmount <= 0) continue;
      const pendingApprovalAmount = payments.filter((p) => p.approvalStatus === 'pending').reduce((s, p) => s + Number(p.amount || 0), 0);
      const lastPayment = payments.filter(approved).map((p) => p.date || p.createdAt).filter(Boolean).sort((a, b) => time(b) - time(a))[0] || null;
      const supply = phaseSupply(patient, stage, posOf, jobPlanOf);
      const { option, days, label, key, order } = lengthOf(supply.plan, supply.part);
      if (!groups.has(key)) groups.set(key, { key, days, order, label, patients: [] });
      groups.get(key).patients.push({
        patientId: String(patient._id), patientName: patient.patientName || '', patientCode: patient.patientCode || '',
        program: PROGRAM[patient.category] || '', phase: stage.number, supplyLabel: option?.label || '', poNumber: supply.poNumber,
        totalAmount, paidAmount, dueAmount, pendingApprovalAmount, lastPaymentAt: iso(lastPayment),
      });
    }
  }
  const list = [...groups.values()];
  list.forEach((g) => g.patients.sort((a, b) => b.dueAmount - a.dueAmount || a.patientName.localeCompare(b.patientName)));
  return list.sort((a, b) => a.order - b.order)
    .map((g) => ({ ...g, count: g.patients.length, totalDue: g.patients.reduce((s, p) => s + p.dueAmount, 0) }));
}

module.exports = { paymentDueByCategory, phaseSupply };
