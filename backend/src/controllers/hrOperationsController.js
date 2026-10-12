const mongoose = require('mongoose');
const HrCounter = require('../models/HrCounter');
const HrEmployee = require('../models/HrEmployee');
const HrAttendance = require('../models/HrAttendance');
const HrLeaveRequest = require('../models/HrLeaveRequest');
const HrHoliday = require('../models/HrHoliday');
const HrTraining = require('../models/HrTraining');
const HrPolicy = require('../models/HrPolicy');
const HrOnboarding = require('../models/HrOnboarding');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, hasHrFullAccess } = require('../constants/roles');
const { dateKeyInIndia } = require('../utils/hrCallUtils');
const { validDateKey, splitList } = require('../utils/hrRecruitmentUtils');
const { inclusiveDays, timeMinutes, workedMinutes, canChangePolicyStatus, canChangeLeaveStatus } = require('../utils/hrOperationsUtils');
const { deleteEmployeeCascade } = require('../utils/hrAdminDeleteUtils');
const { normalizeEmployeeName, normalizeEmployeePhone, sameEmployeeIdentity } = require('../utils/hrEmployeeIdentity');

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'consultant'];
const EMPLOYEE_STATUSES = ['active', 'probation', 'notice_period', 'inactive', 'exited'];
const TRAINING_MODES = ['in_person', 'online', 'hybrid'];
const TRAINING_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

const clean = (value, max = 3000) => String(value || '').trim().slice(0, max);
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const actor = (user) => ({ actor: user._id, actorName: user.name });
const updateActor = (row, user) => { row.updatedBy = user._id; row.updatedByName = user.name; };
const nextCode = async (prefix, key) => {
  const year = dateKeyInIndia().slice(0, 4);
  const value = await HrCounter.next(`${key}:${year}`);
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
};
const regex = (value) => clean(value, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const searchFilter = (query, fields) => {
  const value = regex(query.search);
  return value ? { $or: fields.map((field) => ({ [field]: { $regex: value, $options: 'i' } })) } : {};
};
const common = (row, code) => ({
  id: String(row._id), ...(code ? { [code]: row[code] } : {}), status: row.status,
  createdByName: row.createdByName, updatedByName: row.updatedByName, createdAt: row.createdAt, updatedAt: row.updatedAt,
});

const serializeEmployee = (row) => ({
  ...common(row, 'employeeCode'), name: row.name, email: row.email, phone: row.phone, emergencyContact: row.emergencyContact,
  department: row.department, designation: row.designation, employmentType: row.employmentType, joiningDate: row.joiningDate,
  workLocation: row.workLocation, reportingManager: row.reportingManager, probationEndDate: row.probationEndDate,
  address: row.address, notes: row.notes, onboardingId: row.onboarding ? String(row.onboarding) : '', candidateId: row.candidate ? String(row.candidate) : '',
  activity: (row.activity || []).slice().reverse().map((entry) => ({ id: String(entry._id), action: entry.action, details: entry.details, actorName: entry.actorName, createdAt: entry.createdAt })),
});

const listEmployees = asyncHandler(async (req, res) => {
  const filter = searchFilter(req.query, ['employeeCode', 'name', 'email', 'phone', 'department', 'designation']);
  if (req.query.operational === 'true') filter.status = { $in: ['active', 'probation', 'notice_period'] };
  else if (req.query.status) filter.status = req.query.status;
  if (req.query.department) filter.department = clean(req.query.department, 120);
  const rows = await HrEmployee.find(filter).sort({ status: 1, name: 1 }).limit(1000).lean();
  res.json({ success: true, employees: rows.map(serializeEmployee) });
});

const availableOnboarding = asyncHandler(async (req, res) => {
  const used = await HrEmployee.distinct('onboarding', { onboarding: { $ne: null } });
  const rows = await HrOnboarding.find({ status: 'completed', _id: { $nin: used } }).populate('candidate', 'phone email').sort({ completedAt: -1 }).lean();
  res.json({ success: true, onboardings: rows.map((row) => ({ id: String(row._id), candidateId: String(row.candidate?._id || row.candidate), candidateName: row.candidateName, phone: row.candidate?.phone || '', email: row.candidate?.email || '', designation: row.designation, department: row.department, joiningDate: row.joiningDate, reportingManager: row.reportingManager, workLocation: row.workLocation, onboardingCode: row.onboardingCode })) });
});

const saveEmployee = asyncHandler(async (req, res) => {
  const payload = {
    name: clean(req.body.name, 150), email: clean(req.body.email, 180).toLowerCase(), phone: clean(req.body.phone, 30), emergencyContact: clean(req.body.emergencyContact, 100),
    department: clean(req.body.department, 120), designation: clean(req.body.designation, 180), employmentType: clean(req.body.employmentType, 30) || 'full_time',
    joiningDate: clean(req.body.joiningDate, 10), workLocation: clean(req.body.workLocation, 180), reportingManager: clean(req.body.reportingManager, 180),
    probationEndDate: clean(req.body.probationEndDate, 10), status: clean(req.body.status, 30) || 'active', address: clean(req.body.address, 1000), notes: clean(req.body.notes, 3000),
  };
  payload.nameKey = normalizeEmployeeName(payload.name); payload.phoneKey = normalizeEmployeePhone(payload.phone);
  if (!payload.name || payload.phoneKey.length < 7 || !payload.department || !payload.designation || !validDateKey(payload.joiningDate) || !validDateKey(payload.probationEndDate, true)) return res.status(400).json({ success: false, message: 'Name, phone number, department, designation and a valid joining date are required' });
  if (!EMPLOYMENT_TYPES.includes(payload.employmentType) || !EMPLOYEE_STATUSES.includes(payload.status)) return res.status(400).json({ success: false, message: 'Select a valid employment type and employee status' });
  if (payload.probationEndDate && payload.probationEndDate < payload.joiningDate) return res.status(400).json({ success: false, message: 'Probation end cannot be before joining date' });
  const possibleDuplicates = await HrEmployee.find({ _id: { $ne: req.params.id || new mongoose.Types.ObjectId() } }).select('name phone +nameKey +phoneKey').lean();
  if (possibleDuplicates.some((item) => sameEmployeeIdentity(item, payload))) return res.status(409).json({ success: false, message: 'An employee with this name and phone number already exists' });
  let onboarding = null;
  if (req.body.onboardingId) {
    if (!validId(req.body.onboardingId)) return res.status(400).json({ success: false, message: 'Invalid onboarding record' });
    onboarding = await HrOnboarding.findOne({ _id: req.body.onboardingId, status: 'completed' }).lean();
    if (!onboarding) return res.status(400).json({ success: false, message: 'Select a completed onboarding record' });
  }
  let row;
  if (req.params.id) {
    row = await HrEmployee.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Employee not found' });
    Object.assign(row, payload); updateActor(row, req.user); row.activity.push({ action: 'Employee profile updated', details: `${payload.designation}, ${payload.department}`, ...actor(req.user) }); await row.save();
  } else {
    if (onboarding && await HrEmployee.exists({ onboarding: onboarding._id })) return res.status(409).json({ success: false, message: 'Employee record already exists for this onboarding' });
    row = await HrEmployee.create({ ...payload, employeeCode: await nextCode('HR-EMP', 'employee'), onboarding: onboarding?._id || null, candidate: onboarding?.candidate || null, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name, activity: [{ action: 'Employee record created', details: payload.designation, ...actor(req.user) }] });
  }
  res.status(req.params.id ? 200 : 201).json({ success: true, employee: serializeEmployee(row) });
});

const deleteEmployee = asyncHandler(async (req, res) => {
  const row = await HrEmployee.findById(req.params.id).select('employeeCode name').lean();
  if (!row) return res.status(404).json({ success: false, message: 'Employee not found' });
  const deleted = await deleteEmployeeCascade(row._id);
  res.json({ success: true, message: `${row.employeeCode} - ${row.name} and linked HR records deleted`, deleted });
});

const listAttendance = asyncHandler(async (req, res) => {
  const filter = searchFilter(req.query, ['employeeCode', 'employeeName', 'department']);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.employeeId && validId(req.query.employeeId)) filter.employee = req.query.employeeId;
  if (req.query.from || req.query.to) filter.date = { ...(req.query.from ? { $gte: clean(req.query.from, 10) } : {}), ...(req.query.to ? { $lte: clean(req.query.to, 10) } : {}) };
  const rows = await HrAttendance.find(filter).sort({ date: -1, employeeName: 1 }).limit(2000).lean();
  const summary = rows.reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
  res.json({ success: true, attendance: rows.map((row) => ({ ...common(row), employeeId: String(row.employee), employeeCode: row.employeeCode, employeeName: row.employeeName, department: row.department, date: row.date, status: row.status, checkIn: row.checkIn, checkOut: row.checkOut, workedMinutes: row.workedMinutes, notes: row.notes })), summary });
});

const saveAttendance = asyncHandler(async (req, res) => {
  const employeeFilter = { _id: req.body.employeeId };
  if (!(hasHrFullAccess(req.user.role) && req.params.id)) employeeFilter.status = { $in: ['active', 'probation', 'notice_period'] };
  const employee = await HrEmployee.findOne(employeeFilter).lean();
  if (!employee) return res.status(400).json({ success: false, message: 'Select an active employee' });
  const date = clean(req.body.date, 10), status = clean(req.body.status, 30), checkIn = clean(req.body.checkIn, 5), checkOut = clean(req.body.checkOut, 5);
  if (!validDateKey(date) || !['present', 'absent', 'half_day', 'short_day', 'leave', 'holiday', 'work_from_home'].includes(status)) return res.status(400).json({ success: false, message: 'Valid attendance date and status are required' });
  if ((checkIn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkIn)) || (checkOut && !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkOut))) return res.status(400).json({ success: false, message: 'Enter valid check-in and check-out times' });
  if (checkIn && checkOut && timeMinutes(checkOut) < timeMinutes(checkIn)) return res.status(400).json({ success: false, message: 'Check-out cannot be before check-in' });
  const payload = { employee: employee._id, employeeCode: employee.employeeCode, employeeName: employee.name, department: employee.department, date, status, checkIn, checkOut, workedMinutes: workedMinutes(checkIn, checkOut), notes: clean(req.body.notes, 1000) };
  let row;
  if (req.params.id) { row = await HrAttendance.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Attendance record not found' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else {
    if (await HrAttendance.exists({ employee: employee._id, date })) return res.status(409).json({ success: false, message: 'Attendance is already recorded for this employee and date' });
    row = await HrAttendance.create({ ...payload, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
  }
  res.status(req.params.id ? 200 : 201).json({ success: true, attendance: row });
});

const listLeaves = asyncHandler(async (req, res) => {
  const filter = searchFilter(req.query, ['leaveCode', 'employeeCode', 'employeeName', 'department', 'reason']);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.employeeId && validId(req.query.employeeId)) filter.employee = req.query.employeeId;
  const rows = await HrLeaveRequest.find(filter).sort({ startDate: -1 }).limit(1000).lean();
  res.json({ success: true, leaves: rows.map((row) => ({ ...common(row, 'leaveCode'), employeeId: String(row.employee), employeeCode: row.employeeCode, employeeName: row.employeeName, department: row.department, leaveType: row.leaveType, startDate: row.startDate, endDate: row.endDate, days: row.days, halfDay: row.halfDay, reason: row.reason, decisionNote: row.decisionNote, decidedByName: row.decidedByName, decidedAt: row.decidedAt })) });
});

const saveLeave = asyncHandler(async (req, res) => {
  if (![ROLES.HR, ROLES.ADMIN, ROLES.DOCTOR].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only HR, Admin or Doctor can add or edit leave requests' });
  const employeeFilter = { _id: req.body.employeeId };
  if (!(hasHrFullAccess(req.user.role) && req.params.id)) employeeFilter.status = { $in: ['active', 'probation', 'notice_period'] };
  const employee = await HrEmployee.findOne(employeeFilter).lean();
  if (!employee) return res.status(400).json({ success: false, message: 'Select an active employee' });
  const startDate = clean(req.body.startDate, 10), endDate = clean(req.body.endDate, 10), halfDay = req.body.halfDay === true || req.body.halfDay === 'true';
  if (!validDateKey(startDate) || !validDateKey(endDate) || endDate < startDate) return res.status(400).json({ success: false, message: 'Enter a valid leave date range' });
  const leaveType = clean(req.body.leaveType, 30), reason = clean(req.body.reason, 3000);
  if (!['casual', 'sick', 'earned', 'unpaid', 'maternity', 'paternity', 'other'].includes(leaveType) || !reason) return res.status(400).json({ success: false, message: 'Leave type and reason are required' });
  if (halfDay && startDate !== endDate) return res.status(400).json({ success: false, message: 'Half-day leave must use the same start and end date' });
  const overlap = await HrLeaveRequest.exists({ _id: { $ne: req.params.id || new mongoose.Types.ObjectId() }, employee: employee._id, status: { $in: ['pending', 'approved'] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } });
  if (overlap) return res.status(409).json({ success: false, message: 'An active leave request already overlaps these dates' });
  const payload = { employee: employee._id, employeeCode: employee.employeeCode, employeeName: employee.name, department: employee.department, leaveType, startDate, endDate, days: halfDay ? 0.5 : inclusiveDays(startDate, endDate), halfDay, reason };
  let row;
  if (req.params.id) { row = await HrLeaveRequest.findOne(hasHrFullAccess(req.user.role) ? { _id: req.params.id } : { _id: req.params.id, status: 'pending' }); if (!row) return res.status(409).json({ success: false, message: 'Only pending leave requests can be edited by HR' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else row = await HrLeaveRequest.create({ ...payload, leaveCode: await nextCode('HR-LVE', 'leave'), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
  res.status(req.params.id ? 200 : 201).json({ success: true, leave: row });
});

const leaveStatus = asyncHandler(async (req, res) => {
  const row = await HrLeaveRequest.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Leave request not found' });
  const status = clean(req.body.status, 20), note = clean(req.body.note, 1000);
  if (!canChangeLeaveStatus(row.status, status, req.user.role)) return res.status(req.user.role === ROLES.HR ? 409 : 403).json({ success: false, message: 'Only HR can approve, reject or cancel a pending leave request' });
  if (status === 'rejected' && !note) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
  row.status = status; row.decisionNote = note; row.decidedBy = req.user._id; row.decidedByName = req.user.name; row.decidedAt = new Date(); updateActor(row, req.user); await row.save();
  res.json({ success: true, leave: row });
});

const listHolidays = asyncHandler(async (req, res) => {
  const filter = searchFilter(req.query, ['name', 'description']); if (req.query.type) filter.type = req.query.type;
  const rows = await HrHoliday.find(filter).sort({ date: 1 }).limit(1000).lean();
  res.json({ success: true, holidays: rows.map((row) => ({ ...common(row), name: row.name, date: row.date, type: row.type, description: row.description, isActive: row.isActive })) });
});

const saveHoliday = asyncHandler(async (req, res) => {
  const payload = { name: clean(req.body.name, 180), date: clean(req.body.date, 10), type: clean(req.body.type, 30) || 'company', description: clean(req.body.description, 1000), isActive: req.body.isActive !== false };
  if (!payload.name || !validDateKey(payload.date) || !['national', 'company', 'restricted'].includes(payload.type)) return res.status(400).json({ success: false, message: 'Holiday name, date and type are required' });
  let row;
  if (req.params.id) { row = await HrHoliday.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Holiday not found' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else { if (await HrHoliday.exists({ date: payload.date })) return res.status(409).json({ success: false, message: 'A holiday already exists on this date' }); row = await HrHoliday.create({ ...payload, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name }); }
  res.status(req.params.id ? 200 : 201).json({ success: true, holiday: row });
});

const listTraining = asyncHandler(async (req, res) => {
  const filter = searchFilter(req.query, ['trainingCode', 'title', 'category', 'trainer']); if (req.query.status) filter.status = req.query.status;
  const rows = await HrTraining.find(filter).sort({ startDate: -1 }).limit(1000).lean();
  res.json({ success: true, trainings: rows.map((row) => ({ ...common(row, 'trainingCode'), title: row.title, category: row.category, trainer: row.trainer, startDate: row.startDate, endDate: row.endDate, mode: row.mode, locationOrLink: row.locationOrLink, objectives: row.objectives, notes: row.notes, participants: row.participants.map((item) => ({ employeeId: String(item.employee), employeeCode: item.employeeCode, employeeName: item.employeeName, status: item.status })) })) });
});

const saveTraining = asyncHandler(async (req, res) => {
  const employeeIds = splitList(req.body.employeeIds, 500).filter(validId);
  const employeeFilter = { _id: { $in: employeeIds } };
  if (!(hasHrFullAccess(req.user.role) && req.params.id)) employeeFilter.status = { $in: ['active', 'probation', 'notice_period'] };
  const employees = await HrEmployee.find(employeeFilter).lean();
  if (employees.length !== new Set(employeeIds).size) return res.status(400).json({ success: false, message: 'Select valid active employees' });
  const payload = { title: clean(req.body.title, 200), category: clean(req.body.category, 120), trainer: clean(req.body.trainer, 180), startDate: clean(req.body.startDate, 10), endDate: clean(req.body.endDate, 10), mode: clean(req.body.mode, 30) || 'in_person', locationOrLink: clean(req.body.locationOrLink, 1000), status: clean(req.body.status, 30) || 'planned', objectives: clean(req.body.objectives, 3000), notes: clean(req.body.notes, 3000), participants: employees.map((employee) => ({ employee: employee._id, employeeCode: employee.employeeCode, employeeName: employee.name })) };
  if (!payload.title || !payload.category || !payload.trainer || !validDateKey(payload.startDate) || !validDateKey(payload.endDate) || payload.endDate < payload.startDate || !payload.participants.length) return res.status(400).json({ success: false, message: 'Training details, valid dates and at least one participant are required' });
  if (!TRAINING_MODES.includes(payload.mode) || !TRAINING_STATUSES.includes(payload.status)) return res.status(400).json({ success: false, message: 'Select a valid training mode and status' });
  let row;
  if (req.params.id) { row = await HrTraining.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Training not found' }); const oldStatuses = new Map(row.participants.map((item) => [String(item.employee), item.status])); payload.participants.forEach((item) => { item.status = oldStatuses.get(String(item.employee)) || 'assigned'; }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else row = await HrTraining.create({ ...payload, trainingCode: await nextCode('HR-TRN', 'training'), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
  res.status(req.params.id ? 200 : 201).json({ success: true, training: row });
});

const updateParticipant = asyncHandler(async (req, res) => {
  const row = await HrTraining.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Training not found' });
  const item = row.participants.find((entry) => String(entry.employee) === req.params.employeeId); if (!item) return res.status(404).json({ success: false, message: 'Training participant not found' });
  const status = clean(req.body.status, 20); if (!['assigned', 'attended', 'completed', 'absent'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid participant status' });
  item.status = status; updateActor(row, req.user); await row.save(); res.json({ success: true, training: row });
});

const listPolicies = asyncHandler(async (req, res) => {
  const filter = searchFilter(req.query, ['policyCode', 'title', 'category', 'content']); if (req.query.status) filter.status = req.query.status;
  const rows = await HrPolicy.find(filter).sort({ effectiveDate: -1 }).limit(1000).lean();
  res.json({ success: true, policies: rows.map((row) => ({ ...common(row, 'policyCode'), title: row.title, category: row.category, version: row.version, effectiveDate: row.effectiveDate, content: row.content, publishedByName: row.publishedByName, publishedAt: row.publishedAt })) });
});

const savePolicy = asyncHandler(async (req, res) => {
  const payload = { title: clean(req.body.title, 220), category: clean(req.body.category, 120), version: clean(req.body.version, 30), effectiveDate: clean(req.body.effectiveDate, 10), content: clean(req.body.content, 30000) };
  if (!payload.title || !payload.category || !payload.version || !validDateKey(payload.effectiveDate) || !payload.content) return res.status(400).json({ success: false, message: 'Policy title, category, version, effective date and content are required' });
  let row;
  if (req.params.id) { row = await HrPolicy.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Policy not found' }); if (row.status !== 'draft' && !hasHrFullAccess(req.user.role)) return res.status(409).json({ success: false, message: 'Only Admin or Doctor can edit a published or archived policy' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else row = await HrPolicy.create({ ...payload, policyCode: await nextCode('HR-POL', 'policy'), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
  res.status(req.params.id ? 200 : 201).json({ success: true, policy: row });
});

const policyStatus = asyncHandler(async (req, res) => {
  const row = await HrPolicy.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Policy not found' });
  const status = clean(req.body.status, 20); if (!hasHrFullAccess(req.user.role)) return res.status(403).json({ success: false, message: 'Only Admin or Doctor can publish or archive policies' });
  if (!canChangePolicyStatus(row.status, status)) return res.status(409).json({ success: false, message: `Cannot move policy from ${row.status} to ${status}` });
  row.status = status; if (status === 'published') { row.publishedBy = req.user._id; row.publishedByName = req.user.name; row.publishedAt = new Date(); } updateActor(row, req.user); await row.save(); res.json({ success: true, policy: row });
});

const operationsSummary = asyncHandler(async (req, res) => {
  const today = dateKeyInIndia();
  const [activeEmployees, todayAttendance, pendingLeaves, upcomingHolidays, plannedTraining, draftPolicies] = await Promise.all([
    HrEmployee.countDocuments({ status: { $in: ['active', 'probation', 'notice_period'] } }), HrAttendance.countDocuments({ date: today }), HrLeaveRequest.countDocuments({ status: 'pending' }),
    HrHoliday.countDocuments({ isActive: true, date: { $gte: today } }), HrTraining.countDocuments({ status: { $in: ['planned', 'in_progress'] } }), HrPolicy.countDocuments({ status: 'draft' }),
  ]);
  res.json({ success: true, summary: { activeEmployees, todayAttendance, pendingLeaves, upcomingHolidays, plannedTraining, draftPolicies } });
});

const deleteOperationRecord = (Model, label) => asyncHandler(async (req, res) => {
  const row = await Model.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: `${label} not found` });
  res.json({ success: true, message: `${label} deleted` });
});

const deleteAttendance = deleteOperationRecord(HrAttendance, 'Attendance record');
const deleteLeave = deleteOperationRecord(HrLeaveRequest, 'Leave request');
const deleteHoliday = deleteOperationRecord(HrHoliday, 'Holiday');
const deleteTraining = deleteOperationRecord(HrTraining, 'Training record');
const deletePolicy = deleteOperationRecord(HrPolicy, 'Policy');

module.exports = { listEmployees, availableOnboarding, saveEmployee, deleteEmployee, listAttendance, saveAttendance, deleteAttendance, listLeaves, saveLeave, deleteLeave, leaveStatus, listHolidays, saveHoliday, deleteHoliday, listTraining, saveTraining, deleteTraining, updateParticipant, listPolicies, savePolicy, deletePolicy, policyStatus, operationsSummary };
