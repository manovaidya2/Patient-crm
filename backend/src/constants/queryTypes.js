// What one person usually needs from another, by the role of the person the query goes to. Shown as the query types
// in the chat with that person; each gives the subject and a starting message (the PO / patient context is added
// by itself when the query is raised from a purchase order).
const { ROLES } = require('./roles');

const OTHER = { key: 'other', label: 'Other', subject: '', message: '' };
const QUERY_TYPES = {
  [ROLES.MEDICINE_DEPARTMENT]: [
    { key: 'medicine_not_ready', label: 'Medicine not ready / overdue', subject: 'Medicine not ready', message: 'The ready-by date has passed and the medicine is not ready yet. When will it be ready?' },
    { key: 'request_not_accepted', label: 'Request not accepted yet', subject: 'Medicine request not accepted', message: 'The medicine request is still waiting to be accepted. Please accept it or tell me what is missing.' },
    { key: 'release_pending', label: 'Release pending (payment done)', subject: 'Release pending', message: 'The full payment is verified; please release the parcel to In Transit.' },
    { key: 'parcel_issue', label: 'Wrong / missing item in parcel', subject: 'Parcel issue', message: 'Something in the packed parcel does not match the request:' },
    { key: 'formulation_doubt', label: 'Formulation / dose doubt', subject: 'Formulation doubt', message: 'I have a doubt about the formulation / dose:' },
    { key: 'stock', label: 'Stock / shortage', subject: 'Stock query', message: 'About the stock of:' },
    OTHER,
  ],
  [ROLES.ASSISTANT_DOCTOR]: [
    { key: 'explanation_pending', label: 'Medicine not explained yet', subject: 'Medicine explanation pending', message: 'The medicine reached the patient but the explanation is not done yet. When will you do it?' },
    { key: 'followup_pending', label: 'Follow-up not done', subject: 'Follow-up pending', message: 'The follow-up of this patient is due / not done. Please update.' },
    { key: 'patient_not_responding', label: 'Patient not responding / needs a call', subject: 'Patient needs a call', message: 'The patient is not responding; please call and update.' },
    { key: 'treatment_start', label: 'Treatment start pending', subject: 'Treatment start pending', message: 'The explanation is done but the treatment is not marked started. Please check.' },
    { key: 'dose_question', label: 'Dose / instruction question', subject: 'Dose question', message: 'The patient asked about the dose / instructions:' },
    OTHER,
  ],
  [ROLES.DOCTOR]: [
    { key: 'formulation_verification', label: 'Formulation verification pending', subject: 'Formulation verification pending', message: 'The formulation of this patient is waiting for your verification (fulfilment step 3).' },
    { key: 'doctor_verification', label: 'Doctor verification (step 10) pending', subject: 'Doctor verification pending', message: 'The packed medicine is waiting for your verification (fulfilment step 10).' },
    { key: 'dose_doubt', label: 'Dose / medicine doubt', subject: 'Dose doubt', message: 'I need your advice on:' },
    { key: 'patient_approval', label: 'Patient approval needed', subject: 'Patient approval', message: 'This patient needs approval before we can go on.' },
    OTHER,
  ],
  [ROLES.IN_TRANSIT]: [
    { key: 'po_verification', label: 'PO / payment verification pending', subject: 'PO verification pending', message: 'The purchase order / payment is waiting for verification.' },
    { key: 'medicine_request', label: 'Medicine request not sent', subject: 'Medicine request not sent', message: 'The PO is verified but the medicine request has not been sent yet.' },
    { key: 'delivery_status', label: 'Delivery / dispatch status', subject: 'Delivery status', message: 'What is the status of the delivery / dispatch for this patient?' },
    { key: 'payment_pending', label: 'Balance / pending payment', subject: 'Payment pending', message: 'About the balance / pending payment of this patient:' },
    { key: 'schedule', label: 'Delivery schedule / explanation date', subject: 'Delivery schedule', message: 'Please fix / confirm the delivery and medicine explanation date.' },
    OTHER,
  ],
  [ROLES.POST_COUNSELOR]: [
    { key: 'po_paper', label: 'PO paper / payment details missing', subject: 'PO paper details missing', message: 'Something is missing or wrong on the PO paper / payment details:' },
    { key: 'plan_correction', label: 'Ready date / supply correction', subject: 'Plan correction', message: 'The medicine ready date / supply on the PO needs a correction:' },
    { key: 'patient_details', label: 'Patient details / contact', subject: 'Patient details', message: 'I need these patient details:' },
    OTHER,
  ],
  [ROLES.RECEPTIONIST]: [
    { key: 'records_room', label: 'Patient file / Records Room scan missing', subject: 'Patient file missing', message: "The patient's file is not in the Records Room. Please scan it." },
    { key: 'appointment', label: 'Appointment / consultation fee', subject: 'Appointment query', message: 'About the appointment / consultation fee of this patient:' },
    { key: 'courier_register', label: 'Incoming / outgoing courier', subject: 'Courier register', message: 'About a courier in the register:' },
    OTHER,
  ],
  [ROLES.ADMIN]: [
    { key: 'approval', label: 'Approval / permission needed', subject: 'Approval needed', message: 'I need your approval for:' },
    { key: 'revert', label: 'Revert / delete a step or record', subject: 'Revert needed', message: 'Please revert / delete this (done by mistake):' },
    { key: 'access', label: 'Access / role issue', subject: 'Access issue', message: 'I cannot access:' },
    OTHER,
  ],
  [ROLES.MANAGER]: [
    { key: 'followup_plan', label: 'Follow-up / session plan', subject: 'Follow-up plan', message: 'About the follow-up / session plan of this patient:' },
    { key: 'escalation', label: 'Escalation', subject: 'Escalation', message: 'This needs your attention:' },
    OTHER,
  ],
  [ROLES.PSYCHOLOGIST]: [
    { key: 'session', label: 'Session / family session', subject: 'Session query', message: 'About the session of this patient:' },
    OTHER,
  ],
  [ROLES.SALES_TEAM]: [
    { key: 'lead', label: 'Lead / enquiry details', subject: 'Lead details', message: 'About this lead / enquiry:' },
    OTHER,
  ],
  [ROLES.DIGITAL_MARKETING]: [
    { key: 'review', label: 'Review / content', subject: 'Review query', message: 'About the review / content:' },
    OTHER,
  ],
};

const queryTypesFor = (role) => QUERY_TYPES[role] || [OTHER];
const queryTypeOf = (role, key) => queryTypesFor(role).find((t) => t.key === key) || null;

module.exports = { QUERY_TYPES, queryTypesFor, queryTypeOf };
