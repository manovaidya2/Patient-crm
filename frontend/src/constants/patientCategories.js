export const PATIENT_CATEGORIES = {
  AUTISM_ADHD: 'autism_adhd',
  MENTAL_HEALTH: 'mental_health',
  // Neither: the Appointment Management case category "Other".
  OTHER: 'other',
};

export const ALL_PATIENT_CATEGORIES = [PATIENT_CATEGORIES.AUTISM_ADHD, PATIENT_CATEGORIES.MENTAL_HEALTH, PATIENT_CATEGORIES.OTHER];

// Case category on a medicine request (the Sales sheet's "Case Category").
export const CASE_CATEGORIES = ['Autism', 'ADHD', 'Autism + ADHD', 'Mental Health', 'Other'];

export const CATEGORY_LABELS = {
  [PATIENT_CATEGORIES.AUTISM_ADHD]: 'Autism/ADHD',
  [PATIENT_CATEGORIES.MENTAL_HEALTH]: 'Mental Health',
  [PATIENT_CATEGORIES.OTHER]: 'Other',
};