const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { Invoice, InvoiceCounter } = require('../models/Invoice');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateReceipt, renderReceipt, receiptFileName, validDate } = require('../utils/partPaymentReceipt');

const INVOICE_DIR = path.join(__dirname, '../../uploads/invoices');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const badRequest = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const formatInvoice = (row) => ({
  id: row._id, type: row.type, invoiceNumber: row.invoiceNumber, date: row.date,
  patient: row.patient, patientName: row.patientName, patientCode: row.patientCode,
  details: row.details, fileName: row.fileName, createdByName: row.createdByName, createdAt: row.createdAt,
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
  if (req.body.type !== 'part-payment') badRequest('Unsupported receipt type');
  const key = req.body.submissionKey;
  if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) badRequest('A valid submission key is required');
  const submissionKey = `${req.user._id}:${key}`;
  const existing = await Invoice.findOne({ submissionKey }).lean();
  if (existing) return res.json({ invoice: formatInvoice(existing) });
  const details = validateReceipt(req.body.details);
  const patient = req.body.patient || null;
  if (patient && (!mongoose.isObjectIdOrHexString(patient) || !await Patient.exists({ _id: patient }))) badRequest('Selected patient was not found');
  // Atomic numbering and a unique submission key protect concurrent saves/retries.
  await Invoice.init();
  const year = new Date().getFullYear();
  const counterKey = `part-payment-${year}`;
  let counter;
  try {
    counter = await InvoiceCounter.findOneAndUpdate({ _id: counterKey }, { $inc: { sequence: 1 } }, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    counter = await InvoiceCounter.findOneAndUpdate({ _id: counterKey }, { $inc: { sequence: 1 } }, { new: true });
  }
  const invoiceNumber = `MV-PP-${year}-${String(counter.sequence).padStart(6, '0')}`;
  const fileName = receiptFileName(invoiceNumber, details.patientName);
  const pdf = await renderReceipt(invoiceNumber, details);
  const id = new mongoose.Types.ObjectId();
  const filePath = path.join(INVOICE_DIR, fileName);
  await fs.mkdir(INVOICE_DIR, { recursive: true });
  try {
    await fs.writeFile(filePath, pdf, { flag: 'wx' });
    const invoice = await Invoice.create({
      _id: id, type: 'part-payment', submissionKey, invoiceNumber, patient,
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

const getPdf = asyncHandler(async (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ message: 'Receipt not found' });
  const invoice = await Invoice.findById(req.params.id).lean();
  if (!invoice) return res.status(404).json({ message: 'Receipt not found' });
  const filePath = path.join(INVOICE_DIR, invoice.fileName);
  try { await fs.access(filePath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // The saved snapshot can restore a PDF after a storage migration.
    await fs.mkdir(INVOICE_DIR, { recursive: true });
    await fs.writeFile(filePath, await renderReceipt(invoice.invoiceNumber, invoice.details));
  }
  res.set('Cache-Control', 'private, no-store');
  res.download(filePath, invoice.fileName, (error) => { if (error && !res.headersSent) next(error); });
});

module.exports = { findPatients, listInvoices, createInvoice, getPdf };
