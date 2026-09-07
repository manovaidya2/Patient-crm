export const PAYMENT_MODES = {
  CASH: 'cash',
  ONLINE: 'online',
};

export const PAYMENT_MODE_LABELS = {
  cash: 'Cash',
  online: 'Online',
};

export const PAYMENT_MODE_OPTIONS = [
  { value: PAYMENT_MODES.ONLINE, label: PAYMENT_MODE_LABELS.online },
  { value: PAYMENT_MODES.CASH, label: PAYMENT_MODE_LABELS.cash },
];