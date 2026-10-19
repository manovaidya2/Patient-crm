// Turning a post-counselling / Package Not Bought record into a real patient. Shared by both routes so the patient, the
// Phase 1 package, the purchase order and the payment received always look the same.
const BankAccount = require('../models/BankAccount');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const SalesAppointment = require('../models/SalesAppointment');
const { createPatientRecord } = require('../controllers/patientController');
const { PROFILE_KEYS } = require('./patientProfile');

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

// Converting needs the PO paper to be filled in: the PO number (it starts In Transit) and how the payment was made.
const assertPurchaseComplete = (values = {}) => {
  if (!text(values.poNo)) throw fail('Enter the PO number to convert');
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

// Creates the patient and fills Phase 1 (package, PO, total, the payment received now). If anything fails after the
// patient exists, the patient is removed again, so a failed conversion never leaves a half-made patient behind.
const createConvertedPatient = async ({ input, fee, values, cardCharge = 0, user, activityDetails }) => {
  const received = Number(values.amountReceivedNow || 0);
  const patient = await createPatientRecord(input, user, { activityDetails });
  try {
    const phase = patient.stages.find((stage) => stage.number === 1);
    phase.packageName = text(values.orderedTreatment, 120);
    phase.purchaseOrder = text(values.poNo, 80);
    phase.totalAmount = fee;
    if (received > 0) {
      const cash = values.mode === 'Cash';
      const notes = [
        `Mode: ${values.mode || 'Not set'}`, values.mode === 'Card (+3%)' ? `3% card charge Rs ${cardCharge || 0}` : '',
        values.poNo ? `PO ${values.poNo}` : '', values.paymentTime ? `Time ${values.paymentTime}` : '',
        values.paymentVerifiedBy ? `Verified by ${values.paymentVerifiedBy}` : '', text(values.paymentNotes, 500),
      ].filter(Boolean).join(' | ');
      const screenshots = !cash && Array.isArray(values.screenshots) ? values.screenshots : [];
      const paidOn = values.paymentDate || values.poDate;
      phase.payments.push({
        amount: received, date: paidOn ? new Date(`${paidOn}T12:00:00.000Z`) : new Date(), paymentMode: cash ? 'cash' : 'online',
        payToBank: !cash && values.payToBank ? values.payToBank : null, payToBankName: cash ? '' : text(values.payToBankName),
        utr: cash ? '' : text(values.utrReference), transactionId: cash ? '' : text(values.transactionId), receivedBy: cash ? text(values.cashReceiver || values.cashHandedTo) : '',
        screenshotUrl: screenshots[0]?.url || null, screenshotFiles: screenshots,
        notes, recordedByName: user.name, approvalStatus: 'pending',
      });
      patient.activityLog.push({ action: 'Payment added for Phase 1', details: `${received} via ${values.mode || 'Online'} — pending accounts approval`, actorName: user.name, actorRole: user.role || '' });
    }
    await patient.save();
  } catch (error) {
    await patient.deleteOne();
    throw error;
  }
  // In Transit starts for a phase that has a PO number and at least one payment.
  return { patient, inTransit: Boolean(text(values.poNo)) && received > 0 };
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

module.exports = { patientInputFromRegistration, assertPurchaseComplete, withBankName, createConvertedPatient, linkConsultationReceipts };
