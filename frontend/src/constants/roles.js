export const ROLES = {
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

// Roles the admin can create logins for (admin itself is seeded, not created here)
export const CREATABLE_ROLES = [
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

// Roles no longer in use (kept so old records still show who did the work). Family sessions are done by the PCC.
export const RETIRED_ROLES = [ROLES.PSYCHOLOGIST];

export const ROLE_LABELS = {
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

// The Manager works like the Admin everywhere, except deleting anything and reading other people's private Team Chat.
export const ADMIN_LIKE_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
export const isAdminLike = (userOrRole) => ADMIN_LIKE_ROLES.includes(typeof userOrRole === 'string' ? userOrRole : userOrRole?.role);
// True when `roles` lets this user act; a list that names the Admin also lets the Manager act.
export const roleAllowed = (roles = [], userOrRole) => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return roles.includes(role) || (isAdminLike(role) && roles.includes(ROLES.ADMIN));
};

// Roles that can open All Patients / Patient Details (the PCC is scoped to assigned patients by the backend)
export const PATIENT_ACCESS_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.IN_TRANSIT];
export const ADMIN_LAYOUT_ROLES = [...PATIENT_ACCESS_ROLES, ROLES.MEDICINE_DEPARTMENT, ROLES.DIGITAL_MARKETING, ROLES.SALES_TEAM, ROLES.HR];
export const HR_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.HR];
export const HR_FULL_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR];
export const hasHrFullAccess = (role) => HR_FULL_ACCESS_ROLES.includes(role) || isAdminLike(role);
// Deleting HR records stays with the Admin and the Doctor (not the Manager).
export const canHrDelete = (role) => HR_FULL_ACCESS_ROLES.includes(role);

// Roles allowed to assign/reassign a patient's PCC
export const ASSIGN_DOCTOR_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];

// Where a user lands right after logging in
export const getDefaultRoute = (role) => {
  if (role === ROLES.SALES_TEAM) return '/admin/appointment-management';
  if (role === ROLES.RECEPTIONIST) return '/admin';
  if (role === ROLES.ADMIN) return '/admin';
  if (role === ROLES.DOCTOR) return '/admin';
  if ([ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR].includes(role)) return '/admin';
  // Roles without a dashboard land on their open work.
  if (role === ROLES.MEDICINE_DEPARTMENT) return '/admin/my-day';
  if (role === ROLES.IN_TRANSIT) return '/admin/my-day';
  if (role === ROLES.POST_COUNSELOR) return '/admin/my-day';
  if (role === ROLES.DIGITAL_MARKETING) return '/admin/digital-marketing';
  if (role === ROLES.HR) return '/admin/hr';
  if (PATIENT_ACCESS_ROLES.includes(role)) return '/admin/patients';
  return '/dashboard';
};
