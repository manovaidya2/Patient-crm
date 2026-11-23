// The patient's name is also kept on their other records (purchase orders, medicine fulfilment jobs, Records Room,
// calls, schedule notes, queries ...). When the patient's name changes - on the patient page, or by the Admin's
// correction of the registration (utils/registrationSync.js) - those records follow the patient record's name.
// Issued bills (invoices, consultation receipts) and deleted-record archives are not changed.
const COPIES = [
  ['PurchaseOrder', 'purchase orders'],
  ['MedicineJob', 'medicine fulfilment jobs'],
  ['RecordRoom', 'Records Room entries'],
  ['CallLog', 'call logs'],
  ['IncomingCall', 'incoming calls'],
  ['ScheduleNote', 'schedule notes'],
  ['Enquiry', 'enquiries'],
  ['TeamChat', 'team chat threads'],
  ['DigitalMarketingReview', 'patient reviews'],
];

// patient: { _id, patientName }. models: test doubles by model name (the real models otherwise).
// Returns what changed, e.g. ['Name on 1 purchase orders', 'Name on 1 medicine fulfilment jobs'].
const syncPatientNameCopies = async (patient, models = {}) => {
  const name = String(patient?.patientName || '').trim();
  if (!name || !patient?._id) return [];
  const done = [];
  for (const [modelName, label] of COPIES) {
    const Model = models[modelName] || require(`../models/${modelName}`);
    const result = await Model.updateMany({ patient: patient._id, patientName: { $ne: name } }, { $set: { patientName: name } });
    if (result?.modifiedCount) done.push(`Name on ${result.modifiedCount} ${label}`);
  }
  return done;
};

module.exports = { syncPatientNameCopies, COPIES };
