const mongoose = require('mongoose');
const fs = require('fs/promises');
const Patient = require('../models/Patient');
const Appointment = require('../models/AppointmentManagementEntry');
const Bank = require('../models/BankAccount');
const Receipt = require('../models/ConsultationReceipt');
const Sales = require('../models/SalesAppointment');
const SalesColumn = require('../models/SalesSheetColumn');
const ManagementColumn = require('../models/AppointmentManagementColumn');
const { asyncHandler } = require('../middleware/errorHandler');

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''));
const day = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw badRequest('Enter a valid date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw badRequest('Enter a valid date');
  return date;
};
const ledgerMatch = (query) => {
  const match = {};
  if (query.kind && !['all', 'consultation', 'treatment'].includes(query.kind)) throw badRequest('Invalid ledger type');
  if (query.kind && query.kind !== 'all') match.kind = query.kind;
  if (query.status && !['all', 'pending', 'approved', 'cancelled'].includes(query.status)) throw badRequest('Invalid payment status');
  if (query.status && query.status !== 'all') match.status = query.status;
  if (query.patientApproval) {
    if (!['pending', 'approved', 'unlinked'].includes(query.patientApproval)) throw badRequest('Invalid patient approval status');
    match.patientApproval = query.patientApproval;
  }
  if (query.from || query.to) {
    match.date = {};
    if (query.from) match.date.$gte = day(query.from);
    if (query.to) match.date.$lt = new Date(day(query.to).getTime() + 86400000);
    if (query.from && query.to && query.from > query.to) throw badRequest('From date must not be after To date');
  }
  if (query.patientId) {
    if (!validId(query.patientId)) throw badRequest('Invalid patient reference');
    match.patientId = new mongoose.Types.ObjectId(query.patientId);
  }
  if (query.mode) {
    if (!['cash', 'online'].includes(query.mode)) throw badRequest('Invalid payment mode');
    match.paymentMode = query.mode;
  }
  const search = String(query.search || '').trim().slice(0, 150);
  if (search) match.$or = ['patientName', 'patientCode', 'patientNumber', 'appointmentCode', 'transactionId', 'utr', 'reference', 'notes', 'bankName'].map((key) => ({ [key]: { $regex: escapeRegex(search), $options: 'i' } }));
  return match;
};

// Normalize both sources for a read-only union; treatment receipts are never copied.
const ledgerPipeline = (kind = 'all') => [
  ...(kind === 'consultation' ? [{ $match: { _id: null } }] : []),
  { $unwind: '$stages' },
  { $unwind: '$stages.payments' },
  { $project: {
    _id: '$stages.payments._id', patientId: '$_id', patientName: 1, patientCode: 1,
    patientNumber: '$number', patientApproval: '$approvalStatus', kind: { $literal: 'treatment' },
    stage: '$stages.number', amount: '$stages.payments.amount', date: '$stages.payments.date',
    status: { $ifNull: ['$stages.payments.approvalStatus', 'approved'] },
    paymentMode: '$stages.payments.paymentMode', bankName: '$stages.payments.payToBankName',
    transactionId: { $ifNull: ['$stages.payments.transactionId', ''] },
    utr: { $ifNull: ['$stages.payments.utr', ''] },
    reference: { $ifNull: ['$stages.payments.utr', ''] },
    notes: '$stages.payments.notes', recordedByName: '$stages.payments.recordedByName',
    receivedBy: '$stages.payments.receivedBy', editedByName: '$stages.payments.editedByName', editedAt: '$stages.payments.editedAt',
    approvedByName: '$stages.payments.approvedByName', approvedAt: '$stages.payments.approvedAt',
    cancelledAt: '$stages.payments.cancelledAt', cancelledByName: '$stages.payments.cancelledByName',
    cancellationReason: '$stages.payments.cancellationReason', createdAt: '$stages.payments.createdAt',
    files: { $cond: [{ $gt: [{ $size: { $ifNull: ['$stages.payments.screenshotFiles', []] } }, 0] }, '$stages.payments.screenshotFiles',
      { $cond: ['$stages.payments.screenshotUrl', [{ url: '$stages.payments.screenshotUrl', fileName: 'Payment proof' }], []] }] },
    refunds: { $ifNull: ['$stages.payments.refunds', []] },
    refunded: { $sum: { $map: { input: { $filter: { input: { $ifNull: ['$stages.payments.refunds', []] }, as: 'r', cond: { $in: ['$$r.status', ['paid', 'settled']] } } }, as: 'r', in: '$$r.amount' } } },
  } },
  ...(kind === 'treatment' ? [] : [{ $unionWith: { coll: Receipt.collection.name, pipeline: [
    { $lookup: { from: Patient.collection.name, localField: 'patient', foreignField: '_id', as: 'linkedPatient', pipeline: [{ $project: { approvalStatus: 1 } }] } },
    { $project: { patientId: '$patient', patientName: 1, patientCode: 1, appointmentCode: 1, appointment: 1,
      patientApproval: { $ifNull: [{ $arrayElemAt: ['$linkedPatient.approvalStatus', 0] }, 'unlinked'] },
      kind: { $literal: 'consultation' }, collectionStage: 1, amount: 1, date: 1, status: 1, paymentMode: 1, bankName: 1,
      reference: 1, notes: 1, files: 1, recordedByName: 1, editedByName: 1, editedAt: 1, approvedByName: 1, approvedAt: 1,
      cancelledAt: 1, cancelledByName: 1, cancellationReason: 1, createdAt: 1, refunded: { $literal: 0 }, refunds: { $literal: [] } } },
  ] } }]),
];
const getLedger = asyncHandler(async (req, res) => {
  const match = ledgerMatch(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const [result] = await Patient.aggregate([...ledgerPipeline(req.query.kind), { $match: match }, { $facet: {
    rows: [{ $sort: { date: -1, createdAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
    summary: [{ $group: {
      _id: null, count: { $sum: 1 },
      approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } },
      pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
      refunded: { $sum: '$refunded' },
    } }],
  } }]);
  const summary = result?.summary?.[0] || { count: 0, approved: 0, pending: 0, refunded: 0 };
  for (const key of ['approved', 'pending', 'refunded']) summary[key] = Math.round((summary[key] || 0) * 100) / 100;
  res.json({ rows: result?.rows || [], summary, page, pages: Math.max(1, Math.ceil(summary.count / limit)) });
});

const references = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  if (search.length < 2) return res.json({ appointments: [], patients: [] });
  const regex = { $regex: escapeRegex(search), $options: 'i' };
  const appointments = await Appointment.find({ appointmentCode: regex }).select('appointmentCode appointmentDate').sort({ createdAt: -1 }).limit(20).lean();
  const patients = await Patient.find({ $or: [{ patientName: regex }, { patientCode: regex }, { number: regex }] }).select('patientName patientCode number').limit(20).lean();
  res.json({ appointments, patients });
});
const banks = asyncHandler(async (req, res) => res.json({ banks: await Bank.find({ isActive: true }).select('name displayName').sort({ name: 1 }).lean() }));

const createReceipt = asyncHandler(async (req, res) => {
  let saved = false;
  try {
    const body = req.body;
    const target = req.consultationTarget;
    if (!target && !validId(body.appointment)) throw badRequest('Select an appointment');
    let importedFrom = '', legacyProof = null;
    if (body.legacyColumnId) {
      if (body.confirmReceived !== 'true') throw badRequest('Confirm this amount was actually received, not an outstanding fee');
      if (!target || !validId(body.legacyColumnId) || !['sales', 'reception'].includes(body.legacySource) || (target.sheet === 'sales' && body.legacySource !== 'sales')) throw badRequest('Invalid source field');
      const Column = body.legacySource === 'sales' ? SalesColumn : ManagementColumn;
      const column = await Column.findOne({ _id: body.legacyColumnId, isActive: true });
      if (!column || !['number', 'text'].includes(column.type)) throw badRequest('Select an amount field');
      if (!/\b(advance|payment|paid|received|collected)\b/i.test(column.label || '') || /\b(due|outstanding|balance)\b/i.test(column.label || '')) throw badRequest('Select a received payment amount field');
      const values = target.sheet === 'sales' || body.legacySource === 'reception' ? target.row.values : target.row.salesValues;
      body.amount = String(values.get(body.legacyColumnId) || '').replaceAll(',', '').trim();
      importedFrom = `${body.legacySource}:${body.legacyColumnId}`;
      body.submissionKey = `sheet-import:${target.root || target.row._id}:${importedFrom}`;
      if (body.legacyProofColumnId) {
        if (!validId(body.legacyProofColumnId)) throw badRequest('Invalid proof field');
        const proofColumn = await Column.findOne({ _id: body.legacyProofColumnId, type: 'file', isActive: true });
        const proofUrl = values.get(body.legacyProofColumnId);
        if (!proofColumn || !/^\/uploads\/[a-zA-Z0-9/_\-.]+$/.test(proofUrl || '')) throw badRequest('Select an uploaded proof from this section');
        legacyProof = { url: proofUrl, fileName: proofColumn.label };
      }
    }
    if (!/^[\w:-]{16,140}$/.test(body.submissionKey || '')) throw badRequest('Missing submission reference');
    const existing = await Receipt.findOne({ submissionKey: body.submissionKey, ...(importedFrom ? {} : { recordedBy: req.user._id }) });
    if (existing) return res.json({ receipt: existing });
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw badRequest('Enter a positive amount with up to two decimal places');
    const date = day(body.date);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (body.date > today) throw badRequest('Payment date cannot be in the future');
    if (!['cash', 'online'].includes(body.paymentMode)) throw badRequest('Select a payment mode');
    const reference = String(body.reference || '').trim();
    const cashReceivedByName = String(body.cashReceivedByName || '').trim();
    if (reference.length > 200 || cashReceivedByName.length > 200) throw badRequest('Payment detail is too long');
    if (target && !body.legacyColumnId && body.paymentMode === 'online' && (!reference || !(req.files || []).length)) throw badRequest('Online payment needs UTR/reference and payment proof');
    if (target && !body.legacyColumnId && body.paymentMode === 'cash' && !cashReceivedByName) throw badRequest('Enter who received the cash payment');
    const appointment = target?.row || await Appointment.findById(body.appointment).select('appointmentCode sourceAppointment');
    if (!appointment) throw badRequest('Appointment no longer exists');
    const source = !target && appointment.sourceAppointment ? await Sales.findById(appointment.sourceAppointment).select('consultationAccount') : null;
    const salesAccount = target?.root || source?.consultationAccount || source?._id || null;
    let patient = null;
    if (body.patient) {
      if (!validId(body.patient)) throw badRequest('Invalid patient');
      patient = await Patient.findById(body.patient).select('patientName patientCode');
      if (!patient) throw badRequest('Patient no longer exists');
    } else if (body.patientCode) {
      patient = await Patient.findOne({ patientCode: String(body.patientCode).trim() }).select('patientName patientCode');
      if (!patient) throw badRequest('Patient ID not found. Check the ID or leave it empty for a visitor.');
    }
    let bank = null;
    if (body.bank && body.paymentMode === 'online') {
      if (!validId(body.bank)) throw badRequest('Invalid bank');
      bank = await Bank.findOne({ _id: body.bank, isActive: true });
      if (!bank) throw badRequest('Select an active bank');
    }
    const patientName = patient?.patientName || String(body.patientName || '').trim();
    if (!patientName || patientName.length > 200) throw badRequest('Enter patient or visitor name');
    const receipt = await Receipt.create({
      appointment: target?.sheet === 'sales' ? null : appointment._id, appointmentCode: appointment.appointmentCode,
      salesAppointment: salesAccount, collectionStage: body.legacyColumnId ? (body.legacySource === 'sales' ? 'advance' : 'reception') : target?.sheet === 'sales' ? 'advance' : 'reception', importedFrom,
      patient: patient?._id || null, patientName, patientCode: patient?.patientCode || '', amount, date,
      paymentMode: body.paymentMode, bank: bank?._id || null, bankName: bank?.displayName || bank?.name || '',
      reference: body.paymentMode === 'online' ? reference : '', cashReceivedByName: body.paymentMode === 'cash' ? cashReceivedByName : '',
      notes: body.notes || '', submissionKey: body.submissionKey,
      recordedBy: req.user._id, recordedByName: req.user.name,
      files: [...(legacyProof ? [legacyProof] : []), ...(req.files || []).map((file) => ({ url: `/uploads/consultation-fees/${file.filename}`, fileName: file.originalname }))],
    });
    saved = true;
    res.status(201).json({ receipt });
  } catch (error) {
    if (error.code === 11000) {
      const receipt = await Receipt.findOne({ submissionKey: req.body.submissionKey, ...(req.consultationTarget && req.body.legacyColumnId ? {} : { recordedBy: req.user._id }) });
      if (receipt) return res.json({ receipt });
    }
    throw error;
  } finally {
    if (!saved) await Promise.all((req.files || []).map((file) => fs.unlink(file.path).catch(() => {})));
  }
});
const reviewReceipt = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw badRequest('Invalid receipt');
  const { action } = req.body;
  if (!['approve', 'cancel'].includes(action)) throw badRequest('Invalid action');
  const reason = String(req.body.reason || '').trim();
  if (action === 'cancel' && (!reason || reason.length > 2000)) throw badRequest('Enter a cancellation reason (up to 2000 characters)');
  const update = action === 'approve'
    ? { status: 'approved', approvedByName: req.user.name, approvedAt: new Date() }
    : { status: 'cancelled', cancelledByName: req.user.name, cancelledAt: new Date(), cancellationReason: reason };
  const receipt = await Receipt.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { $set: update }, { new: true, runValidators: true });
  if (!receipt) return res.status(409).json({ message: 'Receipt is no longer pending. Refresh to see its current status.' });
  res.json({ receipt });
});

const deleteReceipt = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw badRequest('Invalid receipt');
  const receipt = await Receipt.findByIdAndDelete(req.params.id);
  if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
  res.json({ success: true });
});

module.exports = { getLedger, references, banks, createReceipt, reviewReceipt, deleteReceipt, ledgerMatch, ledgerPipeline, day };
