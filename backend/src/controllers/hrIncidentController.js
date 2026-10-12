const HrIncident = require('../models/HrIncident');
const { asyncHandler } = require('../middleware/errorHandler');
const { hasHrFullAccess } = require('../constants/roles');
const { validDateKey } = require('../utils/hrRecruitmentUtils');

const TYPES = ['staff_grievance', 'staff_conflict', 'patient_complaint', 'service_issue', 'safety_incident', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'investigating', 'resolved', 'escalated'];

const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const regex = (value) => clean(value, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serialize = (row) => ({
  id: String(row._id), date: row.date, caseRef: row.caseRef, type: row.type, department: row.department, severity: row.severity,
  assignedTo: row.assignedTo, status: row.status, action: row.action, resolutionDue: row.resolutionDue, ownerReview: row.ownerReview,
  reviewedByName: row.reviewedByName, reviewedAt: row.reviewedAt, createdByName: row.createdByName, updatedByName: row.updatedByName,
  createdAt: row.createdAt, updatedAt: row.updatedAt,
});

const listIncidents = asyncHandler(async (req, res) => {
  const filter = {};
  const search = regex(req.query.search);
  if (search) filter.$or = ['caseRef', 'department', 'assignedTo', 'action'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  if (TYPES.includes(req.query.type)) filter.type = req.query.type;
  if (SEVERITIES.includes(req.query.severity)) filter.severity = req.query.severity;
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const rows = await HrIncident.find(filter).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
  const today = new Date().toISOString().slice(0, 10);
  const open = rows.filter((row) => row.status !== 'resolved');
  res.json({
    success: true, incidents: rows.map(serialize),
    summary: {
      total: rows.length, open: open.length, escalated: rows.filter((row) => row.status === 'escalated').length,
      critical: open.filter((row) => ['high', 'critical'].includes(row.severity)).length,
      overdue: open.filter((row) => row.resolutionDue && row.resolutionDue < today).length,
    },
  });
});

const saveIncident = asyncHandler(async (req, res) => {
  const isAdmin = hasHrFullAccess(req.user.role);
  const payload = {
    date: clean(req.body.date, 10), caseRef: clean(req.body.caseRef, 80), type: clean(req.body.type, 30), department: clean(req.body.department, 120),
    severity: clean(req.body.severity, 20) || 'low', assignedTo: clean(req.body.assignedTo, 150), status: clean(req.body.status, 20) || 'open',
    action: clean(req.body.action, 2000), resolutionDue: clean(req.body.resolutionDue, 10),
  };
  if (!validDateKey(payload.date) || !validDateKey(payload.resolutionDue, true) || !TYPES.includes(payload.type)) return res.status(400).json({ success: false, message: 'A valid date and incident type are required' });
  if (!SEVERITIES.includes(payload.severity) || !STATUSES.includes(payload.status)) return res.status(400).json({ success: false, message: 'Select a valid severity and status' });
  if (payload.resolutionDue && payload.resolutionDue < payload.date) return res.status(400).json({ success: false, message: 'Resolution due cannot be before the incident date' });

  let row;
  if (req.params.id) {
    row = await HrIncident.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Incident not found' });
    Object.assign(row, payload);
  } else {
    row = new HrIncident({ ...payload, createdBy: req.user._id, createdByName: req.user.name });
  }
  if (isAdmin && req.body.ownerReview !== undefined && clean(req.body.ownerReview, 1000) !== row.ownerReview) {
    row.ownerReview = clean(req.body.ownerReview, 1000);
    row.reviewedBy = req.user._id; row.reviewedByName = req.user.name; row.reviewedAt = new Date();
  }
  row.updatedBy = req.user._id; row.updatedByName = req.user.name;
  await row.save();
  res.status(req.params.id ? 200 : 201).json({ success: true, incident: serialize(row) });
});

const deleteIncident = asyncHandler(async (req, res) => {
  const row = await HrIncident.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Incident not found' });
  res.json({ success: true });
});

module.exports = { listIncidents, saveIncident, deleteIncident };
