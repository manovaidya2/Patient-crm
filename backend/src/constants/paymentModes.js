const PAYMENT_MODES = {
  CASH: 'cash',
  ONLINE: 'online',
};

const ALL_PAYMENT_MODES = Object.values(PAYMENT_MODES);

const PAYMENT_MODE_LABELS = {
  cash: 'Cash',
  online: 'Online',
};

module.exports = { PAYMENT_MODES, ALL_PAYMENT_MODES, PAYMENT_MODE_LABELS };