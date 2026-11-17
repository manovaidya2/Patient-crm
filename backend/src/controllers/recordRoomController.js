const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const RecordRoom = require('../models/RecordRoom');
const Patient = require('../models/Patient');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const { asyncHandler } = require('../middleware/errorHandler');
const { writeRecordDocumentsPdf } = require('../utils/recordDocumentsPdf');
const { uploadTiming, overdueRecords, overdueCount } = require('../utils/recordRoomOverdue');

const uploadsRoot = path.resolve(__dirname, '../../uploads');
const treatmentStatus = (value = 'bought') => {
  if (!['bought', 'not_bought'].includes(value)) { const error = new Error('Invalid treatment status'); error.statusCode = 400; throw error; }
  return value;
};
// Older records belong to the original treatment-bought register.
const treatmentFilter = (value) => ({ treatmentStatus: treatmentStatus(value) === 'not_bought' ? 'not_bought' : { $ne: 'not_bought' } });
const filePath = (url) => {
  const resolved = path.resolve(__dirname, '../..', String(url || '').replace(/^\//, ''));
  return resolved.toLowerCase().startsWith(`${uploadsRoot.toLowerCase()}${path.sep}`) ? resolved : null;
};
const removeFile = async (url) => { const target = filePath(url); if (target) { try { await fs.promises.unlink(target); } catch (error) { if (error.code !== 'ENOENT') console.warn(error.message); } } };
const serialize = (record) => ({
  ...uploadTiming(record),
  id: String(record._id), patientId: record.patientId, patientName: record.patientName, appointmentId: record.appointmentId,
  shelfNumber: record.shelfNumber || '', fileNumber: record.fileNumber || '',
  indexNumber: record.indexNumber || '',
  firstReceivedAt: record.firstReceivedAt || null,
  treatmentStatus: record.treatmentStatus || 'bought',
  documents: (record.documents || []).map((item) => ({ id: String(item._id), url: item.url, fileName: item.fileName, uploadedAt: item.uploadedAt, uploadedByName: item.uploadedByName })),
  pdfUrl: record.pdfUrl, pdfName: record.pdfName, pdfPageCount: record.pdfPageCount, pdfUpdatedAt: record.pdfUpdatedAt,
  issueHistory: (record.issueHistory || []).map((item) => ({ id: String(item._id), paperName: item.paperName || 'Patient file', issuedAt: item.issuedAt, issuedByName: item.issuedByName, givenTo: item.givenTo, reason: item.reason, returnedAt: item.returnedAt, returnedByName: item.returnedByName, returnNotes: item.returnNotes, returnCondition: item.returnCondition || '', problemDetails: item.problemDetails || '' })),
  createdAt: record.createdAt, createdByName: record.createdByName,
});

const overdue = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const [records, total] = await Promise.all([overdueRecords(25, (page - 1) * 25), overdueCount()]);
  res.json({ success: true, records: records.map(serialize), total, page });
});

const list = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const regex = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = search ? { $or: ['patientName', 'patientId', 'appointmentId', 'shelfNumber', 'fileNumber', 'indexNumber'].map((key) => ({ [key]: { $regex: regex, $options: 'i' } })) } : {};
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  Object.assign(filter, treatmentFilter(req.query.treatmentStatus));
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
  const filter = treatmentFilter(req.query.treatmentStatus);
  const [total, movements] = await Promise.all([
    RecordRoom.countDocuments(filter),
    RecordRoom.aggregate([
      { $match: filter },
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
  const match = treatmentFilter(req.query.treatmentStatus);
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

const findLinkedPatient = async (patientKey) => {
  if (!patientKey) return null;
  const patient = await Patient.findOne({ patientCode: patientKey }).select('_id patientCode patientName').lean();
  if (patient || !mongoose.isValidObjectId(patientKey)) return patient;
  return Patient.findById(patientKey).select('_id patientCode patientName').lean();
};

const create = asyncHandler(async (req, res) => {
  const status = treatmentStatus(req.body.treatmentStatus);
  const firstReceivedAt = req.body.firstReceivedAt ? new Date(req.body.firstReceivedAt) : null;
  if (firstReceivedAt && (Number.isNaN(firstReceivedAt.getTime()) || firstReceivedAt > new Date())) return res.status(400).json({ message: 'Enter a valid first received date/time, not in the future' });
  const patientName = String(req.body.patientName || '').trim();
  if (!patientName) return res.status(400).json({ success: false, message: 'Patient name is required' });
  const patientKey = String(req.body.patientId || '').trim();
  const patient = await findLinkedPatient(patientKey);
  const record = await RecordRoom.create({
    patient: patient?._id || null,
    patientId: patient?.patientCode || String(req.body.patientId || '').trim(),
    patientName: patient?.patientName || patientName,
    appointmentId: String(req.body.appointmentId || '').trim(),
    shelfNumber: String(req.body.shelfNumber || '').trim(),
    fileNumber: String(req.body.fileNumber || '').trim(),
    indexNumber: String(req.body.indexNumber ?? '').trim(),
    createdByName: req.user.name,
    treatmentStatus: status,
    firstReceivedAt,
  });
  res.status(201).json({ success: true, record: serialize(record) });
});

const update = asyncHandler(async (req, res) => {
  const status = req.body.treatmentStatus === undefined ? undefined : treatmentStatus(req.body.treatmentStatus);
  const firstReceivedAt = req.body.firstReceivedAt ? new Date(req.body.firstReceivedAt) : null;
  if (firstReceivedAt && (Number.isNaN(firstReceivedAt.getTime()) || firstReceivedAt > new Date())) return res.status(400).json({ message: 'Enter a valid first received date/time, not in the future' });
  const record = await RecordRoom.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
  const patientName = String(req.body.patientName || '').trim();
  if (!patientName) return res.status(400).json({ success: false, message: 'Patient name is required' });
  const patientId = String(req.body.patientId || '').trim();
  const patient = await findLinkedPatient(patientId);
  record.patient = patient?._id || null;
  record.patientId = patient?.patientCode || patientId;
  record.patientName = patient?.patientName || patientName;
  record.appointmentId = String(req.body.appointmentId || '').trim();
  record.shelfNumber = String(req.body.shelfNumber || '').trim();
  record.fileNumber = String(req.body.fileNumber || '').trim();
  if (req.body.indexNumber !== undefined) record.indexNumber = String(req.body.indexNumber ?? '').trim();
  if (status !== undefined) record.treatmentStatus = status;
  if (req.body.firstReceivedAt !== undefined) record.firstReceivedAt = firstReceivedAt;
  if (record.pdfUrl) record.pdfName = `${record.patientName} record room (${record.pdfPageCount} pages).pdf`;
  await record.save();
  res.json({ success: true, record: serialize(record) });
});

const remove = asyncHandler(async (req, res) => {
  const record = await RecordRoom.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
  if (record.issueHistory.some((entry) => !entry.returnedAt)) {
    return res.status(409).json({ success: false, message: 'Collect the issued paper before deleting this record' });
  }
  const files = [...record.documents.map((document) => document.url), record.pdfUrl].filter(Boolean);
  await record.deleteOne();
  await Promise.all(files.map(removeFile));
  res.json({ success: true });
});

const rebuildPdf = async (record, { suffix = '', removePrevious = true } = {}) => {
  const oldPdf = record.pdfUrl;
  if (!record.documents.length) { record.pdfUrl = ''; record.pdfName = ''; record.pdfPageCount = 0; record.pdfUpdatedAt = null; await removeFile(oldPdf); return; }
  const safeId = String(record._id);
  const pdfName = `record-room-${safeId}${suffix}.pdf`;
  const pdfPath = path.join(__dirname, '../../uploads/records', pdfName);
  const pageCount = await writeRecordDocumentsPdf({ filePath: pdfPath, documents: record.documents.map((doc) => ({ filePath: filePath(doc.url), uploadedAt: doc.uploadedAt, uploadedByName: doc.uploadedByName })) });
  record.pdfUrl = `/uploads/records/${pdfName}`; record.pdfName = `${record.patientName} record room (${pageCount} pages).pdf`; record.pdfPageCount = pageCount; record.pdfUpdatedAt = new Date();
  if (removePrevious && oldPdf && oldPdf !== record.pdfUrl) await removeFile(oldPdf);
};

const uploadDocuments = asyncHandler(async (req, res) => {
  const files = req.files || [];
  const record = await RecordRoom.findById(req.params.id);
  if (!record) {
    await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
    return res.status(404).json({ success: false, message: 'Record room entry not found' });
  }
  if (!files.length) return res.status(400).json({ success: false, message: 'Upload at least one image or PDF' });
  const invalid = files.find((file) => !file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf');
  if (invalid) {
    await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
    return res.status(400).json({ success: false, message: 'Only images or PDF documents are allowed' });
  }
  const firstNewDocument = record.documents.length;
  try {
    record.documents.push(...files.map((file) => ({ url: `/uploads/records/${file.filename}`, fileName: file.originalname, uploadedAt: new Date(), uploadedByName: req.user.name })));
    await rebuildPdf(record);
    await record.save();
  } catch (error) {
    record.documents.splice(firstNewDocument);
    await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
    throw error;
  }
  res.json({ success: true, record: serialize(record) });
});

const replaceRecordDocuments = async (req, res, all = false) => {
  const files = req.files || [];
  const cleanup = () => Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
  const record = await RecordRoom.findById(req.params.id);
  const document = record?.documents.find((item) => String(item._id) === String(req.params.documentId));
  if (!record || (!all && !document)) {
    await cleanup();
    return res.status(404).json({ success: false, message: !record ? 'Record room entry not found' : 'Document not found' });
  }
  if ((!all && files.length !== 1) || !files.length || files.length > 30 || files.some((file) => !file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf')) {
    await cleanup();
    return res.status(400).json({ success: false, message: all ? 'Select 1 to 30 replacement images or PDFs' : 'Select one replacement image or PDF' });
  }
  const previousDocuments = record.documents.map((item) => item.toObject());
  const removedUrls = all ? record.documents.map((item) => item.url) : [document.url];
  const previousPdf = Object.fromEntries(['pdfUrl', 'pdfName', 'pdfPageCount', 'pdfUpdatedAt'].map((key) => [key, record[key]]));
  let generatedPdf;
  try {
    const replacements = files.map((file) => ({ url: `/uploads/records/${file.filename}`, fileName: file.originalname, uploadedAt: new Date(), uploadedByName: req.user.name }));
    if (all) record.documents = replacements;
    else document.set(replacements[0]);
    // Build to a new path so the current document and combined PDF survive a failed replacement.
    await rebuildPdf(record, { suffix: `-${randomUUID()}`, removePrevious: false });
    generatedPdf = record.pdfUrl;
    await record.save();
  } catch (error) {
    record.documents = previousDocuments;
    Object.assign(record, previousPdf);
    await cleanup();
    if (generatedPdf) await removeFile(generatedPdf);
    throw error;
  }
  await Promise.all(removedUrls.map(removeFile));
  if (previousPdf.pdfUrl && previousPdf.pdfUrl !== generatedPdf) await removeFile(previousPdf.pdfUrl);
  res.json({ success: true, record: serialize(record) });
};
const replaceDocument = asyncHandler((req, res) => replaceRecordDocuments(req, res));
const replaceAllDocuments = asyncHandler((req, res) => replaceRecordDocuments(req, res, true));

const deleteRecordDocuments = async (req, res, all = false) => {
  const record = await RecordRoom.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'Record room entry not found' });
  const index = record.documents.findIndex((document) => String(document._id) === String(req.params.documentId));
  if (!all && index === -1) return res.status(404).json({ success: false, message: 'Document not found' });
  const previousDocuments = record.documents.map((document) => document.toObject());
  const previousPdf = Object.fromEntries(['pdfUrl', 'pdfName', 'pdfPageCount', 'pdfUpdatedAt'].map((key) => [key, record[key]]));
  const removed = all ? previousDocuments : [previousDocuments[index]];
  let generatedPdf;
  try {
    if (all) record.documents = [];
    else record.documents.splice(index, 1);
    if (record.documents.length) {
      await rebuildPdf(record, { suffix: `-${randomUUID()}`, removePrevious: false });
      generatedPdf = record.pdfUrl;
    } else {
      Object.assign(record, { pdfUrl: '', pdfName: '', pdfPageCount: 0, pdfUpdatedAt: null });
    }
    await record.save();
  } catch (error) {
    record.documents = previousDocuments;
    Object.assign(record, previousPdf);
    if (generatedPdf) await removeFile(generatedPdf);
    throw error;
  }
  await Promise.all(removed.map((document) => removeFile(document.url)));
  if (previousPdf.pdfUrl && previousPdf.pdfUrl !== record.pdfUrl) await removeFile(previousPdf.pdfUrl);
  res.json({ success: true, record: serialize(record) });
};
const deleteDocument = asyncHandler((req, res) => deleteRecordDocuments(req, res));
const deleteAllDocuments = asyncHandler((req, res) => deleteRecordDocuments(req, res, true));

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

module.exports = { overdue, list, detail, summary, movements, lookup, create, update, remove, uploadDocuments, replaceDocument, replaceAllDocuments, deleteDocument, deleteAllDocuments, issue, collect };
