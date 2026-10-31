const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const Management = require('../models/AppointmentManagementEntry');
const { fillReceptionPackage } = require('../utils/receptionPackage');
const purchaseOrder = require('../utils/purchaseOrderRecord');
const { patientInputFromRegistration, assertPurchaseComplete, withBankName, createConvertedPatient, linkConsultationReceipts } = require('../utils/convertPatient');
const { findByCode, summaryOf, visitPhaseOf } = require('../utils/existingPatient');

// The phase picked for the visit this record came from (or the existing patient's next phase).
const visitPhaseFor = async (entry) => {
  const registration = registrationView(entry);
  const existing = registration.existingPatientCode ? await findByCode(registration.existingPatientCode) : null;
  return visitPhaseOf(registration, existing ? await summaryOf(existing) : null);
};
const { registrationView } = require('./receptionFlowController');
const { postCounselingUserRoom, POST_COUNSELING_ALL_ROOM } = require('../realtime/salesSheetSocket');
const { istDate } = require('../utils/receptionFlow');

const ACCESS_ROLES = [ROLES.ADMIN, ROLES.POST_COUNSELOR];
const FOLLOWUP_WRITE_ROLES = [ROLES.ADMIN, ROLES.POST_COUNSELOR];

const formatFollowUp = (entry) => ({
  id: entry._id,
  dateTime: entry.dateTime,
  notes: entry.notes || '',
  status: entry.status || 'scheduled',
  completionDetails: entry.completionDetails || '',
  completedAt: entry.completedAt || null,
  completedByName: entry.completedByName || '',
  createdByName: entry.createdByName || '',
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const formatRow = (row) => ({
  id: row._id,
  patientName: row.patientName,
  parentName: row.parentName || '',
  fatherNumber: row.fatherNumber || '',
  motherNumber: row.motherNumber || '',
  age: row.age || '',
  program: row.program || '',
  reason: row.reason || '',
  followUpDate: row.followUpDate || null,
  notes: row.notes || '',
  followUps: (row.followUps || []).map(formatFollowUp).sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)),
  status: row.status || 'open',
  convertedAt: row.convertedAt || null,
  convertedByName: row.convertedByName || '',
  closedAt: row.closedAt || null,
  closedByName: row.closedByName || '',
  closeReason: row.closeReason || '',
  conversionDetails: row.conversionDetails || '',
  convertedPatientId: row.convertedPatient ? String(row.convertedPatient) : null,
  patientId: row.patientId || '',
  category: row.category || '',
  packageDetails: row.packageDetails || null,
  createdByName: row.createdByName || '',
  updatedByName: row.updatedByName || '',
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const parseDateOnly = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  return new Date(`${text}T00:00:00.000+05:30`);
};

const parseDateTime = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const sameTime = (left, right) => left && right && new Date(left).getTime() === new Date(right).getTime();

const syncNextFollowUpDate = (row) => {
  const pending = [...(row.followUps || [])]
    .filter((entry) => (entry.status || 'scheduled') !== 'completed' && entry.dateTime)
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  row.followUpDate = pending[0]?.dateTime || null;
};

const ensureFollowUpForDate = (row, dateTime, createdByName = '') => {
  if (!dateTime) return;
  const exists = (row.followUps || []).some((entry) => sameTime(entry.dateTime, dateTime));
  if (exists) return;
  row.followUps.push({
    dateTime,
    notes: 'Initial next follow-up',
    createdByName,
  });
};

const getPackageNotBoughtById = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  if (row.followUpDate && !(row.followUps || []).some((entry) => sameTime(entry.dateTime, row.followUpDate))) {
    ensureFollowUpForDate(row, row.followUpDate, row.createdByName || 'System');
    syncNextFollowUpDate(row);
    await row.save();
  }
  res.status(200).json({ success: true, row: formatRow(row) });
});

const listPackageNotBought = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 10 } = req.query;
  // Converted (now patients) and closed (not interested) rows leave the list; the status filter still shows them.
  const status = ['open', 'converted', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'open';
  const filter = status === 'all' ? {} : status === 'open' ? { status: { $nin: ['converted', 'closed'] } } : { status };

  if (search) {
    filter.$or = [
      { patientName: { $regex: search, $options: 'i' } },
      { parentName: { $regex: search, $options: 'i' } },
      { fatherNumber: { $regex: search, $options: 'i' } },
      { motherNumber: { $regex: search, $options: 'i' } },
      { program: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  // Where the open records stand on follow-ups: the strip at the top of the page, and its filter.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const startOfToday = new Date(`${today}T00:00:00.000+05:30`);
  const endOfToday = new Date(`${today}T23:59:59.999+05:30`);
  const open = await PackageNotBoughtPatient.find({ status: { $nin: ['converted', 'closed'] } }).select('followUps').lean();
  const stateOf = (r) => {
    const pending = (r.followUps || []).filter((f) => (f.status || 'scheduled') !== 'completed' && f.dateTime).map((f) => new Date(f.dateTime)).sort((a, b) => a - b);
    if (!pending.length) return 'none';
    if (pending[0] < startOfToday) return 'overdue';
    if (pending[0] <= endOfToday) return 'today';
    return 'upcoming';
  };
  const states = open.map((r) => [String(r._id), stateOf(r)]);
  const summary = { open: open.length, overdue: 0, today: 0, upcoming: 0, noFollowUp: 0 };
  states.forEach(([, st]) => { summary[st === 'none' ? 'noFollowUp' : st] += 1; });
  const followUp = ['overdue', 'today', 'upcoming', 'none'].includes(req.query.followUp) ? req.query.followUp : '';
  if (followUp) filter._id = { $in: states.filter(([, st]) => st === followUp).map(([id]) => id) };

  const [rows, total] = await Promise.all([
    PackageNotBoughtPatient.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    PackageNotBoughtPatient.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    rows: rows.map(formatRow),
    total,
    page: pageNum,
    pages: Math.max(Math.ceil(total / limitNum), 1),
    summary,
  });
});

const createPackageNotBought = asyncHandler(async (req, res) => {
  const { patientName, parentName, fatherNumber, motherNumber, age, program, reason, followUpDate, notes } = req.body;
  const name = String(patientName || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, message: 'Patient name is required' });
  }

  const parsedFollowUpDate = parseDateOnly(followUpDate);
  if (parsedFollowUpDate === undefined) {
    return res.status(400).json({ success: false, message: 'Invalid follow-up date' });
  }

  const row = await PackageNotBoughtPatient.create({
    patientName: name,
    parentName: String(parentName || '').trim(),
    fatherNumber: String(fatherNumber || '').trim(),
    motherNumber: String(motherNumber || '').trim(),
    age: String(age || '').trim(),
    program: String(program || '').trim(),
    reason: String(reason || '').trim(),
    followUpDate: parsedFollowUpDate,
    notes: String(notes || '').trim(),
    createdBy: req.user._id,
    createdByName: req.user.name,
    followUps: parsedFollowUpDate
      ? [{ dateTime: parsedFollowUpDate, notes: 'Initial next follow-up', createdByName: req.user.name }]
      : [],
  });

  res.status(201).json({ success: true, row: formatRow(row) });
});

const updatePackageNotBought = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }

  const fields = ['patientName', 'parentName', 'fatherNumber', 'motherNumber', 'age', 'program', 'reason', 'notes'];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) row[field] = String(req.body[field] || '').trim();
  });
  if (!String(row.patientName || '').trim()) {
    return res.status(400).json({ success: false, message: 'Patient name is required' });
  }
  if (req.body.followUpDate !== undefined) {
    const parsedFollowUpDate = parseDateOnly(req.body.followUpDate);
    if (parsedFollowUpDate === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid follow-up date' });
    }
    ensureFollowUpForDate(row, parsedFollowUpDate, req.user.name);
    syncNextFollowUpDate(row);
  }
  row.updatedByName = req.user.name;
  await row.save();

  res.status(200).json({ success: true, row: formatRow(row) });
});

const addPackageNotBoughtFollowUp = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  if ((row.status || 'open') === 'converted') {
    return res.status(400).json({ success: false, message: 'Converted record cannot receive new follow-ups' });
  }

  const dateTime = parseDateTime(req.body.dateTime);
  if (!dateTime) {
    return res.status(400).json({ success: false, message: 'Follow-up date and time is required' });
  }

  row.followUps.push({
    dateTime,
    notes: String(req.body.notes || '').trim(),
    createdByName: req.user.name,
  });
  syncNextFollowUpDate(row);
  row.updatedByName = req.user.name;
  await row.save();

  res.status(201).json({ success: true, row: formatRow(row) });
});

const completePackageNotBoughtFollowUp = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }

  const followUp = row.followUps.id(req.params.followUpId);
  if (!followUp) {
    return res.status(404).json({ success: false, message: 'Follow-up not found' });
  }
  const completionNote = String(req.body.completionDetails || '').trim();
  if (!completionNote) {
    return res.status(400).json({ success: false, message: 'Completion note is required' });
  }

  followUp.status = 'completed';
  followUp.completionDetails = completionNote;
  followUp.completedAt = new Date();
  followUp.completedByName = req.user.name;
  syncNextFollowUpDate(row);
  row.updatedByName = req.user.name;
  await row.save();

  res.status(200).json({ success: true, row: formatRow(row) });
});

// The patient's details for a Package Not Bought record. A record that came from post-counselling uses its registration;
// an older, hand-made record falls back to what it holds (plus anything typed in `body`).
const patientDetailsFor = (row, entry, body = {}, user = {}) => {
  if (entry?.registration?.fields) return patientInputFromRegistration(registrationView(entry), body);
  const profile = row.profile || {};
  return {
    ...profile, ...body,
    patientCode: String(body.patientCode || row.patientId || '').trim(),
    category: body.category || row.category || '',
    patientName: String(body.patientName || row.patientName || '').trim(),
    age: body.age ?? row.age,
    number: String(body.number || row.fatherNumber || '').trim(),
    alternateNumber: body.alternateNumber ?? row.motherNumber,
    guardianName: String(body.guardianName || row.parentName || '').trim(),
    postCounselor: body.postCounselor || (user.role === ROLES.POST_COUNSELOR ? String(user._id) : undefined),
  };
};
// What is still missing for a patient to be created, so only that is asked for on the PO paper step.
const missingPatientFields = (details) => {
  const missing = [];
  if (!String(details.patientCode || '').trim()) missing.push('patientCode');
  if (!details.category) missing.push('category');
  if (!String(details.age ?? '').trim()) missing.push('age');
  if (!String(details.number || '').trim()) missing.push('number');
  if (details.category !== 'mental_health' && !String(details.guardianName || '').trim()) missing.push('guardianName');
  return missing;
};

// What the PO paper needs to open: the approved fee (from the package that was offered), the contacts and the prefilled values.
const purchaseFormData = async (row, user) => {
  const entry = row.sourceEntry ? await Management.findById(row.sourceEntry) : null;
  const registration = entry
    ? registrationView(entry).fields
    : { fatherName: row.parentName || '', fatherNumber: row.fatherNumber || '', motherNumber: row.motherNumber || '', category: row.category || '', patientName: row.patientName };
  const record = entry?.postCounseling?.record || { e: { paymentPlan: row.packageDetails?.paymentPlan || '' } };
  // A returning patient (Sales marked the visit Existing) buys their next phase.
  const phase = entry ? await visitPhaseFor(entry) : 1;
  const values = purchaseOrder.defaults({ record, registration, counselorName: user.name, today: istDate(), phase });
  const fee = Number(row.packageDetails?.approvedProgramFee || 0);
  return { entry, registration, values, fee };
};

// @route GET /api/package-not-bought/:id/purchase-form
const getPurchaseForm = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Record not found' });
  const { entry, registration, values, fee } = await purchaseFormData(row, req.user);
  const details = patientDetailsFor(row, entry, {}, req.user);
  res.json({
    success: true, definitions: purchaseOrder.definitions(), values, fee, feeKnown: fee > 0,
    needs: missingPatientFields(details),
    prefill: { patientCode: details.patientCode || '', category: details.category || '', age: String(details.age ?? ''), number: details.number || '', guardianName: details.guardianName || '' },
    registration: { fatherNumber: registration.fatherNumber || '', motherNumber: registration.motherNumber || '' },
  });
});

// Converting a Package Not Bought record creates the patient (pending accounts approval, like "Add patient") and links it.
// The whole PO paper has to be filled in first (PO number, payment mode and the payment details); the payment details go
// to Phase 1 and a PO number starts In Transit. The record is claimed first, so pressing the button twice can never
// create two patients.
const markPackageNotBoughtConverted = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  if ((row.status || 'open') === 'converted') {
    return res.status(400).json({ success: false, message: 'This record is already converted' });
  }
  const input = req.body || {};
  const entry = row.sourceEntry ? await Management.findById(row.sourceEntry) : null;
  const details = patientDetailsFor(row, entry, input, req.user);
  const missing = missingPatientFields(details);
  if (missing.length) return res.status(400).json({ success: false, message: `These are needed to create the patient: ${missing.join(', ')}` });

  const fee = Number(row.packageDetails?.approvedProgramFee || 0) || Number(String(input.approvedProgramFee ?? '').replace(/,/g, '')) || 0;
  if (!(fee > 0)) return res.status(400).json({ success: false, message: 'Enter the approved program fee' });
  const cleaned = purchaseOrder.cleanPurchase(input.purchase, fee);
  assertPurchaseComplete(cleaned.values);
  cleaned.values = await withBankName(cleaned.values);

  const claimed = await PackageNotBoughtPatient.findOneAndUpdate(
    { _id: row._id, status: { $ne: 'converted' } },
    { $set: { status: 'converted', convertedAt: new Date(), convertedByName: req.user.name, conversionDetails: String(input.conversionDetails || '').trim(), updatedByName: req.user.name } },
    { new: true },
  );
  if (!claimed) return res.status(400).json({ success: false, message: 'This record is already converted' });

  let created;
  try {
    created = await createConvertedPatient({
      input: details, fee, values: cleaned.values, totals: cleaned.totals, source: 'package_not_bought', user: req.user,
      existingPatientCode: entry ? registrationView(entry).existingPatientCode : '',
      phase: entry ? await visitPhaseFor(entry) : 1,
      activityDetails: `Converted from Package Not Bought by ${req.user.name} — pending accounts approval`,
    });
  } catch (error) {
    await PackageNotBoughtPatient.updateOne({ _id: row._id }, { $set: { status: 'open', convertedAt: null, convertedByName: '', conversionDetails: row.conversionDetails || '', convertedPatient: null } });
    throw error;
  }
  claimed.convertedPatient = created.patient._id;
  claimed.packageDetails = { ...(claimed.packageDetails || {}), approvedProgramFee: fee, amountReceivedNow: Number(cleaned.values.amountReceivedNow || 0), mode: cleaned.values.mode || '', poNo: created.poNumber, outstandingBalance: cleaned.totals.outstandingBalance };
  await claimed.save();

  // If it came from post-counselling, that record becomes "converted" too and keeps the PO paper, so Post Counseling Done has everything.
  if (row.sourceEntry) {
    if (entry) {
      await Management.updateOne({ _id: entry._id }, { $set: {
        'postCounseling.outcome.kind': 'converted', 'postCounseling.outcome.at': new Date(), 'postCounseling.outcome.byName': req.user.name, 'postCounseling.outcome.patient': created.patient._id,
        'postCounseling.purchase': { values: created.values, totals: cleaned.totals, savedAt: new Date(), savedByName: req.user.name },
      } });
      await linkConsultationReceipts(entry, created.patient);
      await fillReceptionPackage(entry._id);
      req.app?.get?.('io')?.to(postCounselingUserRoom(entry.registration?.postCounselor)).to(POST_COUNSELING_ALL_ROOM).emit('post-counseling:changed', { id: String(entry._id) });
    }
  }

  res.status(200).json({ success: true, row: formatRow(claimed), patientId: String(created.patient._id), inTransit: created.inTransit, poNumber: created.poNumber });
});

// @route PATCH /api/package-not-bought/:id/close   body: { reason }
// The family is not interested: the record is closed (kept for reference), leaves the open list and can be reopened.
const closePackageNotBought = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Record not found' });
  if (row.status === 'converted') return res.status(400).json({ success: false, message: 'This patient was converted; nothing to close' });
  if (row.status === 'closed') return res.status(409).json({ success: false, message: 'Already closed' });
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!reason) return res.status(400).json({ success: false, message: 'Write why this is closed (e.g. not interested)' });
  Object.assign(row, { status: 'closed', closedAt: new Date(), closedByName: req.user.name, closeReason: reason });
  await row.save();
  res.status(200).json({ success: true, row: formatRow(row) });
});

// @route PATCH /api/package-not-bought/:id/reopen
const reopenPackageNotBought = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Record not found' });
  if (row.status !== 'closed') return res.status(400).json({ success: false, message: 'Only a closed record can be reopened' });
  Object.assign(row, { status: 'open', closedAt: null, closedByName: '', closeReason: '' });
  await row.save();
  res.status(200).json({ success: true, row: formatRow(row) });
});

const deletePackageNotBought = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: 'Only Admin can delete records' });
  }
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  await row.deleteOne();
  res.status(200).json({ success: true });
});

module.exports = {
  ACCESS_ROLES,
  FOLLOWUP_WRITE_ROLES,
  listPackageNotBought,
  getPackageNotBoughtById,
  createPackageNotBought,
  updatePackageNotBought,
  closePackageNotBought,
  reopenPackageNotBought,
  addPackageNotBoughtFollowUp,
  completePackageNotBoughtFollowUp,
  markPackageNotBoughtConverted,
  getPurchaseForm,
  deletePackageNotBought,
};
