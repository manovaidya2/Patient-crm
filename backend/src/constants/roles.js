// Central list of roles used across the CRM.
// ADMIN is created only via the seed script, never via the API.
const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  POST_COUNSELOR: 'post_counselor',
  ASSISTANT_DOCTOR: 'assistant_doctor',
  DOCTOR: 'doctor',
  PSYCHOLOGIST: 'psychologist',
  MEDICINE_DEPARTMENT: 'medicine_department',
  IN_TRANSIT: 'in_transit',
  DIGITAL_MARKETING: 'digital_marketing',
  SALES_TEAM: 'sales_team',
  RECEPTIONIST: 'receptionist',
  HR: 'hr',
};

// Roles the admin is allowed to create/manage through the Team Members module.
const CREATABLE_ROLES = [
  ROLES.MANAGER,
  ROLES.POST_COUNSELOR,
  ROLES.ASSISTANT_DOCTOR,
  ROLES.DOCTOR,
  ROLES.MEDICINE_DEPARTMENT,
  ROLES.IN_TRANSIT,
  ROLES.DIGITAL_MARKETING,
  ROLES.SALES_TEAM,
  ROLES.RECEPTIONIST,
  ROLES.HR,
];

const ALL_ROLES = [ROLES.ADMIN, ...CREATABLE_ROLES];
// Roles no longer in use. Existing accounts keep the value so old records still show who did the work,
// but these accounts cannot sign in and no new account can get the role. Family sessions now belong to the PCC.
const RETIRED_ROLES = [ROLES.PSYCHOLOGIST];
const isRetiredRole = (role) => RETIRED_ROLES.includes(role);
// Every value a stored user may carry (active roles + retired ones).
const STORED_ROLES = [...ALL_ROLES, ...RETIRED_ROLES];
const GENERAL_CRM_ROLES = ALL_ROLES.filter((role) => role !== ROLES.HR);
const HR_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.HR];
const HR_FULL_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR];
// The Manager gets the same HR access (kept out of the list itself, which also guards HR deletes).
const hasHrFullAccess = (role) => HR_FULL_ACCESS_ROLES.includes(role) || role === ROLES.MANAGER;

// Roles that can open All Patients / Patient Details and see every patient, same as Admin.
const PATIENT_FULL_ACCESS_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.IN_TRANSIT];

// The PCC (assistant_doctor) can also open those pages, but only for patients assigned to them.
const PATIENT_ACCESS_ROLES = [...PATIENT_FULL_ACCESS_ROLES, ROLES.ASSISTANT_DOCTOR];

// Roles allowed to assign/reassign a patient's Assistant Doctor and Psychologist.
const ASSIGN_DOCTOR_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];

// The Manager works like the Admin everywhere (sees and fills every role's work), except deleting anything and
// reading other people's private Team Chat - those stay with the Admin only.
const ADMIN_LIKE_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
const isAdminLike = (userOrRole) => ADMIN_LIKE_ROLES.includes(typeof userOrRole === 'string' ? userOrRole : userOrRole?.role);

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.POST_COUNSELOR]: 'Post Counselor',
  [ROLES.ASSISTANT_DOCTOR]: 'PCC (Patient Care Coordinator)', // role key stays assistant_doctor
  [ROLES.DOCTOR]: 'Doctor',
  [ROLES.PSYCHOLOGIST]: 'Psychologist (retired role)',
  [ROLES.MEDICINE_DEPARTMENT]: 'Medicine Department',
  [ROLES.IN_TRANSIT]: 'In Transit',
  [ROLES.DIGITAL_MARKETING]: 'Digital Marketing',
  [ROLES.SALES_TEAM]: 'Sales Team',
  [ROLES.RECEPTIONIST]: 'Receptionist',
  [ROLES.HR]: 'HR',
};

module.exports = {
  ROLES,
  CREATABLE_ROLES,
  ALL_ROLES,
  RETIRED_ROLES,
  isRetiredRole,
  STORED_ROLES,
  GENERAL_CRM_ROLES,
  HR_ACCESS_ROLES,
  HR_FULL_ACCESS_ROLES,
  hasHrFullAccess,
  ROLE_LABELS,
  PATIENT_FULL_ACCESS_ROLES,
  PATIENT_ACCESS_ROLES,
  ASSIGN_DOCTOR_ROLES,
  ADMIN_LIKE_ROLES,
  isAdminLike,
};
