export const PAYMENT_MODES = {
  CASH: 'cash',
  ONLINE: 'online',
  // Paid partly online / cash / card the same day: one payment (components/payments/SplitRows).
  SPLIT: 'split',
};

export const PAYMENT_MODE_LABELS = {
  cash: 'Cash',
  online: 'Online',
  split: 'Split (online + cash + card)',
};

export const PAYMENT_MODE_OPTIONS = [
  { value: PAYMENT_MODES.ONLINE, label: PAYMENT_MODE_LABELS.online },
  { value: PAYMENT_MODES.CASH, label: PAYMENT_MODE_LABELS.cash },
  { value: PAYMENT_MODES.SPLIT, label: 'Split' },
];