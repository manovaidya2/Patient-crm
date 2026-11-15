const RecordRoom = require('../models/RecordRoom');
const { looseKey, looseSource } = require('./recordRoomMatch');
const { uploadTiming } = require('./recordRoomOverdue');
const iso = (value) => value ? new Date(value).toISOString() : null;

function recordsForAppointment(appointment, records, now = new Date()) {
  const code = looseKey(appointment.patientCode);
  const appointmentCode = looseKey(appointment.appointmentCode);
  const own = records.filter((record) =>
    (appointment.patientRef && record.patient && String(record.patient) === String(appointment.patientRef))
    || (code.length >= 3 && [record.patientId, record.appointmentId].some((value) => looseKey(value) === code))
    || (appointmentCode.length >= 3 && looseKey(record.appointmentId) === appointmentCode));
  const entries = own.map((record) => ({
    id: String(record._id), patientId: record.patientId || '', appointmentId: record.appointmentId || '',
    treatmentStatus: record.treatmentStatus || 'bought', shelfNumber: record.shelfNumber || '', fileNumber: record.fileNumber || '', indexNumber: record.indexNumber || '',
    firstReceivedAt: iso(record.firstReceivedAt), createdAt: iso(record.createdAt), createdByName: record.createdByName || '',
    ...uploadTiming(record, now), pdfUrl: record.pdfUrl || '', pdfName: record.pdfName || 'Record Room PDF', pdfPageCount: record.pdfPageCount || 0, pdfUpdatedAt: iso(record.pdfUpdatedAt),
    documents: (record.documents || []).map((file) => ({ url: file.url, fileName: file.fileName || '', uploadedAt: iso(file.uploadedAt), uploadedByName: file.uploadedByName || '' })),
    movements: (record.issueHistory || []).map((entry) => ({ paperName: entry.paperName || 'Patient file', issuedAt: iso(entry.issuedAt), issuedByName: entry.issuedByName || '', givenTo: entry.givenTo || '', reason: entry.reason || '', returnedAt: iso(entry.returnedAt), returnedByName: entry.returnedByName || '', returnNotes: entry.returnNotes || '', returnCondition: entry.returnCondition || '', problemDetails: entry.problemDetails || '' })),
  }));
  const uploaded = entries.filter((entry) => entry.uploadStatus === 'uploaded').length;
  const overdue = entries.filter((entry) => entry.uploadStatus === 'overdue').length;
  return {
    total: entries.length, uploaded, pending: entries.length - uploaded, overdue,
    status: !entries.length ? 'not_registered' : uploaded === entries.length ? 'uploaded' : uploaded ? 'partial' : overdue ? 'overdue' : 'pending',
    entries,
  };
}

async function loadAppointmentRecords(appointments) {
  const clauses = [];
  const refs = [...new Set(appointments.map((entry) => entry.patientRef).filter(Boolean).map(String))];
  if (refs.length) clauses.push({ patient: { $in: refs } });
  [...new Set(appointments.map((entry) => entry.patientCode).filter(Boolean))].forEach((code) => {
    const source = looseSource(code);
    if (source) ['patientId', 'appointmentId'].forEach((field) => clauses.push({ [field]: { $regex: source, $options: 'i' } }));
  });
  [...new Set(appointments.map((entry) => entry.appointmentCode).filter(Boolean))].forEach((code) => {
    const source = looseSource(code);
    if (source) clauses.push({ appointmentId: { $regex: source, $options: 'i' } });
  });
  const records = clauses.length ? await RecordRoom.find({ $or: clauses }).sort({ updatedAt: -1 }).lean() : [];
  return new Map(appointments.map((entry) => [String(entry.id), recordsForAppointment(entry, records)]));
}

module.exports = { recordsForAppointment, loadAppointmentRecords };
