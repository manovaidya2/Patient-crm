// An appointment for a patient who is already in the CRM (Sales "Patient Type" = Existing, with their old Patient ID).
// Reception keeps that Patient ID instead of generating a new one, and on conversion the purchase goes into the
// patient's next phase (after the phases already bought) instead of creating a second patient.
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const { STAGES } = require('../constants/treatmentStages');
const { CATEGORY_LABEL } = require('./receptionFlow');

const PATIENT_TYPE_ID = '6ab7b22ebf916b34dfd9f5db';
const EXISTING_PATIENT_ID_FIELD = '6b1f0a3c9d2e4f5a6b7c8d01';
const EXISTING = 'Existing';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanCode = (value) => String(value ?? '').trim().slice(0, 60);
const valueOf = (values, id) => String((values?.get ? values.get(id) : values?.[id]) ?? '').trim();

// Sales values say this appointment is for an existing patient (and which one).
const existingCodeFrom = (salesValues) => (valueOf(salesValues, PATIENT_TYPE_ID) === EXISTING ? cleanCode(valueOf(salesValues, EXISTING_PATIENT_ID_FIELD)) : '');

// Patient IDs are matched without caring about upper / lower case or spaces around them.
const findByCode = (code, select) => {
  const clean = cleanCode(code);
  if (!clean) return null;
  const query = Patient.findOne({ patientCode: new RegExp(`^${escapeRegex(clean)}$`, 'i') });
  return select && typeof query.select === 'function' ? query.select(select) : query;
};

// A phase is taken once anything was bought or paid in it (or a purchase order points at it).
const phaseInUse = (stage = {}) => Boolean(
  String(stage.purchaseOrder || '').trim() || String(stage.packageName || '').trim() || Number(stage.totalAmount || 0) > 0
  || (stage.payments || []).length || stage.poPaper,
);

// The phase a new purchase goes into: the one after the last phase in use. null when all phases are used.
const nextPhaseOf = async (patient) => {
  const fromStages = (patient.stages || []).filter(phaseInUse).map((stage) => stage.number);
  const fromOrders = await PurchaseOrder.distinct('phase', { patient: patient._id, status: { $ne: 'cancelled' } });
  const last = Math.max(0, ...fromStages, ...fromOrders.map(Number).filter(Number.isFinite));
  const next = last + 1;
  return STAGES.includes(next) ? next : null;
};

// What the forms show about the existing patient.
const summaryOf = async (patient) => {
  const nextPhase = await nextPhaseOf(patient);
  return {
    id: String(patient._id),
    patientCode: patient.patientCode || '',
    patientName: patient.patientName || '',
    age: patient.age ?? '',
    category: patient.category || '',
    categoryLabel: CATEGORY_LABEL[patient.category] || '',
    guardianName: patient.guardianName || '',
    number: patient.number || '',
    isActive: patient.isActive !== false,
    currentPhase: patient.currentStage || 1,
    phasesUsed: (patient.stages || []).filter(phaseInUse).map((stage) => ({ number: stage.number, packageName: stage.packageName || '', purchaseOrder: stage.purchaseOrder || '' })),
    nextPhase,
  };
};

// Looks the code up and explains what is wrong, for Sales / Reception messages.
const resolveExisting = async (code) => {
  const clean = cleanCode(code);
  if (!clean) return { error: 'Enter the old Patient ID of the existing patient' };
  const patient = await findByCode(clean);
  if (!patient) return { error: `No patient found with Patient ID ${clean}` };
  return { patient, summary: await summaryOf(patient) };
};

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Sales values about to be saved: an Existing patient needs a real old Patient ID (saved as the CRM spells it);
// a New patient never keeps one. `values` is a plain object keyed by column id and is changed in place.
const applyExistingPatient = async (values, { requireId = true } = {}) => {
  if (!(EXISTING_PATIENT_ID_FIELD in values) && !(PATIENT_TYPE_ID in values)) return values;
  if (values[PATIENT_TYPE_ID] !== EXISTING) {
    values[EXISTING_PATIENT_ID_FIELD] = '';
    return values;
  }
  const code = cleanCode(values[EXISTING_PATIENT_ID_FIELD]);
  if (!code) {
    if (requireId) throw badRequest('Enter the Old Patient ID of the existing patient');
    return values;
  }
  const found = await findByCode(code, 'patientCode');
  if (!found) throw badRequest(`No patient found with Patient ID ${code}`);
  values[EXISTING_PATIENT_ID_FIELD] = found.patientCode;
  return values;
};

module.exports = {
  PATIENT_TYPE_ID, EXISTING_PATIENT_ID_FIELD, EXISTING,
  existingCodeFrom, findByCode, phaseInUse, nextPhaseOf, summaryOf, resolveExisting, applyExistingPatient,
};
