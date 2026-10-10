const mongoose = require('mongoose');
const HrCounter = require('../models/HrCounter');
const HrEmployee = require('../models/HrEmployee');
const HrLifecycleRecord = require('../models/HrLifecycleRecord');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { dateKeyInIndia } = require('../utils/hrCallUtils');
const { validDateKey } = require('../utils/hrRecruitmentUtils');
const { MODULES, STATUS_MAP, START_STATUS, validModule, canTransition, payrollTotals } = require('../utils/hrLifecycleUtils');

const clean = (value, max = 3000) => String(value ?? '').trim().slice(0, max);
const number = (value) => value === '' || value === undefined || value === null ? null : Number(value);
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const regex = (value) => clean(value, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const prefix = { kpis: 'KPI', performance: 'PRF', appraisals: 'APR', pip: 'PIP', grievances: 'GRV', payroll: 'PAY', exits: 'EXT' };
const labels = { kpis: 'KPI', performance: 'Performance review', appraisals: 'Appraisal', pip: 'Performance improvement plan', grievances: 'Grievance', payroll: 'Payroll', exits: 'Exit' };
const finalStatuses = new Set(['finalized', 'approved', 'paid', 'completed', 'closed']);

const nextCode = async (module) => {
  const year = dateKeyInIndia().slice(0, 4);
  const value = await HrCounter.next(`lifecycle:${module}:${year}`);
  return `HR-${prefix[module]}-${year}-${String(value).padStart(6, '0')}`;
};

const actor = (user) => ({ actor: user._id, actorName: user.name });
const recordJson = (row) => ({
  id: String(row._id), module: row.module, recordCode: row.recordCode, employeeId: String(row.employee), employeeCode: row.employeeCode,
  employeeName: row.employeeName, department: row.department, title: row.title, startDate: row.startDate, endDate: row.endDate,
  status: row.status, data: row.data || {}, confidential: row.confidential, submittedAt: row.submittedAt, decidedAt: row.decidedAt,
  decidedByName: row.decidedByName, decisionNote: row.decisionNote, createdByName: row.createdByName, updatedByName: row.updatedByName,
  createdAt: row.createdAt, updatedAt: row.updatedAt,
  activity: (row.activity || []).slice().reverse().map((entry) => ({ id: String(entry._id), action: entry.action, details: entry.details, actorName: entry.actorName, createdAt: entry.createdAt })),
});

const dataFor = (module, body) => {
  if (module === 'kpis') {
    const weightage = number(body.weightage);
    if (!clean(body.metric, 200) || !clean(body.target, 200) || weightage === null || weightage < 0 || weightage > 100) throw new Error('Metric, target and weightage between 0 and 100 are required');
    return { metric: clean(body.metric, 200), target: clean(body.target, 200), unit: clean(body.unit, 60), weightage };
  }
  if (module === 'performance') {
    const score = number(body.score);
    if (!validDateKey(clean(body.reviewDate, 10)) || !clean(body.reviewer, 150) || score === null || score < 1 || score > 5) throw new Error('Review date, reviewer and score between 1 and 5 are required');
    return { reviewDate: clean(body.reviewDate, 10), reviewer: clean(body.reviewer, 150), score, strengths: clean(body.strengths), improvements: clean(body.improvements), summary: clean(body.summary) };
  }
  if (module === 'appraisals') {
    const currentSalary = number(body.currentSalary), proposedSalary = number(body.proposedSalary);
    if (!validDateKey(clean(body.effectiveDate, 10)) || !clean(body.currentDesignation, 180) || !clean(body.proposedDesignation, 180) || currentSalary === null || proposedSalary === null || currentSalary < 0 || proposedSalary < 0 || !clean(body.reason)) throw new Error('Effective date, designations, salary details and reason are required');
    return { effectiveDate: clean(body.effectiveDate, 10), currentDesignation: clean(body.currentDesignation, 180), proposedDesignation: clean(body.proposedDesignation, 180), currentSalary, proposedSalary, reason: clean(body.reason) };
  }
  if (module === 'pip') {
    if (!clean(body.concern) || !clean(body.expectations) || !clean(body.supportPlan)) throw new Error('Concern, expectations and support plan are required');
    return { concern: clean(body.concern), expectations: clean(body.expectations), supportPlan: clean(body.supportPlan), reviewNotes: clean(body.reviewNotes) };
  }
  if (module === 'grievances') {
    if (!validDateKey(clean(body.incidentDate, 10)) || !clean(body.category, 100) || !clean(body.details)) throw new Error('Incident date, category and grievance details are required');
    return { incidentDate: clean(body.incidentDate, 10), category: clean(body.category, 100), details: clean(body.details), resolution: clean(body.resolution) };
  }
  if (module === 'payroll') {
    const totals = payrollTotals(body);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(clean(body.month, 7)) || !totals) throw new Error('Valid payroll month and non-negative salary values are required');
    return { month: clean(body.month, 7), ...totals, paymentDate: clean(body.paymentDate, 10), reference: clean(body.reference, 180), notes: clean(body.notes) };
  }
  const requestDate = clean(body.requestDate, 10), lastWorkingDate = clean(body.lastWorkingDate, 10), exitType = clean(body.exitType, 40);
  if (!['resignation', 'termination', 'contract_end', 'retirement', 'other'].includes(exitType) || !validDateKey(requestDate) || !validDateKey(lastWorkingDate) || lastWorkingDate < requestDate || !clean(body.reason)) throw new Error('Exit type, valid dates and reason are required');
  return { exitType, requestDate, lastWorkingDate, reason: clean(body.reason), handover: clean(body.handover), clearanceNotes: clean(body.clearanceNotes) };
};

const listRecords = asyncHandler(async (req, res) => {
  const { module } = req.params;
  if (!validModule(module)) return res.status(404).json({ success: false, message: 'HR module not found' });
  const filter = { module };
  if (req.query.status && STATUS_MAP[module].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.employeeId && validId(req.query.employeeId)) filter.employee = req.query.employeeId;
  const search = regex(req.query.search);
  if (search) filter.$or = ['recordCode', 'employeeCode', 'employeeName', 'department', 'title'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  const rows = await HrLifecycleRecord.find(filter).sort({ updatedAt: -1 }).limit(2000).lean();
  res.json({ success: true, records: rows.map(recordJson), statuses: STATUS_MAP[module] });
});

const saveRecord = asyncHandler(async (req, res) => {
  const { module } = req.params;
  if (!validModule(module)) return res.status(404).json({ success: false, message: 'HR module not found' });
  if (!validId(req.body.employeeId) || (req.params.id && !validId(req.params.id))) return res.status(400).json({ success: false, message: 'Select a valid employee and record' });
  const employee = await HrEmployee.findOne({ _id: req.body.employeeId, status: { $in: ['active', 'probation', 'notice_period'] } }).lean();
  if (!employee) return res.status(400).json({ success: false, message: 'Select an active employee' });
  const title = clean(req.body.title, 220), startDate = clean(req.body.startDate, 10), endDate = clean(req.body.endDate, 10);
  if (!title || !validDateKey(startDate, true) || !validDateKey(endDate, true) || (startDate && endDate && endDate < startDate)) return res.status(400).json({ success: false, message: 'Title and valid period dates are required' });
  let data;
  try { data = dataFor(module, req.body); } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
  const payload = { employee: employee._id, employeeCode: employee.employeeCode, employeeName: employee.name, department: employee.department, title, startDate, endDate, data, confidential: module === 'grievances' || module === 'payroll' };
  let row;
  if (req.params.id) {
    row = await HrLifecycleRecord.findOne({ _id: req.params.id, module });
    if (!row) return res.status(404).json({ success: false, message: `${labels[module]} record not found` });
    if (finalStatuses.has(row.status)) return res.status(409).json({ success: false, message: 'Finalized records cannot be edited' });
    if (['appraisals', 'payroll', 'exits'].includes(module) && row.status === 'pending_approval' && req.user.role !== ROLES.ADMIN) return res.status(403).json({ success: false, message: 'Only Admin can edit a record awaiting approval' });
    Object.assign(row, payload, { updatedBy: req.user._id, updatedByName: req.user.name });
    row.activity.push({ action: `${labels[module]} updated`, details: title, ...actor(req.user) });
    await row.save();
  } else {
    if (module === 'payroll' && await HrLifecycleRecord.exists({ module, employee: employee._id, 'data.month': data.month })) return res.status(409).json({ success: false, message: 'Payroll already exists for this employee and month' });
    row = await HrLifecycleRecord.create({ ...payload, module, recordCode: await nextCode(module), status: START_STATUS[module], createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name, activity: [{ action: `${labels[module]} created`, details: title, ...actor(req.user) }] });
  }
  res.status(req.params.id ? 200 : 201).json({ success: true, record: recordJson(row) });
});

const setStatus = asyncHandler(async (req, res) => {
  const { module, id } = req.params;
  if (!validModule(module)) return res.status(404).json({ success: false, message: 'HR module not found' });
  if (!validId(id)) return res.status(404).json({ success: false, message: `${labels[module]} record not found` });
  const row = await HrLifecycleRecord.findOne({ _id: id, module });
  if (!row) return res.status(404).json({ success: false, message: `${labels[module]} record not found` });
  const status = clean(req.body.status, 40), note = clean(req.body.note, 1000);
  if (!canTransition(module, row.status, status, req.user.role)) return res.status(403).json({ success: false, message: 'This status change is not allowed for your role' });
  if (status === 'rejected' && !note) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
  if (module === 'payroll' && status === 'paid' && (!validDateKey(row.data?.paymentDate) || !clean(row.data?.reference, 180))) return res.status(400).json({ success: false, message: 'Payment date and reference are required before marking payroll paid' });
  row.status = status; row.decisionNote = note; row.updatedBy = req.user._id; row.updatedByName = req.user.name;
  if (status === 'pending_approval') row.submittedAt = new Date();
  if (['approved', 'rejected'].includes(status)) { row.decidedAt = new Date(); row.decidedBy = req.user._id; row.decidedByName = req.user.name; }
  row.activity.push({ action: `Status changed to ${status.replaceAll('_', ' ')}`, details: note, ...actor(req.user) });
  await row.save();
  if (module === 'exits' && status === 'completed') await HrEmployee.updateOne({ _id: row.employee }, { $set: { status: 'exited', updatedBy: req.user._id, updatedByName: req.user.name }, $push: { activity: { action: 'Employee exit completed', details: row.recordCode, ...actor(req.user) } } });
  res.json({ success: true, record: recordJson(row) });
});

const summary = asyncHandler(async (req, res) => {
  const grouped = await HrLifecycleRecord.aggregate([{ $group: { _id: { module: '$module', status: '$status' }, count: { $sum: 1 } } }]);
  const result = Object.fromEntries(MODULES.map((module) => [module, { total: 0 }]));
  grouped.forEach(({ _id, count }) => { result[_id.module].total += count; result[_id.module][_id.status] = count; });
  res.json({ success: true, summary: result });
});

const exportReport = asyncHandler(async (req, res) => {
  const module = validModule(req.query.module) ? req.query.module : null;
  const rows = await HrLifecycleRecord.find(module ? { module } : {}).sort({ module: 1, updatedAt: -1 }).lean();
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [['Module', 'Record ID', 'Employee ID', 'Employee', 'Department', 'Title', 'Status', 'Start', 'End', 'Updated by', 'Updated at'].map(quote).join(',')];
  rows.forEach((row) => lines.push([row.module, row.recordCode, row.employeeCode, row.employeeName, row.department, row.title, row.status, row.startDate, row.endDate, row.updatedByName, row.updatedAt?.toISOString()].map(quote).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="HR-Lifecycle-Report-${dateKeyInIndia()}.csv"`);
  res.send(`\uFEFF${lines.join('\n')}`);
});

module.exports = { listRecords, saveRecord, setStatus, summary, exportReport };
