// Disease categories the external CRM sends patients under via webhook.
const CATEGORIES = {
  AUTISM_ADHD: 'autism_adhd',
  MENTAL_HEALTH: 'mental_health',
};

const ALL_CATEGORIES = [CATEGORIES.AUTISM_ADHD, CATEGORIES.MENTAL_HEALTH];

const CATEGORY_LABELS = {
  [CATEGORIES.AUTISM_ADHD]: 'Autism/ADHD',
  [CATEGORIES.MENTAL_HEALTH]: 'Mental Health',
};

module.exports = { CATEGORIES, ALL_CATEGORIES, CATEGORY_LABELS };