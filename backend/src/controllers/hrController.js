const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const HrCandidate = require('../models/HrCandidate');
const HrCallRecord = require('../models/HrCallRecord');
const HrCounter = require('../models/HrCounter');
const HrCampaign = require('../models/HrCampaign');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const {
  CALL_TYPES, CALL_OUTCOMES, localDateTime, dateKeyInIndia, addDaysToDateKey,
  startOfWeekDateKey, followUpDisplayStatus,
} = require('../utils/hrCallUtils');

const clean = (value, max = 3000) => String(value || '').trim().slice(0, max);
const objectId = (value) => mongoose.Types.ObjectId.isValid(value);
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageParams = (query) => ({
  page: Math.max(1, Number.parseInt(query.page, 10) || 1),
  limit: Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25)),
});
const nextCode = async (prefix, key) => {
  const year = dateKeyInIndia().slice(0, 4);
  const value = await HrCounter.next(`${key}:${year}`);
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
};
const actor = (user) => ({ actor: user._id, actorName: user.name });

const serializeCandidate = (candidate) => ({
  id: String(candidate._id), candidateCode: candidate.candidateCode, name: candidate.name,
  phone: candidate.phone, alternatePhone: candidate.alternatePhone || '', email: candidate.email || '',
  appliedPosition: candidate.appliedPosition, source: candidate.source || '', stage: candidate.stage,
  campaignId: candidate.campaign ? String(candidate.campaign) : '', campaignCode: candidate.campaignCode || '',
  screening: candidate.screening || { status: 'pending' },
  notes: candidate.notes || '', isActive: candidate.isActive, totalCalls: candidate.totalCalls || 0,
  latestCallAt: candidate.latestCallAt || null, latestCallOutcome: candidate.latestCallOutcome || '',
  nextFollowUpAt: candidate.nextFollowUpAt || null, createdByName: candidate.createdByName,
  updatedByName: candidate.updatedByName, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt,
  activity: (candidate.activity || []).slice().reverse().map((entry) => ({
    id: String(entry._id), action: entry.action, details: entry.details || '', actorName: entry.actorName, createdAt: entry.createdAt,
  })),
});

const serializeCall = (record) => ({
  id: String(record._id), callCode: record.callCode, candidateId: String(record.candidate),
  candidateCode: record.candidateCode, candidateName: record.candidateName, appliedPosition: record.appliedPosition,
  callDate: record.callDate, callTime: record.callTime, callAt: record.callAt, callType: record.callType,
  outcome: record.outcome, remarks: record.remarks, nextFollowUpAt: record.nextFollowUpAt || null,
  followUpStatus: record.followUpStatus, followUpDisplayStatus: followUpDisplayStatus(record),
  followUpCompletedAt: record.followUpCompletedAt || null, followUpCompletedByName: record.followUpCompletedByName || '',
  recordedByName: record.recordedByName, source: record.source, createdAt: record.createdAt, updatedAt: record.updatedAt,
  voidedAt: record.voidedAt || null, voidedByName: record.voidedByName || '', voidReason: record.voidReason || '',
  editHistory: (record.editHistory || []).slice().reverse().map((entry) => ({
    id: String(entry._id), editedByName: entry.editedByName, editedAt: entry.editedAt, changes: entry.changes,
  })),
});

const refreshCandidateSummary = async (candidateId) => {
  const calls = await HrCallRecord.find({ candidate: candidateId, voidedAt: null }).sort({ callAt: -1, createdAt: -1 }).lean();
  const latest = calls[0];
  const pending = calls.filter((call) => call.followUpStatus === 'pending' && call.nextFollowUpAt)
    .sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt))[0];
  await HrCandidate.findByIdAndUpdate(candidateId, {
    $set: {
      latestCall: latest?._id || null, latestCallAt: latest?.callAt || null,
      latestCallOutcome: latest?.outcome || '', nextFollowUpAt: pending?.nextFollowUpAt || null,
      totalCalls: calls.length,
    },
  });
};

const candidatePayload = (body) => ({
  name: clean(body.name, 150), phone: clean(body.phone, 30), alternatePhone: clean(body.alternatePhone, 30),
  email: clean(body.email, 180).toLowerCase(), appliedPosition: clean(body.appliedPosition, 180),
  source: clean(body.source, 120), stage: clean(body.stage, 40) || 'new', notes: clean(body.notes, 4000),
  campaign: body.campaignId && objectId(body.campaignId) ? body.campaignId : null,
  campaignCode: clean(body.campaignCode, 40),
});

const resolveCampaign = async (campaignId, currentCampaign = null) => {
  if (!campaignId) return { campaign: null, campaignCode: '' };
  if (!objectId(campaignId)) return null;
  const campaign = await HrCampaign.findById(campaignId).lean();
  if (!campaign) return null;
  const isExistingLink = currentCampaign && String(currentCampaign) === String(campaign._id);
  if (campaign.status !== 'active' && !isExistingLink) return null;
  return { campaign: campaign._id, campaignCode: campaign.campaignCode };
};

const listCandidates = asyncHandler(async (req, res) => {
  const { page, limit } = pageParams(req.query);
  const filter = {};
  if (req.query.stage) filter.stage = req.query.stage;
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;
  if (req.query.position) filter.appliedPosition = { $regex: escapeRegex(req.query.position), $options: 'i' };
  const search = clean(req.query.search, 100);
  if (search) filter.$or = ['candidateCode', 'name', 'phone', 'email', 'appliedPosition'].map((field) => ({ [field]: { $regex: escapeRegex(search), $options: 'i' } }));
  const [rows, total] = await Promise.all([
    HrCandidate.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    HrCandidate.countDocuments(filter),
  ]);
  res.json({ success: true, candidates: rows.map(serializeCandidate), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const createCandidate = asyncHandler(async (req, res) => {
  const payload = candidatePayload(req.body);
  if (!payload.name || !payload.phone || !payload.appliedPosition) return res.status(400).json({ success: false, message: 'Candidate name, phone and applied position are required' });
  const campaign = await resolveCampaign(req.body.campaignId);
  if (req.body.campaignId && !campaign) return res.status(400).json({ success: false, message: 'Select a valid active recruitment campaign' });
  Object.assign(payload, campaign);
  const candidateCode = await nextCode('HR-CAN', 'candidate');
  const entry = await HrCandidate.create({
    ...payload, candidateCode, createdBy: req.user._id, createdByName: req.user.name,
    updatedBy: req.user._id, updatedByName: req.user.name,
    activity: [{ action: 'Candidate created', details: `Applied for ${payload.appliedPosition}`, ...actor(req.user) }],
  });
  res.status(201).json({ success: true, candidate: serializeCandidate(entry) });
});

const getCandidate = asyncHandler(async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid candidate ID' });
  const entry = await HrCandidate.findById(req.params.id).lean();
  if (!entry) return res.status(404).json({ success: false, message: 'Candidate not found' });
  res.json({ success: true, candidate: serializeCandidate(entry) });
});

const updateCandidate = asyncHandler(async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid candidate ID' });
  const entry = await HrCandidate.findById(req.params.id);
  if (!entry) return res.status(404).json({ success: false, message: 'Candidate not found' });
  const payload = candidatePayload({ ...entry.toObject(), ...req.body });
  if (!payload.name || !payload.phone || !payload.appliedPosition) return res.status(400).json({ success: false, message: 'Candidate name, phone and applied position are required' });
  const requestedCampaign = req.body.campaignId === undefined ? entry.campaign : req.body.campaignId;
  const campaign = await resolveCampaign(requestedCampaign, entry.campaign);
  if (requestedCampaign && !campaign) return res.status(400).json({ success: false, message: 'Select a valid active recruitment campaign' });
  Object.assign(payload, campaign);
  const changes = Object.entries(payload).filter(([key, value]) => String(entry[key] ?? '') !== String(value ?? ''));
  if (req.body.isActive !== undefined && entry.isActive !== Boolean(req.body.isActive)) changes.push(['isActive', Boolean(req.body.isActive)]);
  Object.assign(entry, payload);
  if (req.body.isActive !== undefined) entry.isActive = Boolean(req.body.isActive);
  entry.updatedBy = req.user._id; entry.updatedByName = req.user.name;
  if (changes.length) entry.activity.push({ action: 'Candidate updated', details: changes.map(([key]) => key).join(', '), ...actor(req.user) });
  await entry.save();
  res.json({ success: true, candidate: serializeCandidate(entry) });
});

const callPayload = (body) => {
  const callDate = clean(body.callDate, 10);
  const callTime = clean(body.callTime, 5);
  const callAt = localDateTime(callDate, callTime);
  const nextFollowUpAt = body.nextFollowUpDate && body.nextFollowUpTime
    ? localDateTime(clean(body.nextFollowUpDate, 10), clean(body.nextFollowUpTime, 5)) : null;
  return {
    callDate, callTime, callAt, callType: clean(body.callType, 30), outcome: clean(body.outcome, 40),
    remarks: clean(body.remarks, 3000), nextFollowUpAt,
    followUpStatus: nextFollowUpAt ? 'pending' : 'not_required',
  };
};

const validateCall = (payload) => {
  if (!payload.callAt) return 'Enter a valid call date and time';
  if (!CALL_TYPES.includes(payload.callType)) return 'Select a valid call type';
  if (!CALL_OUTCOMES.includes(payload.outcome)) return 'Select a valid call outcome';
  if (!payload.remarks) return 'Call remarks are required';
  return '';
};

const createCall = asyncHandler(async (req, res) => {
  if (!objectId(req.body.candidateId)) return res.status(400).json({ success: false, message: 'Select a valid candidate' });
  const candidate = await HrCandidate.findById(req.body.candidateId);
  if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
  const payload = callPayload(req.body);
  const validationError = validateCall(payload);
  if (validationError) return res.status(400).json({ success: false, message: validationError });
  const callCode = await nextCode('HR-CALL', 'call');
  const record = await HrCallRecord.create({
    ...payload, callCode, candidate: candidate._id, candidateCode: candidate.candidateCode,
    candidateName: candidate.name, appliedPosition: candidate.appliedPosition,
    recordedBy: req.user._id, recordedByName: req.user.name,
  });
  candidate.activity.push({ action: 'Manual call recorded', details: `${callCode} • ${payload.outcome.replaceAll('_', ' ')}`, ...actor(req.user) });
  candidate.updatedBy = req.user._id; candidate.updatedByName = req.user.name;
  if (candidate.stage === 'new') candidate.stage = payload.outcome === 'interested' ? 'interested' : 'calling';
  await candidate.save();
  await refreshCandidateSummary(candidate._id);
  res.status(201).json({ success: true, call: serializeCall(record) });
});

const buildCallFilter = (query) => {
  const filter = query.includeVoided === 'true' ? {} : { voidedAt: null };
  if (query.candidateId && objectId(query.candidateId)) filter.candidate = query.candidateId;
  if (query.outcome) filter.outcome = query.outcome;
  if (query.position) filter.appliedPosition = { $regex: escapeRegex(query.position), $options: 'i' };
  if (query.from || query.to) filter.callDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  if (query.followUpStatus === 'overdue') filter.followUpStatus = 'pending', filter.nextFollowUpAt = { $lt: new Date() };
  else if (query.followUpStatus === 'pending') filter.followUpStatus = 'pending', filter.nextFollowUpAt = { $gte: new Date() };
  else if (query.followUpStatus) filter.followUpStatus = query.followUpStatus;
  const search = clean(query.search, 100);
  if (search) filter.$or = ['callCode', 'candidateCode', 'candidateName', 'appliedPosition', 'remarks'].map((field) => ({ [field]: { $regex: escapeRegex(search), $options: 'i' } }));
  return filter;
};

const listCalls = asyncHandler(async (req, res) => {
  const { page, limit } = pageParams(req.query);
  const filter = buildCallFilter(req.query);
  const [rows, total] = await Promise.all([
    HrCallRecord.find(filter).sort({ callAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    HrCallRecord.countDocuments(filter),
  ]);
  res.json({ success: true, calls: rows.map(serializeCall), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const updateCall = asyncHandler(async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid call record ID' });
  const record = await HrCallRecord.findById(req.params.id);
  if (!record || record.voidedAt) return res.status(404).json({ success: false, message: 'Active call record not found' });
  const payload = callPayload(req.body);
  const validationError = validateCall(payload);
  if (validationError) return res.status(400).json({ success: false, message: validationError });
  if (['completed', 'cancelled'].includes(record.followUpStatus) && payload.nextFollowUpAt && String(record.nextFollowUpAt) === String(payload.nextFollowUpAt)) {
    payload.followUpStatus = record.followUpStatus;
  }
  const tracked = ['callDate', 'callTime', 'callType', 'outcome', 'remarks', 'nextFollowUpAt', 'followUpStatus'];
  const changes = tracked.filter((field) => String(record[field] ?? '') !== String(payload[field] ?? '')).map((field) => ({ field, from: record[field] ?? null, to: payload[field] ?? null }));
  if (!changes.length) return res.json({ success: true, call: serializeCall(record) });
  record.editHistory.push({ editedBy: req.user._id, editedByName: req.user.name, changes });
  Object.assign(record, payload);
  await record.save();
  const candidate = await HrCandidate.findById(record.candidate);
  if (candidate) {
    candidate.activity.push({ action: 'Call record edited', details: `${record.callCode} • ${changes.map((item) => item.field).join(', ')}`, ...actor(req.user) });
    candidate.updatedBy = req.user._id; candidate.updatedByName = req.user.name; await candidate.save();
  }
  await refreshCandidateSummary(record.candidate);
  res.json({ success: true, call: serializeCall(record) });
});

const setFollowUpStatus = asyncHandler(async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid call record ID' });
  const status = clean(req.body.status, 20);
  if (!['completed', 'cancelled'].includes(status)) return res.status(400).json({ success: false, message: 'Follow-up can only be completed or cancelled' });
  const record = await HrCallRecord.findOne({ _id: req.params.id, voidedAt: null, nextFollowUpAt: { $ne: null }, followUpStatus: 'pending' });
  if (!record) return res.status(404).json({ success: false, message: 'Follow-up not found' });
  const previous = record.followUpStatus;
  record.followUpStatus = status; record.followUpCompletedAt = new Date();
  record.followUpCompletedBy = req.user._id; record.followUpCompletedByName = req.user.name;
  record.editHistory.push({ editedBy: req.user._id, editedByName: req.user.name, changes: [{ field: 'followUpStatus', from: previous, to: status }] });
  await record.save();
  const candidate = await HrCandidate.findById(record.candidate);
  if (candidate) {
    candidate.activity.push({ action: `Follow-up ${status}`, details: record.callCode, ...actor(req.user) });
    candidate.updatedBy = req.user._id; candidate.updatedByName = req.user.name; await candidate.save();
  }
  await refreshCandidateSummary(record.candidate);
  res.json({ success: true, call: serializeCall(record) });
});

const voidCall = asyncHandler(async (req, res) => {
  const reason = clean(req.body.reason, 500);
  if (!reason) return res.status(400).json({ success: false, message: 'A reason is required to void a call record' });
  const record = await HrCallRecord.findOne({ _id: req.params.id, voidedAt: null });
  if (!record) return res.status(404).json({ success: false, message: 'Active call record not found' });
  record.voidedAt = new Date(); record.voidedBy = req.user._id; record.voidedByName = req.user.name; record.voidReason = reason;
  await record.save();
  const candidate = await HrCandidate.findById(record.candidate);
  if (candidate) {
    candidate.activity.push({ action: 'Call record voided by Admin', details: `${record.callCode} • ${reason}`, ...actor(req.user) });
    candidate.updatedBy = req.user._id; candidate.updatedByName = req.user.name; await candidate.save();
  }
  await refreshCandidateSummary(record.candidate);
  res.json({ success: true, call: serializeCall(record) });
});

const dashboard = asyncHandler(async (req, res) => {
  const today = dateKeyInIndia();
  const yesterday = addDaysToDateKey(today, -1);
  const weekStart = startOfWeekDateKey(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const active = { voidedAt: null };
  const now = new Date();
  const [todayCount, yesterdayCount, weekCount, monthCount, outcomes, pendingCallbacks, overdueFollowUps, recentCalls, dueRows, candidateCount] = await Promise.all([
    HrCallRecord.countDocuments({ ...active, callDate: today }),
    HrCallRecord.countDocuments({ ...active, callDate: yesterday }),
    HrCallRecord.countDocuments({ ...active, callDate: { $gte: weekStart, $lte: today } }),
    HrCallRecord.countDocuments({ ...active, callDate: { $gte: monthStart, $lte: today } }),
    HrCallRecord.aggregate([{ $match: active }, { $group: { _id: '$outcome', count: { $sum: 1 } } }]),
    HrCallRecord.countDocuments({ ...active, followUpStatus: 'pending', nextFollowUpAt: { $gte: now } }),
    HrCallRecord.countDocuments({ ...active, followUpStatus: 'pending', nextFollowUpAt: { $lt: now } }),
    HrCallRecord.find(active).sort({ callAt: -1 }).limit(10).lean(),
    HrCallRecord.find({ ...active, followUpStatus: 'pending', nextFollowUpAt: { $ne: null } }).sort({ nextFollowUpAt: 1 }).limit(12).lean(),
    HrCandidate.countDocuments({ isActive: true }),
  ]);
  const outcomeCounts = Object.fromEntries(CALL_OUTCOMES.map((key) => [key, 0]));
  outcomes.forEach((row) => { outcomeCounts[row._id] = row.count; });
  res.json({ success: true, stats: { today: todayCount, yesterday: yesterdayCount, week: weekCount, month: monthCount, pendingCallbacks, overdueFollowUps, activeCandidates: candidateCount, outcomes: outcomeCounts }, recentCalls: recentCalls.map(serializeCall), followUps: dueRows.map(serializeCall) });
});

const exportCalls = asyncHandler(async (req, res) => {
  const rows = await HrCallRecord.find(buildCallFilter(req.query)).sort({ callAt: -1 }).limit(10000).lean();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ManoVaidya HR CRM';
  const sheet = workbook.addWorksheet('Manual Call Register', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    ['Call Record ID', 'callCode', 22], ['Candidate ID', 'candidateCode', 20], ['Candidate Name', 'candidateName', 25],
    ['Applied Position', 'appliedPosition', 25], ['Call Date', 'callDate', 14], ['Call Time', 'callTime', 12],
    ['Call Type', 'callType', 18], ['Outcome', 'outcome', 20], ['Remarks', 'remarks', 45],
    ['Next Follow-up', 'nextFollowUp', 22], ['Follow-up Status', 'followUpStatus', 18],
    ['Recorded By', 'recordedByName', 22], ['Entry Source', 'source', 16], ['Created At', 'createdAt', 22], ['Last Modified', 'updatedAt', 22],
  ].map(([header, key, width]) => ({ header, key, width }));
  rows.forEach((row) => sheet.addRow({
    ...row, callType: row.callType.replaceAll('_', ' '), outcome: row.outcome.replaceAll('_', ' '),
    nextFollowUp: row.nextFollowUpAt || '', followUpStatus: followUpDisplayStatus(row).replaceAll('_', ' '),
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315F5A' } };
  sheet.autoFilter = { from: 'A1', to: 'O1' };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="HR-Manual-Call-Register-${dateKeyInIndia()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = {
  listCandidates, createCandidate, getCandidate, updateCandidate,
  listCalls, createCall, updateCall, setFollowUpStatus, voidCall, dashboard, exportCalls,
};
