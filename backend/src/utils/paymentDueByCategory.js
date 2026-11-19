// Control Room: active patients whose phase still has payment due, grouped by the category of that phase's supply
// (1 month, 45 days, 6 months ...). Due is counted as on the Payment Due Ledger: package total of the phase minus the
// approved payments (refunds paid out taken off); payments waiting for approval are shown beside it.
const { lengthOf, PROGRAM, requestsOf } = require('./lastMedicineSupply');
const { supplyOptionByLabel } = require('../constants/supplyPlans');

const approved = (p) => (p.approvalStatus || 'approved') === 'approved';
const refunded = (p) => (p.refunds || []).filter((r) => ['paid', 'settled'].includes(r.status)).reduce((s, r) => s + Number(r.amount || 0), 0);
const net = (p) => (approved(p) ? Number(p.amount || 0) - refunded(p) : 0);
const time = (d) => (d ? new Date(d).getTime() : 0);
const iso = (d) => (d ? new Date(d).toISOString() : null);

// The supply of a phase, from whatever records it: the newest purchase order of the phase that names a supply (any PO,
// whoever made it - its plan, or the label on the PO paper for an older PO); else the phase's newest medicine request
// (the fulfilment job's plan first, as the doctor can correct it). `posOf(patientId, phase)` -> the phase's POs (not
// cancelled / rejected); `jobPlanOf(patientId, phase, requestId)` -> { plan, part } or null.
const planOfPo = (po) => {
  if (po.supplyPlan) return { plan: po.supplyPlan, part: po.supplyPart || 'full' };
  const option = supplyOptionByLabel(po.paperValues?.supplyOrder);
  return option ? { plan: option.plan, part: option.part } : null;
};
function phaseSupply(patient, stage, posOf, jobPlanOf = () => null) {
  const pos = posOf(String(patient._id), stage.number).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const named = pos.find((po) => planOfPo(po));
  if (named) return { ...planOfPo(named), poNumber: named.poNumber || '', source: 'Purchase order' };
  const requests = requestsOf(stage).filter((r) => r.status && !['cancelled', 'not_requested'].includes(r.status)).sort((a, b) => time(b.requestedAt) - time(a.requestedAt));
  for (const request of requests) {
    const job = jobPlanOf(String(patient._id), stage.number, request.requestId || 'legacy');
    const plan = job?.plan || request.supplyPlan;
    if (plan) return { plan, part: job?.plan ? job.part : request.supplyPart, poNumber: request.poNumber || pos[0]?.poNumber || '', source: 'Medicine request' };
  }
  return { plan: '', part: '', poNumber: pos[0]?.poNumber || requests[0]?.poNumber || '', source: '' };
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
      const { option, days, key, order, label } = lengthOf(supply.plan, supply.part);
      if (!groups.has(key)) groups.set(key, { key, days, order, label, patients: [] });
      groups.get(key).patients.push({
        patientId: String(patient._id), patientName: patient.patientName || '', patientCode: patient.patientCode || '',
        program: PROGRAM[patient.category] || '', phase: stage.number, supplyLabel: option?.label || '', supplySource: supply.source, poNumber: supply.poNumber,
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
