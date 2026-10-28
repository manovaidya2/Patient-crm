// The patient's full document (the Records Room PDF) shown with a medicine request instead of a separately uploaded
// prescription: In Transit no longer uploads one, the Medicine Department reads the patient's whole file.
const mongoose = require('mongoose');
const RecordRoom = require('../models/RecordRoom');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const { RECEPTION_IDS } = require('./receptionFlow');
const { recordRoomConditions, looseSource } = require('./recordRoomMatch');

// Newest first, only entries that have a PDF. Never throws: a request still opens without its documents.
const patientDocuments = async (patient) => {
  try {
    // No database connection (e.g. unit tests): nothing to look up, and never wait for one.
    if (!patient?._id || mongoose.connection.readyState !== 1) return [];
    const code = String(patient.patientCode || '').trim();
    // The Records Room may file the patient under the appointment code that carried this Patient ID.
    const source = looseSource(code);
    const entries = source ? await AppointmentManagementEntry.find({ [`values.${RECEPTION_IDS.patientId}`]: { $regex: source, $options: 'i' } }).select('appointmentCode').lean() : [];
    const match = recordRoomConditions({ patientRef: patient._id, patientCode: code, appointmentCodes: entries.map((entry) => entry.appointmentCode) });
    const records = await RecordRoom.find({ $or: match, pdfUrl: { $nin: ['', null] } })
      .select('pdfUrl pdfName pdfPageCount pdfUpdatedAt updatedAt shelfNumber fileNumber').sort({ pdfUpdatedAt: -1, updatedAt: -1 }).lean();
    return records.map((r) => ({
      id: String(r._id), url: r.pdfUrl, fileName: r.pdfName || 'Patient file (Records Room)', pageCount: r.pdfPageCount || 0,
      updatedAt: r.pdfUpdatedAt || r.updatedAt || null, shelfNumber: r.shelfNumber || '', fileNumber: r.fileNumber || '',
    }));
  } catch (error) {
    console.error('Patient documents could not be loaded:', error.message);
    return [];
  }
};

module.exports = { patientDocuments };
