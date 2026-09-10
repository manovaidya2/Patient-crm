export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  POST_COUNSELOR: 'post_counselor',
  ASSISTANT_DOCTOR: 'assistant_doctor',
  DOCTOR: 'doctor',
  PSYCHOLOGIST: 'psychologist',
  MEDICINE_DEPARTMENT: 'medicine_department',
  DISPATCH_COURIER: 'dispatch_courier',
  ACCOUNTANT: 'accountant',
};

// Roles the admin can create logins for (admin itself is seeded, not created here)
export const CREATABLE_ROLES = [
  ROLES.MANAGER,
  ROLES.POST_COUNSELOR,
  ROLES.ASSISTANT_DOCTOR,
  ROLES.DOCTOR,
  ROLES.PSYCHOLOGIST,
  ROLES.MEDICINE_DEPARTMENT,
  ROLES.DISPATCH_COURIER,
  ROLES.ACCOUNTANT,
];

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.POST_COUNSELOR]: 'Post Counselor',
  [ROLES.ASSISTANT_DOCTOR]: 'Assistant Doctor',
  [ROLES.DOCTOR]: 'Doctor',
  [ROLES.PSYCHOLOGIST]: 'Psychologist',
  [ROLES.MEDICINE_DEPARTMENT]: 'Medicine Department',
  [ROLES.DISPATCH_COURIER]: 'Dispatch & Courier',
  [ROLES.ACCOUNTANT]: 'Accountant',
};

// Roles that can open All Patients / Patient Details (Assistant Doctor and Psychologist are scoped by the backend)
export const PATIENT_ACCESS_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR, ROLES.ACCOUNTANT];
export const ADMIN_LAYOUT_ROLES = [...PATIENT_ACCESS_ROLES, ROLES.MEDICINE_DEPARTMENT, ROLES.DISPATCH_COURIER];

// Roles allowed to assign/reassign a patient's Assistant Doctor
export const ASSIGN_DOCTOR_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR];

// Where a user lands right after logging in
export const getDefaultRoute = (role) => {
  if (role === ROLES.ADMIN) return '/admin';
  if (role === ROLES.DOCTOR) return '/admin';
  if ([ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(role)) return '/admin';
  if (role === ROLES.MEDICINE_DEPARTMENT) return '/admin/medicine-requests';
  if (role === ROLES.DISPATCH_COURIER) return '/admin/courier';
  if (role === ROLES.ACCOUNTANT) return '/admin/accounts';
  if (PATIENT_ACCESS_ROLES.includes(role)) return '/admin/patients';
  return '/dashboard';
};
