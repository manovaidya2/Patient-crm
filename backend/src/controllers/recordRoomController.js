const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const RecordRoom = require('../models/RecordRoom');
const Patient = require('../models/Patient');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const { asyncHandler } = require('../middleware/errorHandler');
const { writeImagesPdf } = require('../utils/simplePdf');

const uploadsRoot = path.resolve(__dirname, '../../uploads');
const filePath = (url) => {
  const resolved = path.resolve(__dirname, '../..', String(url || '').replace(/^\//, ''));
  return resolved.toLowerCase().startsWith(`${uploadsRoot.toLowerCase()}${path.sep}`) ? resolved : null;
};
const removeFile = async (url) => { const target = filePath(url); if (target) { try { await fs.promises.unlink(target); } catch (error) { if (error.code !== 'ENOENT') console.warn(error.message); } } };
const serialize = (record) => ({
  id: String(record._id), patientId: record.patientId, patientName: record.patientName, appointmentId: record.appointmentId,
  documents: (record.documents || []).map((item) => ({ id: String(item._id), url: item.url, fileName: item.fileName, uploadedAt: item.uploadedAt, uploadedByName: item.uploadedByName })),
  pdfUrl: record.pdfUrl, pdfName: record.pdfName, pdfPageCount: record.pdfPageCount, pdfUpdatedAt: record.pdfUpdatedAt,
  issueHistory: (record.issueHistory || []).map((item) => ({ id: String(item._id), paperName: item.paperName || 'Patient file', issuedAt: item.issuedAt, issuedByName: item.issuedByName, givenTo: item.givenTo, reason: item.reason, returnedAt: item.returnedAt, returnedByName: item.returnedByName, returnNotes: item.returnNotes, returnCondition: item.returnCondition || '', problemDetails: item.problemDetails || '' })),
  createdAt: record.createdAt, createdByName: record.createdByName,
});

const list = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const regex = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = search ? { $or: ['patientName', 'patientId', 'appointmentId'].map((key) => ({ [key]: { $regex: regex, $options: 'i' } })) } : {};
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const [records, total] = await Promise.all([
    RecordRoom.find(filter).select('-documents').sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * 25).limit(25).lean(),
    RecordRoom.countDocuments(filter),
  ]);
  res.json({ success: true, records: records.map(serialize), total, page });
});

const detail = asyncHandler(async (req, res) => {
  const record = await RecordRoom.findById(req.params.id).lean();
  if (!record) return res.status(404).json({ message: 'Record not found' });
  res.json({ success: true, record: serialize(record) });
});

const summary = asyncHandler(async (req, res) => {
  const [total, movements] = await Promise.all([
    RecordRoom.countDocuments(),
    RecordRoom.aggregate([
      { $unwind: '$issueHistory' },
      { $group: { _id: null,
        pending: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$issueHistory.returnedAt', null] }, null] }, 1, 0] } },
        returned: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$issueHistory.returnedAt', null] }, null] }, 1, 0] } },
        problems: { $sum: { $cond: [{ $eq: ['$issueHistory.returnCondition', 'problem'] }, 1, 0] } },
      } },
    ]),
  ]);
  res.json({ total, pending: movements[0]?.pending || 0, returned: movements[0]?.returned || 0, problems: movements[0]?.problems || 0 });
});

const movements = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const match = {};
  if (req.query.status === 'pending') match['issueHistory.returnedAt'] = null;
  if (req.query.status === 'returned') match['issueHistory.returnedAt'] = { $ne: null };
  if (req.query.status === 'problem') match['issueHistory.returnCondition'] = 'problem';
  const search = String(req.query.search || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (search) match.$or = ['patientName', 'patientId', 'appointmentId', 'issueHistory.paperName', 'issueHistory.givenTo', 'issueHistory.reason'].map((key) => ({ [key]: { $regex: search, $options: 'i' } }));
  const [result] = await RecordRoom.aggregate([
    { $unwind: '$issueHistory' }, { $match: match },
    { $facet: {
      count: [{ $count: 'total' }],
      entries: [
        { $sort: { 'issueHistory.issuedAt': -1, 'issueHistory._id': -1 } },
        { $skip: (page - 1) * 25 }, { $limit: 25 },
        { $project: { _id: 0, recordId: '$_id', patientName: 1, patientId: 1, appointmentId: 1, entry: '$issueHistory' } },
      ],
    } },
  ]);
  res.json({ entries: result.entries, total: result.count[0]?.total || 0, page });
});

const lookup = asyncHandler(async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (query.length < 2) return res.json({ success: true, results: [] });
  const [patients, appointments] = await Promise.all([
    Patient.find({ $or: [{ patientName: { $regex: query, $options: 'i' } }, { patientCode: { $regex: query, $options: 'i' } }] }).select('_id patientCode patientName number').limit(12).lean(),
    AppointmentManagementEntry.find({ appointmentCode: { $regex: query, $options: 'i' } }).select('appointmentCode appointmentDate salesValues').limit(12).lean(),
  ]);
  res.json({ success: true, results: [
    ...patients.map((patient) => ({ type: 'patient', patientId: String(patient._id), patientCode: patient.patientCode, patientName: patient.patientName, number: patient.number || '' })),
    ...appointments.map((appointment) => ({ type: 'appointment', appointmentId: appointment.appointmentCode, appointmentDate: appointment.appointmentDate })),
  ] });
});

const create = asyncHandler(async (req, res) => {
  const patientName = String(req.body.patientName || '').trim();
  if (!patientName) return res.status(400).json({ success: false, message: 'Patient name is required' });
  const patientKey = String(req.body.patientId || '').trim();
  let patient = patientKey ? await Patient.findOne({ patientCode: patientKey }).select('_id patientCode patientName').lean() : null;
  if (!patient && patientKey && mongoose.isValidObjectId(patientKey)) {
    patient = await Patient.findById(patientKey).select('_id patientCode patientName').lean();
  }
  const record = await RecordRoom.create({ patient: patient?._id || null, patientId: patient?.patientCode || String(req.body.patientId || '').trim(), patientName: patient?.patientName || patientName, appointmentId: String(req.body.appointmentId || '').trim(), createdByName: req.user.name });
  res.status(201).json({ success: true, record: serialize(record) });
});

const rebuildPdf = async (record) => {
  const oldPdf = record.pdfUrl;
  if (!record.documents.length) { record.pdfUrl = ''; record.pdfName = ''; record.pdfPageCount = 0; record.pdfUpdatedAt = null; await removeFile(oldPdf); return; }
  const safeId = String(record._id);
  const pdfName = `record-room-${safeId}.pdf`;
  const pdfPath = path.join(__dirname, '../../uploads/records', pdfName);
  await writeImagesPdf({ filePath: pdfPath, images: record.documents.map((doc) => ({ filePath: filePath(doc.url), uploadedAt: doc.uploadedAt, uploadedByName: doc.uploadedByName })) });
  record.pdfUrl = `/uploads/records/${pdfName}`; record.pdfName = `${record.patientName} record room (${record.documents.length} pages).pdf`; record.pdfPageCount = record.documents.length; record.pdfUpdatedAt = new Date();
  if (oldPdf && oldPdf !== record.pdfUrl) await removeFile(oldPdf);
};

const uploadDocuments = asyncHandler(async (req, res) => {
  const record = await RecordRoom.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Record room entry not found' });
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ success: false, message: 'Upload at least one image' });
  const invalid = files.find((file) => !file.mimetype.startsWith('image/'));
  if (invalid) return res.status(400).json({ success: false, message: 'Only image files can be scanned into the record PDF' });
  record.documents.push(...files.map((file) => ({ url: `/uploads/records/${file.filename}`, fileName: file.originalname, uploadedAt: new Date(), uploadedByName: req.user.name })));
  await rebuildPdf(record); await record.save();
  res.json({ success: true, record: serialize(record) });
});

const issue = asyncHandler(async (req, res) => {
  const givenTo = String(req.body.givenTo || '').trim();
  const reason = String(req.body.reason || '').trim();
  if (!givenTo || !reason) return res.status(400).json({ success: false, message: 'Recipient and reason are required' });
  const record = await RecordRoom.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Record room entry not found' });
  const active = record.issueHistory.find((item) => !item.returnedAt);
  if (active) return res.status(409).json({ success: false, message: 'This paper has not been returned yet. Collect it before issuing it again.' });
  record.issueHistory.push({ givenTo, reason, issuedByName: req.user.name, issuedAt: new Date() });
  await record.save(); res.json({ success: true, record: serialize(record) });
});

const collect = asyncHandler(async (req, res) => {
  const record = await RecordRoom.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Record room entry not found' });
  const issueEntry = record.issueHistory.id(req.params.issueId);
  if (!issueEntry) return res.status(404).json({ success: false, message: 'Issue entry not found' });
  if (issueEntry.returnedAt) return res.status(409).json({ message: 'This paper has already been collected' });
  const condition = req.body.returnCondition;
  const problemDetails = String(req.body.problemDetails || '').trim();
  if (!['intact', 'problem'].includes(condition)) return res.status(400).json({ message: 'Select the condition of the returned paper' });
  if (condition === 'problem' && !problemDetails) return res.status(400).json({ message: 'Describe the problem with the returned paper' });
  issueEntry.returnCondition = condition;
  issueEntry.problemDetails = condition === 'problem' ? problemDetails : '';
  issueEntry.returnedAt = new Date(); issueEntry.returnedByName = req.user.name; issueEntry.returnNotes = String(req.body.notes || '').trim();
  await record.save(); res.json({ success: true, record: serialize(record) });
});

module.exports = { list, detail, summary, movements, lookup, create, uploadDocuments, issue, collect };
