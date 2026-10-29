// The case category a medicine request is for (Autism / ADHD / Autism + ADHD / Mental Health).
// It comes from the patient's Sales sheet "Case Category"; the patient's own category is the fallback.
const mongoose = require('mongoose');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const { RECEPTION_IDS, SALES_IDS } = require('./receptionFlow');

const CASE_CATEGORIES = ['Autism', 'ADHD', 'Autism + ADHD', 'Mental Health'];

const cleanCaseCategory = (value) => CASE_CATEGORIES.find((c) => c.toLowerCase() === String(value || '').trim().toLowerCase()) || '';

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Never throws: without a match the request form just asks for the category.
const patientCaseCategory = async (patient) => {
  const fallback = patient?.category === 'mental_health' ? 'Mental Health' : '';
  try {
    const code = String(patient?.patientCode || '').trim();
    // No database connection (e.g. unit tests): nothing to look up, and never wait for one.
    if (!code || mongoose.connection.readyState !== 1) return fallback;
    const entry = await AppointmentManagementEntry.findOne({ [`values.${RECEPTION_IDS.patientId}`]: { $regex: `^\\s*${escape(code)}\\s*$`, $options: 'i' }, [`salesValues.${SALES_IDS.caseCategory}`]: { $nin: ['', null] } })
      .sort({ createdAt: -1 }).select('salesValues').lean();
    const sales = entry?.salesValues?.[SALES_IDS.caseCategory] ?? entry?.salesValues?.get?.(SALES_IDS.caseCategory);
    return cleanCaseCategory(sales) || fallback;
  } catch (error) {
    console.error('Case category could not be loaded:', error.message);
    return fallback;
  }
};

module.exports = { CASE_CATEGORIES, cleanCaseCategory, patientCaseCategory };
