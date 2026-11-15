const Receipt = require('../models/ConsultationReceipt');
const Sales = require('../models/SalesAppointment');
const iso = (value) => value ? new Date(value).toISOString() : null;
const accountOf = (entry) => entry.sourceAppointment ? String(entry.sourceAppointment.consultationAccount || entry.sourceAppointment._id || entry.sourceAppointment) : '';

function consultationSummary(entry, receipts, fees = new Map()) {
  const account = accountOf(entry);
  // Exact appointment/account links only: names and patient codes cannot safely identify an individual consultation.
  const own = receipts.filter((receipt) => String(receipt.appointment || '') === String(entry._id) || (account && String(receipt.salesAppointment || '') === account));
  const fee = fees.get(account) ?? entry.consultationFee ?? entry.sourceAppointment?.consultationFee ?? null;
  const live = own.filter((receipt) => receipt.status !== 'cancelled');
  const sum = (rows) => rows.reduce((total, receipt) => total + Number(receipt.amount || 0), 0);
  const received = sum(live);
  const verified = sum(live.filter((receipt) => receipt.status === 'approved'));
  const pending = sum(live.filter((receipt) => receipt.status === 'pending'));
  const byMode = { cash: 0, online: 0, card: 0 };
  live.forEach((receipt) => {
    if (receipt.paymentMode === 'split') (receipt.splits || []).forEach((split) => { byMode[split.mode] = (byMode[split.mode] || 0) + Number(split.amount || 0); });
    else byMode[receipt.paymentMode] = (byMode[receipt.paymentMode] || 0) + Number(receipt.amount || 0);
  });
  return {
    fee, received, verified, pending, due: fee === null ? null : Math.max(Number(fee) - received, 0), byMode,
    payments: own.map((receipt) => ({
      id: String(receipt._id), amount: receipt.amount, mode: receipt.paymentMode,
      modeLabel: receipt.paymentMode === 'split' ? 'Split payment' : receipt.paymentMode === 'cash' ? 'Cash' : 'Online',
      status: receipt.status, date: iso(receipt.date), recordedByName: receipt.recordedByName || '',
      createdAt: iso(receipt.createdAt), approvedAt: iso(receipt.approvedAt), approvedByName: receipt.approvedByName || '',
      bank: receipt.bankName || '', utr: receipt.reference || '', receivedBy: receipt.cashReceivedByName || '', splits: receipt.splits || [],
      notes: receipt.notes || '', files: receipt.files || [], cancellationReason: receipt.cancellationReason || '',
      cancelledAt: iso(receipt.cancelledAt), cancelledByName: receipt.cancelledByName || '', editedAt: iso(receipt.editedAt), editedByName: receipt.editedByName || '',
      collectionStage: receipt.collectionStage === 'advance' ? 'Sales advance' : 'Reception collection', appointmentCode: receipt.appointmentCode || '',
    })).sort((a, b) => new Date(b.date) - new Date(a.date)),
  };
}

async function loadAppointmentConsultations(entries) {
  if (!entries.length) return new Map();
  const accounts = [...new Set(entries.map(accountOf).filter(Boolean))];
  const [receipts, sales] = await Promise.all([
    Receipt.find({ $or: [{ appointment: { $in: entries.map((entry) => entry._id) } }, ...(accounts.length ? [{ salesAppointment: { $in: accounts } }] : [])] }).select('-submissionKey -recordedBy -importedFrom').lean(),
    accounts.length ? Sales.find({ _id: { $in: accounts } }).select('consultationFee').lean() : [],
  ]);
  const fees = new Map(sales.map((entry) => [String(entry._id), entry.consultationFee]));
  return new Map(entries.map((entry) => [String(entry._id), consultationSummary(entry, receipts, fees)]));
}
module.exports = { consultationSummary, loadAppointmentConsultations };
