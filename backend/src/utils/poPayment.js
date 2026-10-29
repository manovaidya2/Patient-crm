// A phase can have several purchase orders (one per medicine buy). Each PO is paid on its own: its payments are the
// ones linked to it (po.paymentIds), checked against the PO value. Payments on no PO of the phase (older ones, added
// before payments were linked) belong to the PO only when it is the phase's only PO.
const mongoose = require('mongoose');
const { paymentSummary } = require('./transitFlow');

const others = (po, phasePos) => phasePos.filter((o) => String(o._id) !== String(po._id));

const paymentsOfPo = (stage, po, phasePos = []) => {
  const mine = new Set((po.paymentIds || []).map(String));
  const rest = others(po, phasePos);
  const onOther = new Set(rest.flatMap((o) => (o.paymentIds || []).map(String)));
  const alone = !rest.length;
  return (stage.payments || []).filter((p) => mine.has(String(p._id)) || (alone && !onOther.has(String(p._id))));
};

// Same shape as paymentSummary(stage), for one PO: its value against its own payments.
const poPaymentSummary = (stage, po, phasePos = []) => {
  const alone = !others(po, phasePos).length;
  const total = Number(po.amount) > 0 ? Number(po.amount) : alone ? Number(stage.totalAmount || 0) : 0;
  return paymentSummary({ payments: paymentsOfPo(stage, po, phasePos), totalAmount: total });
};

// The POs of one phase of a patient (only what the payment split needs). Empty without a database (unit tests).
const phasePurchaseOrders = async (patientId, phase) => {
  if (mongoose.connection.readyState !== 1) return [];
  const PurchaseOrder = require('../models/PurchaseOrder');
  return PurchaseOrder.find({ patient: patientId, phase }).select('poNumber amount paymentIds medicineRequestId status').lean();
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

module.exports = { paymentsOfPo, poPaymentSummary, phasePurchaseOrders, poOfRequest, paymentForRequest, paymentForRequestFrom, linkPaymentToPo };
