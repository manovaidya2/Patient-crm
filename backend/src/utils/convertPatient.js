// Turning a post-counselling / Package Not Bought record into a real patient. Shared by both routes so the patient, the
// package in the visit's phase, the purchase order and the payment received always look the same.
const mongoose = require('mongoose');
const BankAccount = require('../models/BankAccount');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const SalesAppointment = require('../models/SalesAppointment');
const PurchaseOrder = require('../models/PurchaseOrder');
const { createPatientRecord } = require('../controllers/patientController');
const { PROFILE_KEYS } = require('./patientProfile');
const { createWithPoNumber } = require('./poNumber');
const { supplyOptionByLabel, ageBandByLabel } = require('../constants/supplyPlans');
const { findByCode, nextPhaseOf, phaseInUse, withPhaseInText } = require('./existingPatient');
const { STAGES } = require('../constants/treatmentStages');
const { cleanAge, setPhaseAge } = require('./phaseAge');

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
    utr: cash ? '' : text(values.utrReference, 1000), transactionId: cash ? '' : text(values.transactionId, 1000), receivedBy: cash ? text(values.cashReceiver || values.cashHandedTo) : '',
    utrEntries: cash ? [] : (Array.isArray(values.utrEntries) ? values.utrEntries : []),
    screenshotUrl: screenshots[0]?.url || null, screenshotFiles: screenshots,
    notes, recordedByName: user.name, approvalStatus: 'pending',
  };
};

// Creates the patient and fills the visit's phase (Phase 1 unless another was picked: package, PO, total, the payment received now), and the first PurchaseOrder
// record with a newly generated PO number. The number is reserved first; if anything fails afterwards, the patient and
// the reserved PO are removed again, so a failed conversion never leaves a half-made patient or a stray PO behind.
// existingPatientCode: set only when Sales marked the visit as an existing patient's. Then the purchase goes into that
// patient's next phase. Otherwise a new patient is made (and a Patient ID that is already taken is still refused).
// phase: the phase picked for this visit (registration / post counselling); a new patient starts in it too.
const createConvertedPatient = async (args) => {
  // In Transit and the Medicine Department cannot change these later, so post counselling must decide them now.
  const plan = args.values || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.medicineReadyDate || ''))) throw fail('Fill the medicine ready expected date on the PO paper');
  if (!supplyOptionByLabel(plan.supplyOrder)) throw fail('Select the medicine supply on the PO paper (6 months / 1+5 / 2+4)');
  if (!ageBandByLabel(plan.ageGroup)) throw fail('Enter the patient age on the PO paper (from 3 years; the age group comes from it)');
  // The age written on the PO paper is the patient's age for this phase.
  if (String(plan.patientAge || '').trim()) args = { ...args, input: { ...args.input, age: String(plan.patientAge).trim() } };
  const phase = STAGES.includes(Number(args.phase)) ? Number(args.phase) : null;
  // The PO paper's "Ordered treatment / phase" text follows the phase that was picked.
  if (phase && args.values) args = { ...args, values: { ...args.values, orderedTreatment: withPhaseInText(args.values.orderedTreatment, phase) } };
  args = { ...args, phase };
  if (!args.existingPatientCode) return createNewPatient(args);
  const existing = await findByCode(args.existingPatientCode);
  if (!existing) throw fail(`No patient found with Patient ID ${args.existingPatientCode}`, 404);
  return addPhaseToExistingPatient({ ...args, patient: existing, cardCharge: args.cardCharge ?? args.totals?.cardCharge ?? 0 });
};

const log = (patient, user, action, details = '') => patient.activityLog.push({ action, details, actorName: user.name, actorRole: user.role || '' });

// A returning patient (their old Patient ID was kept at reception): no second patient is made. The purchase, its PO
// and the payment received now go into the patient's next phase, the one after the phases already bought.
// Everything is changed in memory and saved once; if anything fails the reserved PO is removed again.
const addPhaseToExistingPatient = async ({ patient, input, fee, values: rawValues, totals = {}, cardCharge = 0, source = '', user, activityDetails, phase: chosen = null }) => {
  const phaseNumber = chosen || await nextPhaseOf(patient);
  if (!phaseNumber) throw fail(`${patient.patientName} (${patient.patientCode}) already has all phases in use. Ask the admin to check the patient's phases.`, 409);
  const taken = phaseInUse(patient.stages.find((stage) => stage.number === phaseNumber) || {})
    || await PurchaseOrder.exists({ patient: patient._id, phase: phaseNumber, status: { $ne: 'cancelled' } });
  if (taken) throw fail(`${patient.patientName} (${patient.patientCode}) already has a purchase in Phase ${phaseNumber}. Change the phase before converting.`, 409);
  const received = Number(rawValues.amountReceivedNow || 0);
  const supply = supplyOptionByLabel(rawValues.supplyOrder);
  const po = await createWithPoNumber(PurchaseOrder, {
    phase: phaseNumber, status: 'pending', source: 'conversion', createdByName: user.name, createdByRole: user.role || '',
    supplyPlan: supply?.plan || '', supplyPart: supply?.part || '', ageBand: ageBandByLabel(rawValues.ageGroup),
  });
  const values = { ...rawValues, poNo: po.poNumber };
  try {
    let phase = patient.stages.find((stage) => stage.number === phaseNumber);
    if (!phase) { patient.stages.push({ number: phaseNumber }); phase = patient.stages.find((stage) => stage.number === phaseNumber); }
    phase.packageName = text(values.orderedTreatment, 120);
    phase.purchaseOrder = po.poNumber;
    phase.totalAmount = fee;
    if (input.postCounselor) phase.postCounselor = input.postCounselor;
    // The age told at this visit belongs to this phase (and becomes the patient's latest age).
    const previousAge = patient.age || '';
    if (setPhaseAge(patient, phase, input.age) && previousAge && previousAge !== patient.age) log(patient, user, `Age updated for Phase ${phaseNumber}`, `From ${previousAge} to ${patient.age}`);
    if (input.consultationDate) phase.consultationDate = new Date(`${input.consultationDate}T00:00:00.000+05:30`);
    if (!phase.transit) phase.transit = {};
    phase.transit.enteredAt = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(values.medicineReadyDate || ''))) phase.transit.expectedReadyDate = new Date(`${values.medicineReadyDate}T00:00:00.000+05:30`);
    phase.poPaper = { values, totals: { ...totals, approvedProgramFee: fee }, savedAt: new Date(), savedByName: user.name, source };
    const payment = paymentFromPaper(values, { cardCharge, user });
    if (payment) {
      phase.payments.push(payment);
      log(patient, user, `Payment added for Phase ${phaseNumber}`, `${received} via ${values.mode || 'Online'} — pending accounts approval`);
    }
    if (patient.isActive === false) {
      patient.isActive = true;
      log(patient, user, 'Patient reopened', `Came back and bought Phase ${phaseNumber}`);
    }
    log(patient, user, `Returning patient: Phase ${phaseNumber} bought`, activityDetails || '');
    log(patient, user, `Purchase order created for Phase ${phaseNumber}`, `${po.poNumber}${supply ? ` | ${supply.label}` : ''} | Rs ${fee}`);
    await patient.save();
    Object.assign(po, {
      patient: patient._id, patientCode: patient.patientCode || '', patientName: patient.patientName,
      packageName: phase.packageName, amount: fee, medicineReadyDate: phase.transit.expectedReadyDate || null,
      paperImages: Array.isArray(values.paperImages) ? values.paperImages.filter((f) => f?.url) : [],
      paperValues: { ...values, totals: { ...totals, approvedProgramFee: fee } }, paymentIds: phase.payments.map((p) => p._id),
    });
    po.events.push({ at: new Date(), action: 'PO created', details: `Returning patient, Phase ${phaseNumber}${supply ? ` | ${supply.label}` : ''} | Rs ${fee}${received > 0 ? ` | Rs ${received} received` : ''}`, byName: user.name, byRole: user.role || '' });
    await po.save();
  } catch (error) {
    await PurchaseOrder.deleteOne({ _id: po._id }).catch(() => {});
    throw error;
  }
  return { patient, inTransit: true, poNumber: po.poNumber, values, existing: true, phase: phaseNumber };
};

const createNewPatient = async ({ input, fee, values: rawValues, totals = {}, cardCharge = totals.cardCharge || 0, source = '', user, activityDetails, phase: chosen = null }) => {
  const phaseNumber = chosen || 1;
  const received = Number(rawValues.amountReceivedNow || 0);
  const supply = supplyOptionByLabel(rawValues.supplyOrder);
  const po = await createWithPoNumber(PurchaseOrder, {
    phase: phaseNumber, status: 'pending', source: 'conversion', createdByName: user.name, createdByRole: user.role || '',
    supplyPlan: supply?.plan || '', supplyPart: supply?.part || '', ageBand: ageBandByLabel(rawValues.ageGroup),
  });
  const values = { ...rawValues, poNo: po.poNumber };
  let patient = null;
  try {
    patient = await createPatientRecord({ ...input, currentStage: phaseNumber }, user, { activityDetails });
    const phase = patient.stages.find((stage) => stage.number === phaseNumber);
    phase.age = cleanAge(input.age);
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
      patient.activityLog.push({ action: `Payment added for Phase ${phaseNumber}`, details: `${received} via ${values.mode || 'Online'} — pending accounts approval`, actorName: user.name, actorRole: user.role || '' });
    }
    patient.activityLog.push({ action: `Purchase order created for Phase ${phaseNumber}`, details: `${po.poNumber}${supply ? ` | ${supply.label}` : ''} | Rs ${fee}`, actorName: user.name, actorRole: user.role || '' });
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
  return { patient, inTransit: true, poNumber: po.poNumber, values, phase: phaseNumber };
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
