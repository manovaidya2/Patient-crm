const AccountEntry = require('../models/AccountEntry');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');

const TYPES = ['income', 'expense'];
const CATEGORIES = [
  'appointment_fee',
  'medicine_fee',
  'patient_payment',
  'courier',
  'medicine_purchase',
  'salary',
  'rent',
  'utility',
  'office',
  'other',
];

const CATEGORY_LABELS = {
  appointment_fee: 'Appointment Fees',
  medicine_fee: 'Medicine Fees',
  patient_payment: 'Patient Payment',
  courier: 'Courier',
  medicine_purchase: 'Medicine Purchase',
  salary: 'Salary',
  rent: 'Rent',
  utility: 'Utility',
  office: 'Office',
  other: 'Other',
};

const formatEntry = (entry) => ({
  id: entry._id,
  type: entry.type,
  category: entry.category,
  categoryLabel: CATEGORY_LABELS[entry.category] || entry.category,
  amount: entry.amount || 0,
  date: entry.date,
  partyName: entry.partyName || '',
  paymentMode: entry.paymentMode || '',
  referenceNumber: entry.referenceNumber || '',
  notes: entry.notes || '',
  recordedByName: entry.recordedByName || '',
  editedByName: entry.editedByName || '',
  editedAt: entry.editedAt || null,
  createdAt: entry.createdAt,
});

const buildDateRange = ({ filter = 'month', date, month }) => {
  const now = new Date();
  if (filter === 'all') return {};
  if (filter === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) };
  }
  if (filter === 'date' && date) {
    const selected = new Date(`${date}T00:00:00`);
    return {
      from: new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()),
      to: new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 1),
    };
  }
  const monthValue = filter === 'month' && month ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, monthIndex] = String(monthValue).split('-').map(Number);
  if (!year || !monthIndex) return {};
  return { from: new Date(year, monthIndex - 1, 1), to: new Date(year, monthIndex, 1) };
};

const listCourierClinicExpenses = async ({ from, to } = {}) => {
  const patients = await Patient.find({}).select('patientName number stages');
  const expenses = [];

  patients.forEach((patient) => {
    (patient.stages || []).forEach((stage) => {
      const request = stage.medicineRequest || {};
      const courier = request.courier || {};
      if (courier.paymentPaidBy !== 'clinic' || !courier.paymentAmount) return;
      const date = courier.dispatchedAt || request.sentToCourierAt;
      if (!date) return;
      const compare = new Date(date);
      if (from && to && (compare < from || compare >= to)) return;
      expenses.push({
        id: `courier-${patient._id}-${stage.number}`,
        type: 'expense',
        category: 'courier',
        categoryLabel: 'Courier',
        amount: Number(courier.paymentAmount || 0),
        date,
        partyName: patient.patientName,
        paymentMode: courier.paymentMode || '',
        referenceNumber: courier.trackingNumber || '',
        notes: `Stage ${stage.number} courier via ${courier.courierPartner || '-'}`,
        recordedByName: courier.dispatchedByName || request.sentToCourierByName || '',
        editedByName: '',
        editedAt: null,
        createdAt: date,
        source: 'courier',
      });
    });
  });

  return expenses;
};

const getAccountsOverview = asyncHandler(async (req, res) => {
  const range = buildDateRange(req.query);
  const dateFilter = range.from && range.to ? { date: { $gte: range.from, $lt: range.to } } : {};
  const typeFilter = TYPES.includes(req.query.type) ? { type: req.query.type } : {};
  const [manualEntries, courierExpenses] = await Promise.all([
    AccountEntry.find({ ...dateFilter, ...typeFilter }).sort({ date: -1, createdAt: -1 }),
    req.query.type === 'income' ? [] : listCourierClinicExpenses(range),
  ]);

  const manualRows = manualEntries.map((entry) => ({ ...formatEntry(entry), source: 'manual' }));
  const rows = [...manualRows, ...courierExpenses].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const totals = rows.reduce(
    (acc, row) => {
      if (row.type === 'income') acc.income += Number(row.amount || 0);
      if (row.type === 'expense') acc.expense += Number(row.amount || 0);
      if (row.source === 'courier') acc.courierExpense += Number(row.amount || 0);
      acc.byCategory[row.category] = (acc.byCategory[row.category] || 0) + Number(row.amount || 0);
      return acc;
    },
    { income: 0, expense: 0, courierExpense: 0, byCategory: {} }
  );
  totals.balance = totals.income - totals.expense;

  res.status(200).json({
    success: true,
    totals,
    count: rows.length,
    entries: rows,
    categories: CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
  });
});

const createAccountEntry = asyncHandler(async (req, res) => {
  const { type, category = 'other', amount, date, partyName, paymentMode, referenceNumber, notes } = req.body;
  const amountNum = Number(amount);

  if (!TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid account entry type' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Invalid account category' });
  }
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ success: false, message: 'Enter a valid amount' });
  }

  const entry = await AccountEntry.create({
    type,
    category,
    amount: amountNum,
    date: date || new Date(),
    partyName,
    paymentMode,
    referenceNumber,
    notes,
    recordedByName: req.user.name,
  });

  res.status(201).json({ success: true, entry: formatEntry(entry) });
});

const updateAccountEntry = asyncHandler(async (req, res) => {
  const entry = await AccountEntry.findById(req.params.id);
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Account entry not found' });
  }

  const { type, category, amount, date, partyName, paymentMode, referenceNumber, notes } = req.body;
  if (type !== undefined) {
    if (!TYPES.includes(type)) return res.status(400).json({ success: false, message: 'Invalid account entry type' });
    entry.type = type;
  }
  if (category !== undefined) {
    if (!CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: 'Invalid account category' });
    entry.category = category;
  }
  if (amount !== undefined) {
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return res.status(400).json({ success: false, message: 'Enter a valid amount' });
    entry.amount = amountNum;
  }
  if (date !== undefined) entry.date = date || entry.date;
  if (partyName !== undefined) entry.partyName = partyName || '';
  if (paymentMode !== undefined) entry.paymentMode = paymentMode || '';
  if (referenceNumber !== undefined) entry.referenceNumber = referenceNumber || '';
  if (notes !== undefined) entry.notes = notes || '';
  entry.editedByName = req.user.name;
  entry.editedAt = new Date();

  await entry.save();
  res.status(200).json({ success: true, entry: formatEntry(entry) });
});

module.exports = {
  getAccountsOverview,
  createAccountEntry,
  updateAccountEntry,
};
