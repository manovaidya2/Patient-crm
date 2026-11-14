const crypto = require('crypto');
const { paymentsOfPo, poOfRequest, paymentForRequestFrom } = require('./poPayment');
const { paymentSummary } = require('./transitFlow');

function releasePaymentReview(patient, stage, request, phasePos = []) {
  const po = poOfRequest(phasePos, request);
  const scopedPayments = po ? paymentsOfPo(stage, po, phasePos) : (stage.payments || []);
  const scopedIds = new Set(scopedPayments.map((p) => String(p._id)));
  const payments = (patient.stages || []).flatMap((s) => (s.payments || []).map((payment) => {
    const p = payment.toObject ? payment.toObject() : payment;
    const files = [...(p.screenshotFiles || []), ...(p.screenshotUrl ? [{ url: p.screenshotUrl, fileName: 'Payment screenshot' }] : [])];
    return {
      id: String(p._id), phase: s.number, forRelease: s.number === stage.number && scopedIds.has(String(p._id)),
      amount: p.amount, date: p.date, mode: p.paymentMode || '', bank: p.payToBankName || '', bankId: p.payToBank ? String(p.payToBank) : '',
      utr: p.utr || '', transactionId: p.transactionId || '', utrEntries: p.utrEntries || [], splits: p.splits || [],
      receivedBy: p.receivedBy || '', recordedByName: p.recordedByName || '', notes: p.notes || '',
      approvalStatus: p.approvalStatus || 'approved', approvedByName: p.approvedByName || '', approvedAt: p.approvedAt || null,
      screenshots: files.filter((file, i) => file.url && files.findIndex((other) => other.url === file.url) === i),
    };
  }));
  const summary = paymentForRequestFrom(phasePos, stage, request);
  const patientSummary = (patient.stages || []).reduce((totals, s) => {
    const pay = paymentSummary(s);
    totals.totalAmount += Number(pay.totalAmount || 0); totals.amountPaid += Number(pay.amountPaid || 0);
    totals.remaining += Number(pay.remaining || 0); totals.pendingAmount += Number(pay.pendingAmount || 0);
    return totals;
  }, { totalAmount: 0, amountPaid: 0, remaining: 0, pendingAmount: 0 });
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    po: po ? String(po._id) : '', summary, approvalStatus: patient.approvalStatus || 'approved',
    hold: Boolean(stage.transit?.holdActive || stage.transit?.removedAt), payments: payments.filter((p) => p.forRelease),
  })).digest('hex');
  return { payments, summary, patientSummary, fingerprint, scopedPayments, poNumber: po?.poNumber || request.poNumber || '' };
}

module.exports = { releasePaymentReview };
