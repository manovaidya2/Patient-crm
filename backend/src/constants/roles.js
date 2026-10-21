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
  DISPATCH_COURIER: 'dispatch_courier',
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
  ROLES.PSYCHOLOGIST,
  ROLES.MEDICINE_DEPARTMENT,
  ROLES.DISPATCH_COURIER,
  ROLES.DIGITAL_MARKETING,
  ROLES.SALES_TEAM,
  ROLES.RECEPTIONIST,
  ROLES.HR,
];

const ALL_ROLES = [ROLES.ADMIN, ...CREATABLE_ROLES];
const GENERAL_CRM_ROLES = ALL_ROLES.filter((role) => role !== ROLES.HR);
const HR_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.HR];
const HR_FULL_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR];
const hasHrFullAccess = (role) => HR_FULL_ACCESS_ROLES.includes(role);

// Roles that can open All Patients / Patient Details and see every patient, same as Admin.
const PATIENT_FULL_ACCESS_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.RECEPTIONIST];

// Assistant Doctor and Psychologist can also open those pages, but only for patients assigned to them.
const PATIENT_ACCESS_ROLES = [...PATIENT_FULL_ACCESS_ROLES, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];

// Roles allowed to assign/reassign a patient's Assistant Doctor and Psychologist.
const ASSIGN_DOCTOR_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.RECEPTIONIST];

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.POST_COUNSELOR]: 'Post Counselor',
  [ROLES.ASSISTANT_DOCTOR]: 'Assistant Doctor',
  [ROLES.DOCTOR]: 'Doctor',
  [ROLES.PSYCHOLOGIST]: 'Psychologist',
  [ROLES.MEDICINE_DEPARTMENT]: 'Medicine Department',
  [ROLES.DISPATCH_COURIER]: 'Dispatch & Courier',
  [ROLES.DIGITAL_MARKETING]: 'Digital Marketing',
  [ROLES.SALES_TEAM]: 'Sales Team',
  [ROLES.RECEPTIONIST]: 'Receptionist',
  [ROLES.HR]: 'HR',
};

module.exports = {
  ROLES,
  CREATABLE_ROLES,
  ALL_ROLES,
  GENERAL_CRM_ROLES,
  HR_ACCESS_ROLES,
  HR_FULL_ACCESS_ROLES,
  hasHrFullAccess,
  ROLE_LABELS,
  PATIENT_FULL_ACCESS_ROLES,
  PATIENT_ACCESS_ROLES,
  ASSIGN_DOCTOR_ROLES,
};
