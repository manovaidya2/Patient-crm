// A phase can have several purchase orders (one per medicine buy). Each PO is paid on its own: its payments are the
// ones linked to it (po.paymentIds), checked against the PO value. Payments on no PO of the phase (older ones, added
// before payments were linked) belong to the PO only when it is the phase's only PO.
const mongoose = require('mongoose');
const { paymentSummary } = require('./transitFlow');

const others = (po, phasePos) => phasePos.filter((o) => String(o._id) !== String(po._id));

// When a payment was added (from its id).
const addedAt = (p) => { try { return new mongoose.Types.ObjectId(String(p._id)).getTimestamp(); } catch { return null; } };
const madeAt = (po) => (po.createdAt ? new Date(po.createdAt) : null);
const paymentsOfPo = (stage, po, phasePos = []) => {
  const mine = new Set((po.paymentIds || []).map(String));
  const rest = others(po, phasePos);
  const onOther = new Set(rest.flatMap((o) => (o.paymentIds || []).map(String)));
  const alone = !rest.length;
  // A PO made with "New PO" starts fresh: the phase's earlier payments (no PO) are not its own. A payment added on the
  // phase after it was made (not linked anywhere) still counts while it is the only PO.
  const since = po.ownPaymentsOnly ? madeAt(po) : null;
  return (stage.payments || []).filter((p) => mine.has(String(p._id))
    || (alone && !onOther.has(String(p._id)) && (!po.ownPaymentsOnly || (since && addedAt(p) && addedAt(p) >= since))));
};

// The phase's earlier payments made without any PO (before purchase orders): the phase value, what was paid on it and
// the balance, which a new PO can take as its reference. None when an older PO already holds those payments, or the
// balance was taken already.
const earlierPhaseBalance = (stage, phasePos = []) => {
  if (stage.earlierBalanceCarried?.poId) return null;
  const live = phasePos.filter((o) => o.status !== 'cancelled');
  if (live.some((o) => !o.ownPaymentsOnly)) return null;
  const linked = new Set(live.flatMap((o) => (o.paymentIds || []).map(String)));
  const first = live.map(madeAt).filter(Boolean).sort((a, b) => a - b)[0] || null;
  const earlier = (stage.payments || []).filter((p) => !linked.has(String(p._id)) && (!first || (addedAt(p) && addedAt(p) < first)));
  const total = Number(stage.totalAmount || 0);
  if (!earlier.length || !(total > 0)) return null;
  const pay = paymentSummary({ payments: earlier, totalAmount: total });
  return pay.remaining > 0 ? { total, paid: pay.amountPaid, pending: pay.pendingAmount || 0, balance: pay.remaining, payments: earlier.length } : null;
};

// Same shape as paymentSummary(stage), for one PO: its value against its own payments.
const poPaymentSummary = (stage, po, phasePos = []) => {
  const alone = !others(po, phasePos).length;
  const full = Number(po.amount) > 0 ? Number(po.amount) : alone ? Number(stage.totalAmount || 0) : 0;
  // A balance carried to a newer PO is owed there, not here.
  const total = Math.max(full - Number(po.carriedForwardAmount || 0), 0);
  return paymentSummary({ payments: paymentsOfPo(stage, po, phasePos), totalAmount: total });
};

// The POs of one phase of a patient (only what the payment split needs). Empty without a database (unit tests).
const phasePurchaseOrders = async (patientId, phase) => {
  if (mongoose.connection.readyState !== 1) return [];
  const PurchaseOrder = require('../models/PurchaseOrder');
  return PurchaseOrder.find({ patient: patientId, phase }).select('poNumber amount paymentIds medicineRequestId status carriedForwardAmount supplyPlan supplyPart ownPaymentsOnly createdAt').lean();
};

// The PO a medicine request was raised on.
const poOfRequest = (phasePos, request) => (request ? phasePos.find((o) => String(o._id) === String(request.purchaseOrderId || '') || (o.medicineRequestId && o.medicineRequestId === (request.requestId || 'legacy'))) || null : null);

// Payment status that decides release / dispatch / handover of a request's medicine: its PO's payments; the whole
// phase when the request has no PO (older requests).
const paymentForRequestFrom = (phasePos, stage, request) => {
  const po = poOfRequest(phasePos, request);
  return po ? poPaymentSummary(stage, po, phasePos) : paymentSummary(stage);
};
const paymentForRequest = async (patient, stage, request) => paymentForRequestFrom(await phasePurchaseOrders(patient._id, stage.number), stage, request);

// A payment added for a request (In Transit) or for a chosen PO (Patient Details) is linked to that PO.
const linkPaymentToPo = async (poId, paymentId) => {
  if (!poId || !paymentId || mongoose.connection.readyState !== 1) return;
  const PurchaseOrder = require('../models/PurchaseOrder');
  await PurchaseOrder.updateOne({ _id: poId }, { $addToSet: { paymentIds: paymentId } });
};

// Whether the medicine of a PO may go out: no payment waiting for verification and some verified payment. The full PO
// value is not needed: a balance left is collected later, e.g. on a new PO made from this one (the rest of the months).
const paymentCleared = (pay) => Boolean(pay) && !pay.pendingCount && (Number(pay.amountPaid || 0) > 0 || Number(pay.remaining || 0) <= 0);

module.exports = { earlierPhaseBalance, paymentCleared, paymentsOfPo, poPaymentSummary, phasePurchaseOrders, poOfRequest, paymentForRequest, paymentForRequestFrom, linkPaymentToPo };
