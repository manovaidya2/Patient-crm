const { ROLES, CREATABLE_ROLES, isAdminLike } = require('./roles');
const departmentForRole = (role) => role === ROLES.PSYCHOLOGIST ? ROLES.ASSISTANT_DOCTOR : role;
const DEPARTMENTS = [...new Set(CREATABLE_ROLES.map(departmentForRole))];
function resolveDepartment(req) {
  const own = departmentForRole(req.user.role);
  const requested = req.query?.department || req.body?.department;
  const department = requested || (req.user.role === ROLES.ADMIN ? ROLES.RECEPTIONIST : own);
  if (!DEPARTMENTS.includes(department)) { const error = new Error('Invalid knowledge department'); error.statusCode = 400; throw error; }
  // The Manager opens its own library first but, like the Admin, may open any department's.
  if (!isAdminLike(req.user) && department !== own) { const error = new Error('You can access only your department library'); error.statusCode = 403; throw error; }
  return department;
}
const departmentFilter = (department) => department === ROLES.RECEPTIONIST
  ? { $or: [{ department }, { department: { $exists: false } }, { department: null }] }
  : { department };
module.exports = { departmentForRole, DEPARTMENTS, resolveDepartment, departmentFilter };
