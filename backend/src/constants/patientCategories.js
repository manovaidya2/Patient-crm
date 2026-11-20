// Disease categories the external CRM sends patients under via webhook.
const CATEGORIES = {
  AUTISM_ADHD: 'autism_adhd',
  MENTAL_HEALTH: 'mental_health',
  // Neither: the Appointment Management case category "Other".
  OTHER: 'other',
};

const ALL_CATEGORIES = [CATEGORIES.AUTISM_ADHD, CATEGORIES.MENTAL_HEALTH, CATEGORIES.OTHER];

const CATEGORY_LABELS = {
  [CATEGORIES.AUTISM_ADHD]: 'Autism/ADHD',
  [CATEGORIES.MENTAL_HEALTH]: 'Mental Health',
  [CATEGORIES.OTHER]: 'Other',
};

module.exports = { CATEGORIES, ALL_CATEGORIES, CATEGORY_LABELS };