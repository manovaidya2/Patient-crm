const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { Invoice, InvoiceCounter } = require('../models/Invoice');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateReceipt, renderReceipt, receiptFileName, validDate } = require('../utils/partPaymentReceipt');
const { validateFinalBill, renderFinalBill } = require('../utils/finalBill');
const { InvoiceSettings, DEFAULT_PARTICULARS, DEFAULT_STATUSES } = require('../models/InvoiceSettings');

const readSettings = async () => await InvoiceSettings.findById('final-bill').lean() || { paymentParticulars: DEFAULT_PARTICULARS, paymentStatuses: DEFAULT_STATUSES };
const getSettings = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  res.json({ paymentParticulars: settings.paymentParticulars, paymentStatuses: settings.paymentStatuses });
});
const updateSettings = asyncHandler(async (req, res) => {
  const update = {};
  for (const key of ['paymentParticulars', 'paymentStatuses']) {
    const values = req.body[key];
    if (!Array.isArray(values) || !values.length || values.length > 100 || values.some((v) => typeof v !== 'string' || !v.trim() || v.length > 80 || /[\r\n\t]/.test(v))) badRequest('Dropdowns require 1 to 100 non-empty options, each up to 80 characters');
    update[key] = values.map((v) => v.trim());
    if (new Set(update[key].map((v) => v.toLowerCase())).size !== values.length) badRequest('Dropdown options must be unique');
  }
  const settings = await InvoiceSettings.findByIdAndUpdate('final-bill', { $set: { ...update, updatedBy: req.user._id } }, { upsert: true, new: true, runValidators: true });
  res.json({ paymentParticulars: settings.paymentParticulars, paymentStatuses: settings.paymentStatuses });
});

const INVOICE_DIR = path.join(__dirname, '../../uploads/invoices');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const badRequest = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const formatInvoice = (row) => ({
  id: row._id, type: row.type, invoiceNumber: row.invoiceNumber, date: row.date,
  patient: row.patient, patientName: row.patientName, patientCode: row.patientCode,
  details: row.details, fileName: row.fileName, createdByName: row.createdByName, createdAt: row.createdAt,
  revision: row.revision || 1, editedByName: row.editedByName || '', editedAt: row.editedAt || null,
  revisionHistory: (row.revisionHistory || []).map(({ revision, fileName, editedByName, editedAt }) => ({ revision, fileName, editedByName, editedAt })),
});

const findPatients = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.json({ patients: [] });
  const regex = new RegExp(escapeRegex(q), 'i');
  const patients = await Patient.find({ $or: [{ patientCode: regex }, { patientName: regex }] })
    .select('patientName patientCode guardianName relativeName age gender').sort({ patientName: 1 }).limit(20).lean();
  res.json({ patients: patients.map((p) => ({ id: p._id, patientName: p.patientName, patientCode: p.patientCode || '', guardianName: p.guardianName || p.relativeName || '', age: p.age || '', gender: p.gender || '' })) });
});

const listInvoices = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) {
    if (!['part-payment', 'final-bill'].includes(req.query.type)) badRequest('Unsupported invoice type');
    filter.type = req.query.type;
  }
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ invoiceNumber: regex }, { patientName: regex }, { patientCode: regex }];
  }
  for (const key of ['from', 'to']) if (req.query[key] && !validDate(String(req.query[key]))) badRequest('Invalid date filter');
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = req.query.from;
    if (req.query.to) filter.date.$lte = req.query.to;
  }
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const [rows, total] = await Promise.all([
    Invoice.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25).lean(),
    Invoice.countDocuments(filter),
  ]);
  res.json({ invoices: rows.map(formatInvoice), total, page, pages: Math.ceil(total / 25) });
});

const createInvoice = asyncHandler(async (req, res) => {
  const type = req.body.type;
  if (!['part-payment', 'final-bill'].includes(type)) badRequest('Unsupported receipt type');
  const key = req.body.submissionKey;
  if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) badRequest('A valid submission key is required');
  const submissionKey = `${req.user._id}:${key}`;
  const existing = await Invoice.findOne({ submissionKey }).lean();
  if (existing) return res.json({ invoice: formatInvoice(existing) });
  const details = type === 'final-bill' ? await validateFinalBill(req.body.details, await readSettings()) : validateReceipt(req.body.details);
  const patient = req.body.patient || null;
  if (patient && (!mongoose.isObjectIdOrHexString(patient) || !await Patient.exists({ _id: patient }))) badRequest('Selected patient was not found');
  // Atomic numbering and a unique submission key protect concurrent saves/retries.
  await Invoice.init();
  const year = new Date().getFullYear();
  const counterKey = `${type}-${year}`;
  let counter;
  try {
    counter = await InvoiceCounter.findOneAndUpdate({ _id: counterKey }, { $inc: { sequence: 1 } }, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    counter = await InvoiceCounter.findOneAndUpdate({ _id: counterKey }, { $inc: { sequence: 1 } }, { new: true });
  }
  const invoiceNumber = `MV-${type === 'final-bill' ? 'FB' : 'PP'}-${year}-${String(counter.sequence).padStart(6, '0')}`;
  const fileName = receiptFileName(invoiceNumber, details.patientName).replace('Part-payment-receipt', type === 'final-bill' ? 'Final-bill' : 'Part-payment-receipt');
  const pdf = await (type === 'final-bill' ? renderFinalBill : renderReceipt)(invoiceNumber, details);
  const id = new mongoose.Types.ObjectId();
  const filePath = path.join(INVOICE_DIR, fileName);
  await fs.mkdir(INVOICE_DIR, { recursive: true });
  try {
    await fs.writeFile(filePath, pdf, { flag: 'wx' });
    const invoice = await Invoice.create({
      _id: id, type, submissionKey, invoiceNumber, patient,
      date: details.date, patientName: details.patientName, patientCode: details.patientCode,
      details, fileName, createdBy: req.user._id, createdByName: req.user.name,
    });
    res.status(201).json({ invoice: formatInvoice(invoice) });
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    if (error.code === 11000) {
      const saved = await Invoice.findOne({ submissionKey }).lean();
      if (saved) return res.json({ invoice: formatInvoice(saved) });
    }
    throw error;
  }
});

const updateInvoice = asyncHandler(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ message: 'Bill not found' });
  const original = await Invoice.findById(req.params.id).lean();
  if (!original) return res.status(404).json({ message: 'Bill not found' });
  const revision = original.revision || 1;
  if (req.body.expectedRevision !== revision) return res.status(409).json({ message: 'This bill was updated elsewhere. Reload it before editing.' });
  if (req.body.type && req.body.type !== original.type) badRequest('Bill type cannot be changed');
  const currentSettings = original.type === 'final-bill' ? await readSettings() : null;
  const settings = currentSettings && {
    paymentParticulars: [...new Set([...currentSettings.paymentParticulars, ...(original.details.payments || []).map((row) => row.particulars)])],
    paymentStatuses: [...new Set([...currentSettings.paymentStatuses, original.details.paymentStatus])],
  };
  const details = original.type === 'final-bill'
    ? await validateFinalBill(req.body.details, settings)
    : validateReceipt(req.body.details);
  const patient = req.body.patient || null;
  if (patient && (!mongoose.isObjectIdOrHexString(patient) || !await Patient.exists({ _id: patient }))) badRequest('Selected patient was not found');
  const nextRevision = revision + 1;
  const baseName = receiptFileName(original.invoiceNumber, details.patientName);
  const fileName = baseName.replace('Part-payment-receipt', original.type === 'final-bill' ? 'Final-bill' : 'Part-payment-receipt').replace(/\.pdf$/, `-v${nextRevision}-${randomUUID().slice(0, 8)}.pdf`);
  const filePath = path.join(INVOICE_DIR, fileName);
  const pdf = await (original.type === 'final-bill' ? renderFinalBill : renderReceipt)(original.invoiceNumber, details);
  await fs.mkdir(INVOICE_DIR, { recursive: true });
  await fs.writeFile(filePath, pdf, { flag: 'wx' });
  try {
    const changedAt = new Date();
    const saved = await Invoice.findOneAndUpdate(
      { _id: original._id, revision: original.revision == null ? { $exists: false } : revision },
      {
        $set: { patient, date: details.date, patientName: details.patientName, patientCode: details.patientCode, details, fileName, revision: nextRevision, editedByName: req.user.name, editedAt: changedAt },
        $push: { revisionHistory: { revision, details: original.details, fileName: original.fileName, editedByName: req.user.name, editedAt: changedAt } },
      },
      { new: true, runValidators: true }
    ).lean();
    if (!saved) {
      await fs.unlink(filePath).catch(() => {});
      return res.status(409).json({ message: 'This bill was updated elsewhere. Reload it before editing.' });
    }
    return res.json({ invoice: formatInvoice(saved) });
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    throw error;
  }
});

const getPdf = asyncHandler(async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ message: 'Receipt not found' });
  const invoice = await Invoice.findById(req.params.id).lean();
  if (!invoice) return res.status(404).json({ message: 'Receipt not found' });
  let selected = invoice;
  if (req.params.revision !== undefined) {
    const revision = Number(req.params.revision);
    if (!Number.isInteger(revision) || revision < 1) return res.status(404).json({ message: 'Revision not found' });
    const previous = (invoice.revisionHistory || []).find((item) => item.revision === revision);
    if (!previous) return res.status(404).json({ message: 'Revision not found' });
    selected = { ...invoice, ...previous };
  }
  const filePath = path.join(INVOICE_DIR, selected.fileName);
  if (invoice.type === 'part-payment' && req.params.revision === undefined) {
    await fs.mkdir(INVOICE_DIR, { recursive: true });
    await fs.writeFile(filePath, await renderReceipt(invoice.invoiceNumber, selected.details));
  }
  try { await fs.access(filePath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // The saved snapshot can restore a PDF after a storage migration.
    await fs.mkdir(INVOICE_DIR, { recursive: true });
    await fs.writeFile(filePath, await (invoice.type === 'final-bill' ? renderFinalBill : renderReceipt)(invoice.invoiceNumber, selected.details));
  }
  res.set('Cache-Control', 'private, no-store');
  res.download(filePath, selected.fileName, (error) => { if (error && !res.headersSent) next(error); });
});

module.exports = { findPatients, listInvoices, createInvoice, updateInvoice, getPdf, getSettings, updateSettings };
