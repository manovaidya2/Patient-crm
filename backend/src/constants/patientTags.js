const { ROLES } = require('./roles');

// Tags put on a patient from Patient Details. The list is fixed here; a tag stays on the patient whether the patient
// is active or inactive.
const PATIENT_TAGS = {
  actor: 'Actor patient',
  // A known person of the clinic: their medicine goes on without waiting for a payment (the Doctor's standing
  // approval) - medicine release, dispatch / handover and the explanation do not stop for payment, and an exception
  // payment of their PO counts as approved.
  known: 'Known person',
};
const KNOWN_PERSON_TAG = 'known';

// Who puts a tag on / takes it off (everyone who can open the patient sees it).
const TAG_EDIT_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.POST_COUNSELOR];
// A tag that changes who pays: only the Doctor and the Admin.
const TAG_ROLES = { known: [ROLES.ADMIN, ROLES.DOCTOR] };
const canEditTag = (tag, role) => (TAG_ROLES[tag] || TAG_EDIT_ROLES).includes(role);

// The payment of this patient's medicine is waived (Known person).
const paymentWaived = (patient) => Boolean(patient?.tags?.includes?.(KNOWN_PERSON_TAG));

module.exports = { PATIENT_TAGS, TAG_EDIT_ROLES, TAG_ROLES, KNOWN_PERSON_TAG, canEditTag, paymentWaived };
