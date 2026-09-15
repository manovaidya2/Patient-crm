const BankAccount = require('../models/BankAccount');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const BANK_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR];

const formatBank = (bank) => ({
  id: bank._id,
  name: bank.name,
  displayName: bank.displayName || '',
  accountNumber: bank.accountNumber || '',
  ifsc: bank.ifsc || '',
  branch: bank.branch || '',
  notes: bank.notes || '',
  isActive: bank.isActive !== false,
  createdByName: bank.createdByName || '',
  updatedByName: bank.updatedByName || '',
  createdAt: bank.createdAt,
  updatedAt: bank.updatedAt,
});

const listBanks = asyncHandler(async (req, res) => {
  const filter = req.query.active === 'true' ? { isActive: true } : {};
  const banks = await BankAccount.find(filter).sort({ isActive: -1, name: 1 }).lean();
  res.status(200).json({ success: true, banks: banks.map(formatBank) });
});

const createBank = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: 'Only Admin can add banks' });
  }
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, message: 'Bank name is required' });
  }

  const bank = await BankAccount.create({
    name,
    displayName: String(req.body.displayName || '').trim(),
    accountNumber: String(req.body.accountNumber || '').trim(),
    ifsc: String(req.body.ifsc || '').trim().toUpperCase(),
    branch: String(req.body.branch || '').trim(),
    notes: String(req.body.notes || '').trim(),
    isActive: req.body.isActive !== false,
    createdByName: req.user.name,
  });

  res.status(201).json({ success: true, bank: formatBank(bank) });
});

const updateBank = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: 'Only Admin can update banks' });
  }
  const bank = await BankAccount.findById(req.params.id);
  if (!bank) {
    return res.status(404).json({ success: false, message: 'Bank not found' });
  }

  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Bank name is required' });
    bank.name = name;
  }
  if (req.body.displayName !== undefined) bank.displayName = String(req.body.displayName || '').trim();
  if (req.body.accountNumber !== undefined) bank.accountNumber = String(req.body.accountNumber || '').trim();
  if (req.body.ifsc !== undefined) bank.ifsc = String(req.body.ifsc || '').trim().toUpperCase();
  if (req.body.branch !== undefined) bank.branch = String(req.body.branch || '').trim();
  if (req.body.notes !== undefined) bank.notes = String(req.body.notes || '').trim();
  if (req.body.isActive !== undefined) bank.isActive = Boolean(req.body.isActive);
  bank.updatedByName = req.user.name;
  await bank.save();

  res.status(200).json({ success: true, bank: formatBank(bank) });
});

const lookupIfsc = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Enter a valid 11-character IFSC code' });
  }

  let response;
  try {
    response = await fetch(`https://ifsc.razorpay.com/${code}`);
  } catch (err) {
    return res.status(502).json({ success: false, message: 'Could not reach IFSC lookup service' });
  }

  if (!response.ok) {
    return res.status(404).json({ success: false, message: 'No bank found for this IFSC code' });
  }

  const data = await response.json();
  res.status(200).json({
    success: true,
    bank: {
      bankName: data.BANK || '',
      branch: data.BRANCH || '',
      address: data.ADDRESS || '',
      city: data.CITY || '',
      state: data.STATE || '',
    },
  });
});

module.exports = {
  BANK_ACCESS_ROLES,
  listBanks,
  createBank,
  updateBank,
  lookupIfsc,
};
