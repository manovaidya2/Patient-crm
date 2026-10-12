const { ROLES } = require('../constants/roles');

const isConsentFormColumn = (column) => /^(consent|concent)\s*form$/i.test(
  String(column?.label || '').trim().replace(/\s+/g, ' '),
);

const isManagementColumnRequired = (column, role) => Boolean(column?.required)
  && !(role === ROLES.ADMIN && isConsentFormColumn(column));

module.exports = { isConsentFormColumn, isManagementColumnRequired };
