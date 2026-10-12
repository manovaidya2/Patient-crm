const mongoose = require('mongoose');
const HrWorksheetEntry = require('../models/HrWorksheetEntry');
const HrEmployee = require('../models/HrEmployee');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { validDateKey } = require('../utils/hrRecruitmentUtils');

const DEPARTMENTS = ['hr', 'recruitment', 'payroll', 'admin', 'operations', 'other'];
const STATUSES = ['completed', 'in_progress', 'pending', 'delayed', 'blocked'];

const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const regex = (value) => clean(value, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serialize = (row) => ({
  id: String(row._id), date: row.date, scope: row.scope, employeeId: row.employee ? String(row.employee) : '', employeeCode: row.employeeCode, hrEmployee: row.hrEmployee, department: row.department, task: row.task, dailyTarget: row.dailyTarget,
  actualOutput: row.actualOutput, workStatus: row.workStatus, delayIssue: row.delayIssue, evidence: row.evidence, nextAction: row.nextAction,
  createdByName: row.createdByName, updatedByName: row.updatedByName, createdAt: row.createdAt, updatedAt: row.updatedAt,
});

const listEntries = asyncHandler(async (req, res) => {
  const filter = {};
  const search = regex(req.query.search);
  if (search) filter.$or = ['hrEmployee', 'task', 'delayIssue', 'evidence', 'nextAction'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  filter.scope = req.query.scope === 'self' ? 'self' : 'employee';
  if (filter.scope === 'self' && req.user.role !== ROLES.ADMIN) filter.createdBy = req.user._id;
  if (req.query.employeeId &&mongoose.Types.ObjectId.isValid(req.query.employeeId)) filter.employee = req.query.employeeId;
  if (DEPARTMENTS.includes(req.query.department)) filter.department = req.query.department;
  if (STATUSES.includes(req.query.workStatus)) filter.workStatus = req.query.workStatus;
  if (req.query.from && validDateKey(req.query.from)) filter.date = { ...filter.date, $gte: req.query.from };
  if (req.query.to && validDateKey(req.query.to)) filter.date = { ...filter.date, $lte: req.query.to };
  const rows = await HrWorksheetEntry.find(filter).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
  const count = (status) => rows.filter((row) => row.workStatus === status).length;
  res.json({
    success: true, entries: rows.map(serialize),
    summary: { total: rows.length, completed: count('completed'), inProgress: count('in_progress'), pending: count('pending'), delayed: count('delayed') + count('blocked') },
  });
});

const saveEntry = asyncHandler(async (req, res) => {
  const payload = {
    date: clean(req.body.date, 10), hrEmployee: '', department: clean(req.body.department, 20) || 'hr', task: clean(req.body.task, 500),
    dailyTarget: clean(req.body.dailyTarget, 300), actualOutput: clean(req.body.actualOutput, 300), workStatus: clean(req.body.workStatus, 20) || 'completed',
    delayIssue: clean(req.body.delayIssue, 1000), evidence: clean(req.body.evidence, 500), nextAction: clean(req.body.nextAction, 500),
  };
  if (!validDateKey(payload.date) || !payload.task) return res.status(400).json({ success: false, message: 'Date and work / task are required' });
  if (req.body.scope === 'self') {
    payload.scope = 'self'; payload.employee = null; payload.employeeCode = ''; payload.hrEmployee = req.user.name;
  } else {
    if (!mongoose.Types.ObjectId.isValid(req.body.employeeId)) return res.status(400).json({ success: false, message: 'Select an employee' });
    const employee = await HrEmployee.findById(req.body.employeeId).select('name employeeCode').lean();
    if (!employee) return res.status(400).json({ success: false, message: 'Employee not found' });
    payload.scope = 'employee'; payload.employee = employee._id; payload.employeeCode = employee.employeeCode; payload.hrEmployee = employee.name;
  }
  if (!DEPARTMENTS.includes(payload.department) || !STATUSES.includes(payload.workStatus)) return res.status(400).json({ success: false, message: 'Select a valid department and work status' });
  let row;
  if (req.params.id) {
    row = await HrWorksheetEntry.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Worksheet entry not found' });
    if (req.user.role !== ROLES.ADMIN && String(row.createdBy) !== String(req.user._id)) return res.status(403).json({ success: false, message: 'You can only edit your own entries' });
    if (row.scope === 'self') { payload.scope = 'self'; payload.hrEmployee = row.hrEmployee; }
    Object.assign(row, payload);
  } else {
    row = new HrWorksheetEntry({ ...payload, createdBy: req.user._id, createdByName: req.user.name });
  }
  row.updatedBy = req.user._id; row.updatedByName = req.user.name;
  await row.save();
  res.status(req.params.id ? 200 : 201).json({ success: true, entry: serialize(row) });
});

const deleteEntry = asyncHandler(async (req, res) => {
  const row = await HrWorksheetEntry.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Worksheet entry not found' });
  res.json({ success: true });
});

module.exports = { listEntries, saveEntry, deleteEntry };
