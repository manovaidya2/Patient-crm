// Turning a post-counselling / Package Not Bought record into a real patient. Shared by both routes so the patient, the
// Phase 1 package, the purchase order and the payment received always look the same.
const mongoose = require('mongoose');
const BankAccount = require('../models/BankAccount');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const SalesAppointment = require('../models/SalesAppointment');
const PurchaseOrder = require('../models/PurchaseOrder');
const { createPatientRecord } = require('../controllers/patientController');
const { PROFILE_KEYS } = require('./patientProfile');
const { createWithPoNumber } = require('./poNumber');
const { supplyOptionByLabel } = require('../constants/supplyPlans');

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// Everything the patient needs comes from the registration that reception filled and post-counselling confirmed.
// `body` can only fill in what the registration does not have (father's number, father / mother name).
const patientInputFromRegistration = (registration, body = {}) => {
  const f = registration.fields;
  return {
    ...Object.fromEntries(PROFILE_KEYS.map((key) => [key, f[key]])),
    patientCode: registration.patientId,
    patientName: f.patientName, category: f.category, age: f.age,
    number: text(body.number) || f.fatherNumber || f.whatsappNumber || f.motherNumber,
    guardianName: text(body.guardianName) || f.fatherName || f.motherName || f.primaryCaregiver,
    alternateNumber: f.motherNumber, relativeName: f.relativeName, patientHistoryBy: f.patientHistoryBy,
    centerName: f.centerName, centerId: f.centerId,
    consultationDate: /^\d{4}-\d{2}-\d{2}$/.test(registration.consultationDate) ? registration.consultationDate : undefined,
    postCounselor: registration.postCounselor || undefined,
    currentStage: 1,
  };
};

// Converting needs the PO paper to be filled in: how the payment was made. The PO number is generated on conversion.
const assertPurchaseComplete = (values = {}) => {
  if (!text(values.mode)) throw fail('Select the payment mode to convert');
};

// The bank is saved as an id; keep its name with the payment so it still reads right if the bank is renamed.
const withBankName = async (values) => {
  const next = { ...values, payToBankName: '' };
  if (next.payToBank) {
    const bank = await BankAccount.findOne({ _id: next.payToBank, isActive: true }).lean();
    if (!bank) throw fail('Select an active bank');
    next.payToBankName = bank.displayName || bank.name;
  }
  return next;
};

// The "amount received now" on a PO paper as a phase payment (pending until In Transit verifies it), or null when
// nothing was received. Used by conversion and by every later purchase order, so both save payments the same way.
const paymentFromPaper = (values, { cardCharge = 0, user }) => {
  const received = Number(values.amountReceivedNow || 0);
  if (!(received > 0)) return null;
  const cash = values.mode === 'Cash';
  const notes = [
    `Mode: ${values.mode || 'Not set'}`, values.mode === 'Card (+3%)' ? `3% card charge Rs ${cardCharge || 0}` : '',
    values.poNo ? `PO ${values.poNo}` : '', values.paymentTime ? `Time ${values.paymentTime}` : '',
    values.paymentVerifiedBy ? `Verified by ${values.paymentVerifiedBy}` : '', text(values.paymentNotes, 500),
  ].filter(Boolean).join(' | ');
  const screenshots = !cash && Array.isArray(values.screenshots) ? values.screenshots : [];
  const paidOn = values.paymentDate || values.poDate;
  return {
    _id: new mongoose.Types.ObjectId(),
    amount: received, date: paidOn ? new Date(`${paidOn}T12:00:00.000Z`) : new Date(), paymentMode: cash ? 'cash' : 'online',
    payToBank: !cash && values.payToBank ? values.payToBank : null, payToBankName: cash ? '' : text(values.payToBankName),
    utr: cash ? '' : text(values.utrReference), transactionId: cash ? '' : text(values.transactionId), receivedBy: cash ? text(values.cashReceiver || values.cashHandedTo) : '',
    screenshotUrl: screenshots[0]?.url || null, screenshotFiles: screenshots,
    notes, recordedByName: user.name, approvalStatus: 'pending',
  };
};

// Creates the patient and fills Phase 1 (package, PO, total, the payment received now), and the first PurchaseOrder
// record with a newly generated PO number. The number is reserved first; if anything fails afterwards, the patient and
// the reserved PO are removed again, so a failed conversion never leaves a half-made patient or a stray PO behind.
const createConvertedPatient = async ({ input, fee, values: rawValues, totals = {}, cardCharge = totals.cardCharge || 0, source = '', user, activityDetails }) => {
  const received = Number(rawValues.amountReceivedNow || 0);
  const supply = supplyOptionByLabel(rawValues.supplyOrder);
  const po = await createWithPoNumber(PurchaseOrder, {
    phase: 1, status: 'pending', source: 'conversion', createdByName: user.name, createdByRole: user.role || '',
    supplyPlan: supply?.plan || '', supplyPart: supply?.part || '',
  });
  const values = { ...rawValues, poNo: po.poNumber };
  let patient = null;
  try {
    patient = await createPatientRecord(input, user, { activityDetails });
    const phase = patient.stages.find((stage) => stage.number === 1);
    phase.packageName = text(values.orderedTreatment, 120);
    phase.purchaseOrder = po.poNumber;
    phase.totalAmount = fee;
    if (!phase.transit) phase.transit = {};
    phase.transit.enteredAt = new Date();
    // The medicine ready date becomes the In Transit "ready by" date, which also drives its automatic reminder.
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(values.medicineReadyDate || ''))) {
      const readyBy = new Date(`${values.medicineReadyDate}T00:00:00.000+05:30`);
      if (phase.transit) phase.transit.expectedReadyDate = readyBy; else phase.transit = { expectedReadyDate: readyBy };
    }
    // Keep the whole PO paper (and its image) with the phase, so Patient Details can show it.
    phase.poPaper = { values, totals: { ...totals, approvedProgramFee: fee }, savedAt: new Date(), savedByName: user.name, source };
    const payment = paymentFromPaper(values, { cardCharge, user });
    if (payment) {
      phase.payments.push(payment);
      patient.activityLog.push({ action: 'Payment added for Phase 1', details: `${received} via ${values.mode || 'Online'} — pending accounts approval`, actorName: user.name, actorRole: user.role || '' });
    }
    patient.activityLog.push({ action: 'Purchase order created for Phase 1', details: `${po.poNumber}${supply ? ` | ${supply.label}` : ''} | Rs ${fee}`, actorName: user.name, actorRole: user.role || '' });
    await patient.save();
    const readyBy = phase.transit?.expectedReadyDate || null;
    Object.assign(po, {
      patient: patient._id, patientCode: patient.patientCode || '', patientName: patient.patientName,
      packageName: phase.packageName, amount: fee, medicineReadyDate: readyBy,
      paperImages: Array.isArray(values.paperImages) ? values.paperImages.filter((f) => f?.url) : [],
      paperValues: { ...values, totals: { ...totals, approvedProgramFee: fee } }, paymentIds: phase.payments.map((p) => p._id),
    });
    po.events.push({ at: new Date(), action: 'PO created', details: `Converted patient${supply ? ` | ${supply.label}` : ''} | Rs ${fee}${received > 0 ? ` | Rs ${received} received` : ''}`, byName: user.name, byRole: user.role || '' });
    await po.save();
  } catch (error) {
    if (patient) await patient.deleteOne().catch(() => {});
    await PurchaseOrder.deleteOne({ _id: po._id }).catch(() => {});
    throw error;
  }
  return { patient, inTransit: true, poNumber: po.poNumber, values };
};

// The consultation fee (e.g. Rs 599) was paid against the appointment. Attach those receipts to the new patient so the
// final bill and the ledger find them. Never lets a problem here undo the conversion.
const linkConsultationReceipts = async (entry, patient) => {
  try {
    const salesIds = entry.sourceAppointment ? [entry.sourceAppointment] : [];
    const accounts = salesIds.length ? await SalesAppointment.find({ _id: { $in: salesIds } }).select('consultationAccount').lean() : [];
    const sales = [...new Set([...salesIds, ...accounts.map((row) => row.consultationAccount).filter(Boolean)].map(String))];
    const match = [{ appointment: entry._id }, ...(sales.length ? [{ salesAppointment: { $in: sales } }] : [])];
    await ConsultationReceipt.updateMany({ $or: match, patient: null }, { $set: { patient: patient._id, patientCode: patient.patientCode || '' } });
  } catch (error) {
    console.error('Consultation receipts could not be linked to the patient:', error.message);
  }
};

module.exports = { patientInputFromRegistration, assertPurchaseComplete, withBankName, paymentFromPaper, createConvertedPatient, linkConsultationReceipts };
