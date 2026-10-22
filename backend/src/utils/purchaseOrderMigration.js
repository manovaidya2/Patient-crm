// One-time (and safe to repeat) copy of the purchase orders that already live on patient phases
// (stage.purchaseOrder / stage.poPaper) into PurchaseOrder records, so the Purchase Orders pages show old patients too.
// It only READS patients: no patient field is changed or removed. A phase that already has a PurchaseOrder is skipped,
// so running it on every server start never creates duplicates.
const { paymentSummary } = require('./transitFlow');

const plain = (value) => (value?.toObject ? value.toObject() : value) || {};
const dateOrNull = (value) => {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00.000+05:30`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const newestRequestId = (stage) => {
  const requests = [...(stage.medicineRequests || [])].filter((r) => r && r.status && r.status !== 'not_requested');
  if (requests.length) {
    const newest = requests.reduce((best, r) => (new Date(r.requestedAt || 0) >= new Date(best.requestedAt || 0) ? r : best));
    return newest.requestId || '';
  }
  return stage.medicineRequest?.status && stage.medicineRequest.status !== 'not_requested' ? 'legacy' : '';
};

const legacyPurchaseOrder = (patient, stage) => {
  const t = plain(stage.transit);
  const paper = plain(stage.poPaper);
  const values = paper.values || {};
  const pay = paymentSummary(stage);
  const approved = (patient.approvalStatus || 'approved') === 'approved';
  const verified = approved && pay.pendingCount === 0 && (stage.payments || []).length > 0;
  const requestId = newestRequestId(stage);
  const createdAt = t.enteredAt || paper.savedAt || patient.createdAt || new Date();
  return {
    poNumber: String(stage.purchaseOrder).trim(),
    generated: false,
    patient: patient._id,
    patientCode: patient.patientCode || '',
    patientName: patient.patientName || '',
    phase: stage.number,
    packageName: stage.packageName || values.orderedTreatment || '',
    amount: Number(stage.totalAmount || 0),
    medicineReadyDate: dateOrNull(t.expectedReadyDate || values.medicineReadyDate),
    paperImages: Array.isArray(values.paperImages) ? values.paperImages.filter((f) => f?.url) : [],
    paperValues: paper.values ? { ...paper.values, totals: paper.totals || {} } : null,
    paymentIds: (stage.payments || []).map((p) => p._id).filter(Boolean),
    status: verified ? 'verified' : 'pending',
    verifiedAt: verified ? createdAt : null,
    verifiedByName: verified ? 'Existing record' : '',
    detailsVerifiedAt: verified ? createdAt : null,
    detailsVerifiedByName: verified ? 'Existing record' : '',
    paymentVerifiedAt: verified ? createdAt : null,
    paymentVerifiedByName: verified ? 'Existing record' : '',
    medicineRequestId: requestId,
    source: 'legacy',
    createdByName: paper.savedByName || '',
    events: [{ at: new Date(), action: 'Imported', details: 'Created from the purchase order already saved on this phase', byName: 'System' }],
    createdAt,
  };
};

const migrateLegacyPurchaseOrders = async ({ Patient, PurchaseOrder, log = () => {} }) => {
  // $elemMatch: "some phase has a PO number". A plain `stages.purchaseOrder: { $nin: [''] }` would require every phase
  // to have one, and the five empty phases of each patient would hide them all.
  const patients = await Patient.find({ stages: { $elemMatch: { purchaseOrder: { $exists: true, $nin: ['', null] } } } })
    .select('patientName patientCode approvalStatus createdAt stages').lean();
  let created = 0;
  for (const patient of patients) {
    for (const stage of patient.stages || []) {
      if (!String(stage.purchaseOrder || '').trim()) continue;
      // eslint-disable-next-line no-await-in-loop
      const exists = await PurchaseOrder.exists({ patient: patient._id, phase: stage.number });
      if (exists) continue;
      // eslint-disable-next-line no-await-in-loop
      await PurchaseOrder.create(legacyPurchaseOrder(patient, stage));
      created += 1;
    }
  }
  if (created) log(`Purchase orders: imported ${created} existing phase purchase order(s)`);
  return { created };
};

module.exports = { migrateLegacyPurchaseOrders, legacyPurchaseOrder };
