const PAYMENT_MODES = {
  CASH: 'cash',
  ONLINE: 'online',
  // One payment paid partly online, in cash and / or by card on the same day (utils/splitPayment).
  SPLIT: 'split',
};

const ALL_PAYMENT_MODES = Object.values(PAYMENT_MODES);

const PAYMENT_MODE_LABELS = {
  cash: 'Cash',
  online: 'Online',
  split: 'Split (online + cash + card)',
};

module.exports = { PAYMENT_MODES, ALL_PAYMENT_MODES, PAYMENT_MODE_LABELS };