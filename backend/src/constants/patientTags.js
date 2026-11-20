const { ROLES } = require('./roles');

// Tags put on a patient from Patient Details. The list is fixed here; a tag stays on the patient whether the patient
// is active or inactive.
const PATIENT_TAGS = {
  actor: 'Actor patient',
};

// Who puts a tag on / takes it off (everyone who can open the patient sees it).
const TAG_EDIT_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.POST_COUNSELOR];

module.exports = { PATIENT_TAGS, TAG_EDIT_ROLES };
