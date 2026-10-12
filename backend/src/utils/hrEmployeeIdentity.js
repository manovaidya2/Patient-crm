const normalizeEmployeeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeEmployeePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 && digits.startsWith('91') ? digits.slice(-10) : digits;
};

const sameEmployeeIdentity = (left, right) => normalizeEmployeeName(left?.name) === normalizeEmployeeName(right?.name)
  && normalizeEmployeePhone(left?.phone) === normalizeEmployeePhone(right?.phone);

module.exports = { normalizeEmployeeName, normalizeEmployeePhone, sameEmployeeIdentity };
