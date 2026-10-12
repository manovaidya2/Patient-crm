const mongoose = require('mongoose');
const HrCounter = require('../models/HrCounter');
const HrCandidate = require('../models/HrCandidate');
const HrHiringRequirement = require('../models/HrHiringRequirement');
const HrJobDescription = require('../models/HrJobDescription');
const HrCampaign = require('../models/HrCampaign');
const HrInterview = require('../models/HrInterview');
const HrOffer = require('../models/HrOffer');
const HrOnboarding = require('../models/HrOnboarding');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, hasHrFullAccess } = require('../constants/roles');
const { localDateTime, dateKeyInIndia } = require('../utils/hrCallUtils');
const { REQUIREMENT_TRANSITIONS, OFFER_TRANSITIONS, canTransition, canEditOffer, canManageOfferTransition, nextInterviewRound, offerCompensation, interviewChainMetadata, splitList, validDateKey } = require('../utils/hrRecruitmentUtils');
const { deleteCampaignCascade, deleteJobDescriptionCascade, deleteOfferCascade, deleteOnboardingCascade } = require('../utils/hrAdminDeleteUtils');

const clean = (value, max = 3000) => String(value || '').trim().slice(0, max);
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const actor = (user) => ({ actor: user._id, actorName: user.name });
const nextCode = async (prefix, key) => {
  const year = dateKeyInIndia().slice(0, 4);
  const value = await HrCounter.next(`${key}:${year}`);
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
};
const updateActor = (record, user) => { record.updatedBy = user._id; record.updatedByName = user.name; };
const candidateActivity = async (candidateId, user, action, details = '') => {
  await HrCandidate.findByIdAndUpdate(candidateId, {
    $set: { updatedBy: user._id, updatedByName: user.name },
    $push: { activity: { action, details, ...actor(user) } },
  });
};
const searchFilter = (query, fields) => {
  const search = clean(query.search, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return search ? { $or: fields.map((field) => ({ [field]: { $regex: search, $options: 'i' } })) } : {};
};
const common = (record, codeField) => ({
  id: String(record._id), [codeField]: record[codeField], status: record.status,
  createdByName: record.createdByName, updatedByName: record.updatedByName,
  createdAt: record.createdAt, updatedAt: record.updatedAt,
});

const listRequirements = asyncHandler(async (req, res) => {
  const filter = { ...searchFilter(req.query, ['requirementCode', 'positionTitle', 'department', 'requestedByName']) };
  if (req.query.status) filter.status = req.query.status;
  const rows = await HrHiringRequirement.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  res.json({ success: true, requirements: rows.map((row) => ({ ...common(row, 'requirementCode'), positionTitle: row.positionTitle, department: row.department, location: row.location, employmentType: row.employmentType, openings: row.openings, priority: row.priority, targetDate: row.targetDate, reason: row.reason, skills: row.skills, requestedByName: row.requestedByName, approvalNote: row.approvalNote, approvedByName: row.approvedByName, approvedAt: row.approvedAt, timeline: (row.timeline || []).slice().reverse() })) });
});

const saveRequirement = asyncHandler(async (req, res) => {
  const payload = {
    positionTitle: clean(req.body.positionTitle, 180), department: clean(req.body.department, 120), location: clean(req.body.location, 180),
    employmentType: clean(req.body.employmentType, 30) || 'full_time', openings: Number(req.body.openings),
    priority: clean(req.body.priority, 20) || 'normal', targetDate: clean(req.body.targetDate, 10),
    reason: clean(req.body.reason, 3000), skills: splitList(req.body.skills), requestedByName: clean(req.body.requestedByName, 150),
  };
  if (!payload.positionTitle || !payload.department || !payload.reason || !payload.requestedByName || !Number.isInteger(payload.openings) || payload.openings < 1) return res.status(400).json({ success: false, message: 'Position, department, openings, requested by and reason are required' });
  if (!validDateKey(payload.targetDate, true)) return res.status(400).json({ success: false, message: 'Enter a valid target date' });
  let row;
  if (req.params.id) {
    row = await HrHiringRequirement.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Hiring requirement not found' });
    if (!hasHrFullAccess(req.user.role) && !['draft', 'rejected'].includes(row.status)) return res.status(409).json({ success: false, message: 'Only draft or rejected requirements can be edited' });
    Object.assign(row, payload); updateActor(row, req.user);
    row.timeline.push({ action: 'Requirement updated', details: payload.positionTitle, ...actor(req.user) });
    await row.save();
  } else {
    const requirementCode = await nextCode('HR-REQ', 'requirement');
    row = await HrHiringRequirement.create({ ...payload, requirementCode, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name, timeline: [{ action: 'Requirement created', details: payload.positionTitle, ...actor(req.user) }] });
  }
  res.status(req.params.id ? 200 : 201).json({ success: true, requirement: row });
});

const requirementStatus = asyncHandler(async (req, res) => {
  const row = await HrHiringRequirement.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Hiring requirement not found' });
  const next = clean(req.body.status, 30); const note = clean(req.body.note, 1000);
  if (!canTransition(REQUIREMENT_TRANSITIONS, row.status, next)) return res.status(409).json({ success: false, message: `Cannot move requirement from ${row.status} to ${next}` });
  if (['approved', 'rejected'].includes(next) && !hasHrFullAccess(req.user.role)) return res.status(403).json({ success: false, message: 'Only Admin or Doctor can approve or reject hiring requirements' });
  if (next === 'rejected' && !note) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
  row.status = next; row.approvalNote = note; updateActor(row, req.user);
  if (next === 'approved') { row.approvedBy = req.user._id; row.approvedByName = req.user.name; row.approvedAt = new Date(); }
  row.timeline.push({ action: `Requirement ${next.replaceAll('_', ' ')}`, details: note, ...actor(req.user) });
  await row.save(); res.json({ success: true, requirement: row });
});

const listJds = asyncHandler(async (req, res) => {
  const filter = { ...searchFilter(req.query, ['jdCode', 'requirementCode', 'title', 'department']) };
  if (req.query.status) filter.status = req.query.status;
  const rows = await HrJobDescription.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
  res.json({ success: true, jobDescriptions: rows.map((row) => ({ ...common(row, 'jdCode'), requirementId: String(row.requirement), requirementCode: row.requirementCode, title: row.title, department: row.department, summary: row.summary, responsibilities: row.responsibilities, qualifications: row.qualifications, experience: row.experience, salaryRange: row.salaryRange })) });
});

const saveJd = asyncHandler(async (req, res) => {
  const requirementFilter = { _id: req.body.requirementId };
  if (!(hasHrFullAccess(req.user.role) && req.params.id)) requirementFilter.status = 'approved';
  const requirement = await HrHiringRequirement.findOne(requirementFilter);
  if (!requirement) return res.status(400).json({ success: false, message: 'Select an approved hiring requirement' });
  const payload = { requirement: requirement._id, requirementCode: requirement.requirementCode, title: clean(req.body.title, 180), department: clean(req.body.department, 120), summary: clean(req.body.summary, 5000), responsibilities: clean(req.body.responsibilities, 8000), qualifications: clean(req.body.qualifications, 5000), experience: clean(req.body.experience, 500), salaryRange: clean(req.body.salaryRange, 300), status: clean(req.body.status, 20) || 'draft' };
  if (!payload.title || !payload.department || !payload.summary || !payload.responsibilities || !payload.qualifications) return res.status(400).json({ success: false, message: 'Title, department, summary, responsibilities and qualifications are required' });
  let row;
  if (req.params.id) { row = await HrJobDescription.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Job description not found' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else { row = await HrJobDescription.create({ ...payload, jdCode: await nextCode('HR-JD', 'jd'), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name }); }
  res.status(req.params.id ? 200 : 201).json({ success: true, jobDescription: row });
});

const listCampaigns = asyncHandler(async (req, res) => {
  const filter = { ...searchFilter(req.query, ['campaignCode', 'jdCode', 'positionTitle', 'name']) }; if (req.query.status) filter.status = req.query.status;
  const rows = await HrCampaign.find(filter).sort({ startDate: -1 }).limit(500).lean();
  res.json({ success: true, campaigns: rows.map((row) => ({ ...common(row, 'campaignCode'), jobDescriptionId: String(row.jobDescription), jdCode: row.jdCode, positionTitle: row.positionTitle, name: row.name, channels: row.channels, startDate: row.startDate, endDate: row.endDate, budget: row.budget, actualSpend: row.actualSpend || 0, targetApplications: row.targetApplications, notes: row.notes })) });
});

const saveCampaign = asyncHandler(async (req, res) => {
  const jdFilter = { _id: req.body.jobDescriptionId };
  if (!(hasHrFullAccess(req.user.role) && req.params.id)) jdFilter.status = 'active';
  const jd = await HrJobDescription.findOne(jdFilter);
  if (!jd) return res.status(400).json({ success: false, message: 'Select an active job description' });
  const payload = { jobDescription: jd._id, jdCode: jd.jdCode, positionTitle: jd.title, name: clean(req.body.name, 180), channels: splitList(req.body.channels), startDate: clean(req.body.startDate, 10), endDate: clean(req.body.endDate, 10), budget: Number(req.body.budget || 0), actualSpend: Number(req.body.actualSpend || 0), targetApplications: Number(req.body.targetApplications || 0), notes: clean(req.body.notes, 3000), status: clean(req.body.status, 20) || 'planned' };
  const validNumbers = [payload.budget, payload.actualSpend, payload.targetApplications].every((value) => Number.isFinite(value) && value >= 0);
  if (!payload.name || !validDateKey(payload.startDate) || !validDateKey(payload.endDate, true) || !validNumbers) return res.status(400).json({ success: false, message: 'Campaign name, valid dates and non-negative budget, spend and targets are required' });
  if (payload.endDate && payload.endDate < payload.startDate) return res.status(400).json({ success: false, message: 'Campaign end date cannot be before start date' });
  let row;
  if (req.params.id) { row = await HrCampaign.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Campaign not found' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else { row = await HrCampaign.create({ ...payload, campaignCode: await nextCode('HR-CMP', 'campaign'), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name }); }
  res.status(req.params.id ? 200 : 201).json({ success: true, campaign: row });
});

const saveScreening = asyncHandler(async (req, res) => {
  const candidate = await HrCandidate.findById(req.params.id);
  if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
  const status = clean(req.body.status, 30); const rating = Number(req.body.rating);
  if (!['pending', 'shortlisted', 'rejected', 'on_hold'].includes(status) || !Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Screening status and rating from 1 to 5 are required' });
  candidate.screening = { status, rating, education: clean(req.body.education, 500), experience: clean(req.body.experience, 500), currentCtc: clean(req.body.currentCtc, 300), expectedCtc: clean(req.body.expectedCtc, 300), noticePeriod: clean(req.body.noticePeriod, 300), remarks: clean(req.body.remarks, 3000), screenedBy: req.user._id, screenedByName: req.user.name, screenedAt: new Date() };
  candidate.stage = status === 'shortlisted' ? 'screening' : status === 'rejected' ? 'rejected' : status === 'on_hold' ? 'on_hold' : candidate.stage;
  updateActor(candidate, req.user); candidate.activity.push({ action: `Screening ${status}`, details: `Rating ${rating}/5`, ...actor(req.user) });
  await candidate.save(); res.json({ success: true, candidate });
});

const listInterviews = asyncHandler(async (req, res) => {
  const filter = { ...searchFilter(req.query, ['interviewCode', 'candidateCode', 'candidateName', 'appliedPosition', 'interviewerName']) }; if (req.query.status) filter.status = req.query.status; if (req.query.candidateId && validId(req.query.candidateId)) filter.candidate = req.query.candidateId;
  const rows = await HrInterview.find(filter).sort({ scheduledAt: -1 }).limit(500).lean();
  const chain = interviewChainMetadata(rows);
  res.json({ success: true, interviews: rows.map((row) => ({ ...common(row, 'interviewCode'), candidateId: String(row.candidate), candidateCode: row.candidateCode, candidateName: row.candidateName, appliedPosition: row.appliedPosition, ...chain.get(String(row._id)), round: row.round, interviewType: row.interviewType, scheduledAt: row.scheduledAt, durationMinutes: row.durationMinutes, interviewerName: row.interviewerName, locationOrLink: row.locationOrLink, instructions: row.instructions, evaluation: row.evaluation })) });
});

const saveInterview = asyncHandler(async (req, res) => {
  const candidate = await HrCandidate.findById(req.body.candidateId); if (!candidate) return res.status(400).json({ success: false, message: 'Select a valid candidate' });
  if (!req.params.id && (!candidate.isActive || ['rejected', 'withdrawn', 'joined'].includes(candidate.stage))) return res.status(409).json({ success: false, message: 'Interview cannot be scheduled for this candidate stage' });
  let previousInterview = null;
  if (!req.params.id && req.body.previousInterviewId) {
    if (!validId(req.body.previousInterviewId)) return res.status(400).json({ success: false, message: 'Invalid previous interview' });
    previousInterview = await HrInterview.findOne({ _id: req.body.previousInterviewId, candidate: candidate._id });
    if (!previousInterview || previousInterview.status !== 'completed' || previousInterview.evaluation?.recommendation !== 'next_round') return res.status(409).json({ success: false, message: 'Next round requires a completed interview recommended for the next round' });
    if (await HrInterview.exists({ previousInterview: previousInterview._id })) return res.status(409).json({ success: false, message: 'The next round is already scheduled for this interview' });
  }
  if (!req.params.id && !previousInterview && candidate.screening?.status !== 'shortlisted') return res.status(409).json({ success: false, message: 'Complete screening and shortlist the candidate before scheduling the first interview' });
  const scheduledAt = localDateTime(clean(req.body.scheduledDate, 10), clean(req.body.scheduledTime, 5));
  const existingCount = req.params.id ? 0 : await HrInterview.countDocuments({ candidate: candidate._id });
  if (!req.params.id && !previousInterview && existingCount > 0) return res.status(409).json({ success: false, message: 'Book another round from the previous interview evaluation so the history remains connected' });
  const roundNumber = req.params.id ? undefined : previousInterview ? nextInterviewRound(previousInterview.roundNumber, existingCount) : 1;
  const payload = { candidate: candidate._id, candidateCode: candidate.candidateCode, candidateName: candidate.name, appliedPosition: candidate.appliedPosition, ...(!req.params.id ? { previousInterview: previousInterview?._id || null, roundNumber } : {}), round: clean(req.body.round, 120), interviewType: clean(req.body.interviewType, 30), scheduledAt, durationMinutes: Number(req.body.durationMinutes || 30), interviewerName: clean(req.body.interviewerName, 180), locationOrLink: clean(req.body.locationOrLink, 1000), instructions: clean(req.body.instructions, 3000), status: clean(req.body.status, 30) || 'scheduled' };
  if (!scheduledAt || !payload.round || !payload.interviewerName) return res.status(400).json({ success: false, message: 'Candidate, round, schedule and interviewer are required' });
  let row;
  if (req.params.id) { row = await HrInterview.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Interview not found' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else { row = await HrInterview.create({ ...payload, interviewCode: await nextCode('HR-INT', 'interview'), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name }); }
  candidate.stage = 'interview_scheduled'; await candidate.save(); await candidateActivity(candidate._id, req.user, req.params.id ? 'Interview updated' : 'Interview scheduled', `${row.interviewCode} • ${row.round}`);
  res.status(req.params.id ? 200 : 201).json({ success: true, interview: row });
});

const saveEvaluation = asyncHandler(async (req, res) => {
  const row = await HrInterview.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Interview not found' });
  const rating = Number(req.body.rating); const recommendation = clean(req.body.recommendation, 30);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !['next_round', 'selected', 'rejected', 'on_hold'].includes(recommendation)) return res.status(400).json({ success: false, message: 'Rating and recommendation are required' });
  row.evaluation = { rating, recommendation, strengths: clean(req.body.strengths, 3000), concerns: clean(req.body.concerns, 3000), notes: clean(req.body.notes, 3000), evaluatedBy: req.user._id, evaluatedByName: req.user.name, evaluatedAt: new Date() };
  row.status = 'completed'; updateActor(row, req.user); await row.save();
  const stage = recommendation === 'selected' ? 'selected' : recommendation === 'rejected' ? 'rejected' : recommendation === 'on_hold' ? 'on_hold' : 'interviewed';
  await HrCandidate.findByIdAndUpdate(row.candidate, { $set: { stage, updatedBy: req.user._id, updatedByName: req.user.name }, $push: { activity: { action: `Interview evaluation: ${recommendation.replaceAll('_', ' ')}`, details: `${row.interviewCode} • Rating ${rating}/5`, ...actor(req.user) } } });
  res.json({ success: true, interview: row });
});

const listOffers = asyncHandler(async (req, res) => {
  const filter = { ...searchFilter(req.query, ['offerCode', 'candidateCode', 'candidateName', 'designation', 'department']) }; if (req.query.status) filter.status = req.query.status; if (req.query.candidateId && validId(req.query.candidateId)) filter.candidate = req.query.candidateId;
  if (req.query.availableForOnboarding === 'true') {
    filter.status = 'accepted';
    const usedOfferIds = await HrOnboarding.distinct('offer');
    if (usedOfferIds.length) filter._id = { $nin: usedOfferIds };
  }
  const rows = await HrOffer.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
  res.json({ success: true, offers: rows.map((row) => ({ ...common(row, 'offerCode'), candidateId: String(row.candidate), candidateCode: row.candidateCode, candidateName: row.candidateName, designation: row.designation, department: row.department, annualCtc: row.annualCtc, monthlyGross: row.monthlyGross, employmentType: row.employmentType, proposedJoiningDate: row.proposedJoiningDate, validUntil: row.validUntil, terms: row.terms, approvalNote: row.approvalNote, approvedByName: row.approvedByName, approvedAt: row.approvedAt, sentAt: row.sentAt, respondedAt: row.respondedAt })) });
});

const saveOffer = asyncHandler(async (req, res) => {
  if (!req.params.id && req.user.role !== ROLES.HR) return res.status(403).json({ success: false, message: 'HR prepares and submits new offers for Admin approval' });
  const candidate = await HrCandidate.findById(req.body.candidateId); if (!candidate) return res.status(400).json({ success: false, message: 'Select a valid candidate' });
  if (!req.params.id && (!candidate.isActive || candidate.stage !== 'selected')) return res.status(409).json({ success: false, message: 'Only an active selected candidate can receive a new offer' });
  if (!req.params.id) {
    const openOffer = await HrOffer.findOne({ candidate: candidate._id, status: { $in: ['draft', 'pending_approval', 'approved', 'sent', 'accepted'] } }).select('_id').lean();
    if (openOffer) return res.status(409).json({ success: false, message: 'This candidate already has an active offer' });
  }
  const compensation = offerCompensation(req.body.monthlyGross, req.body.annualCtc);
  const payload = { candidate: candidate._id, candidateCode: candidate.candidateCode, candidateName: candidate.name, designation: clean(req.body.designation, 180), department: clean(req.body.department, 120), ...(compensation || {}), employmentType: clean(req.body.employmentType, 30) || 'full_time', proposedJoiningDate: clean(req.body.proposedJoiningDate, 10), validUntil: clean(req.body.validUntil, 10), terms: clean(req.body.terms, 5000) };
  if (!payload.designation || !payload.department || !compensation || !validDateKey(payload.proposedJoiningDate) || !validDateKey(payload.validUntil, true)) return res.status(400).json({ success: false, message: 'Designation, department, monthly salary and valid joining date are required' });
  let row;
  if (req.params.id) { row = await HrOffer.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Offer not found' }); if (!canEditOffer(req.user.role, row.status)) return res.status(409).json({ success: false, message: 'This offer can no longer be edited at its current stage' }); if (String(row.candidate) !== String(candidate._id)) return res.status(409).json({ success: false, message: 'The candidate linked to an offer cannot be changed' }); Object.assign(row, payload); updateActor(row, req.user); await row.save(); }
  else { row = await HrOffer.create({ ...payload, offerCode: await nextCode('HR-OFR', 'offer'), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name }); }
  await candidateActivity(candidate._id, req.user, req.params.id ? 'Offer updated' : 'Offer drafted', row.offerCode);
  res.status(req.params.id ? 200 : 201).json({ success: true, offer: row });
});

const offerStatus = asyncHandler(async (req, res) => {
  const row = await HrOffer.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Offer not found' });
  const next = clean(req.body.status, 30); const note = clean(req.body.note, 1000);
  if (!canTransition(OFFER_TRANSITIONS, row.status, next)) return res.status(409).json({ success: false, message: `Cannot move offer from ${row.status} to ${next}` });
  if (!canManageOfferTransition(req.user.role, next)) return res.status(403).json({ success: false, message: ['approved', 'rejected'].includes(next) ? 'Only Admin or Doctor can approve or reject salary offers' : 'HR manages offer submission, communication and candidate response updates' });
  if (next === 'rejected' && !note) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
  row.status = next; row.approvalNote = note; updateActor(row, req.user);
  if (next === 'approved') { row.approvedBy = req.user._id; row.approvedByName = req.user.name; row.approvedAt = new Date(); }
  if (next === 'sent') row.sentAt = new Date(); if (['accepted', 'declined'].includes(next)) row.respondedAt = new Date();
  await row.save();
  const stage = next === 'sent' ? 'offer_sent' : next === 'accepted' ? 'selected' : next === 'declined' ? 'withdrawn' : null;
  if (stage) await HrCandidate.findByIdAndUpdate(row.candidate, { $set: { stage, updatedBy: req.user._id, updatedByName: req.user.name } });
  await candidateActivity(row.candidate, req.user, `Offer ${next.replaceAll('_', ' ')}`, `${row.offerCode}${note ? ` • ${note}` : ''}`);
  res.json({ success: true, offer: row });
});

const defaultChecklist = [
  ['documents', 'Collect and verify joining documents'], ['identity', 'Verify identity and address proof'],
  ['contract', 'Issue appointment letter / contract'], ['account', 'Create CRM or work account'],
  ['orientation', 'Complete HR orientation'], ['department_handover', 'Hand over to reporting department'],
];

const listOnboarding = asyncHandler(async (req, res) => {
  const filter = { ...searchFilter(req.query, ['onboardingCode', 'offerCode', 'candidateCode', 'candidateName', 'designation', 'department']) }; if (req.query.status) filter.status = req.query.status;
  const rows = await HrOnboarding.find(filter).sort({ joiningDate: -1 }).limit(500).lean();
  res.json({ success: true, onboardings: rows.map((row) => ({ ...common(row, 'onboardingCode'), candidateId: String(row.candidate), candidateCode: row.candidateCode, candidateName: row.candidateName, offerId: String(row.offer), offerCode: row.offerCode, designation: row.designation, department: row.department, joiningDate: row.joiningDate, reportingManager: row.reportingManager, workLocation: row.workLocation, checklist: row.checklist, notes: row.notes, completedAt: row.completedAt })) });
});

const createOnboarding = asyncHandler(async (req, res) => {
  const offer = await HrOffer.findOne({ _id: req.body.offerId, status: 'accepted' }); if (!offer) return res.status(400).json({ success: false, message: 'Select an accepted offer' });
  const existing = await HrOnboarding.findOne({ offer: offer._id }); if (existing) return res.status(409).json({ success: false, message: 'Onboarding already exists for this offer' });
  const joiningDate = clean(req.body.joiningDate || offer.proposedJoiningDate, 10); if (!validDateKey(joiningDate)) return res.status(400).json({ success: false, message: 'Valid joining date is required' });
  const row = await HrOnboarding.create({ onboardingCode: await nextCode('HR-ONB', 'onboarding'), candidate: offer.candidate, candidateCode: offer.candidateCode, candidateName: offer.candidateName, offer: offer._id, offerCode: offer.offerCode, designation: offer.designation, department: offer.department, joiningDate, reportingManager: clean(req.body.reportingManager, 180), workLocation: clean(req.body.workLocation, 180), notes: clean(req.body.notes, 3000), checklist: defaultChecklist.map(([key, label]) => ({ key, label })), createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
  await candidateActivity(offer.candidate, req.user, 'Onboarding started', row.onboardingCode); res.status(201).json({ success: true, onboarding: row });
});

const saveOnboarding = asyncHandler(async (req, res) => {
  const row = await HrOnboarding.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Onboarding record not found' });
  const joiningDate = clean(req.body.joiningDate, 10);
  if (!validDateKey(joiningDate)) return res.status(400).json({ success: false, message: 'Valid joining date is required' });
  Object.assign(row, { joiningDate, reportingManager: clean(req.body.reportingManager, 180), workLocation: clean(req.body.workLocation, 180), notes: clean(req.body.notes, 3000) });
  updateActor(row, req.user); await row.save();
  await candidateActivity(row.candidate, req.user, 'Onboarding details updated', row.onboardingCode);
  res.json({ success: true, onboarding: row });
});

const updateOnboardingItem = asyncHandler(async (req, res) => {
  const row = await HrOnboarding.findById(req.params.id); if (!row) return res.status(404).json({ success: false, message: 'Onboarding record not found' });
  if (['completed', 'cancelled'].includes(row.status) && !hasHrFullAccess(req.user.role)) return res.status(409).json({ success: false, message: 'Only Admin or Doctor can change completed or cancelled onboarding' });
  const item = row.checklist.find((entry) => entry.key === req.params.key); if (!item) return res.status(404).json({ success: false, message: 'Checklist item not found' });
  item.completed = Boolean(req.body.completed); item.note = clean(req.body.note, 1000);
  item.completedAt = item.completed ? new Date() : null; item.completedBy = item.completed ? req.user._id : null; item.completedByName = item.completed ? req.user.name : '';
  const allDone = row.checklist.every((entry) => entry.completed);
  row.status = allDone ? 'completed' : row.checklist.some((entry) => entry.completed) ? 'in_progress' : 'not_started';
  row.completedAt = allDone ? new Date() : null; updateActor(row, req.user); await row.save();
  if (allDone) await HrCandidate.findByIdAndUpdate(row.candidate, { $set: { stage: 'joined', updatedBy: req.user._id, updatedByName: req.user.name } });
  await candidateActivity(row.candidate, req.user, allDone ? 'Onboarding completed' : 'Onboarding checklist updated', item.label);
  res.json({ success: true, onboarding: row });
});

const deleteRequirement = asyncHandler(async (req, res) => {
  const row = await HrHiringRequirement.findById(req.params.id).select('requirementCode').lean();
  if (!row) return res.status(404).json({ success: false, message: 'Hiring requirement not found' });
  const jobDescriptions = await HrJobDescription.find({ requirement: row._id }).select('_id').lean();
  for (const jobDescription of jobDescriptions) await deleteJobDescriptionCascade(jobDescription._id);
  await HrHiringRequirement.deleteOne({ _id: row._id });
  res.json({ success: true, message: `${row.requirementCode} and linked job descriptions/campaigns deleted` });
});

const deleteJd = asyncHandler(async (req, res) => {
  const row = await HrJobDescription.findById(req.params.id).select('jdCode').lean();
  if (!row) return res.status(404).json({ success: false, message: 'Job description not found' });
  const deleted = await deleteJobDescriptionCascade(row._id);
  res.json({ success: true, message: `${row.jdCode} and linked campaigns deleted`, deleted });
});

const deleteCampaign = asyncHandler(async (req, res) => {
  const row = await HrCampaign.findById(req.params.id).select('campaignCode').lean();
  if (!row) return res.status(404).json({ success: false, message: 'Campaign not found' });
  const deleted = await deleteCampaignCascade(row._id);
  res.json({ success: true, message: `${row.campaignCode} deleted and candidates unlinked`, deleted });
});

const deleteInterview = asyncHandler(async (req, res) => {
  const row = await HrInterview.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Interview not found' });
  await HrInterview.updateMany({ previousInterview: row._id }, { $set: { previousInterview: null } });
  res.json({ success: true, message: `${row.interviewCode} deleted` });
});

const deleteOffer = asyncHandler(async (req, res) => {
  const row = await HrOffer.findById(req.params.id).select('offerCode candidate').lean();
  if (!row) return res.status(404).json({ success: false, message: 'Offer not found' });
  const deleted = await deleteOfferCascade(row._id);
  await HrCandidate.updateOne({ _id: row.candidate, stage: 'joined' }, { $set: { stage: 'selected', updatedBy: req.user._id, updatedByName: req.user.name } });
  res.json({ success: true, message: `${row.offerCode} and linked onboarding/employee records deleted`, deleted });
});

const deleteOnboarding = asyncHandler(async (req, res) => {
  const row = await HrOnboarding.findById(req.params.id).select('onboardingCode candidate').lean();
  if (!row) return res.status(404).json({ success: false, message: 'Onboarding record not found' });
  const deleted = await deleteOnboardingCascade(row._id);
  await HrCandidate.updateOne({ _id: row.candidate, stage: 'joined' }, { $set: { stage: 'selected', updatedBy: req.user._id, updatedByName: req.user.name } });
  res.json({ success: true, message: `${row.onboardingCode} and linked employee records deleted`, deleted });
});

const recruitmentSummary = asyncHandler(async (req, res) => {
  const [pendingRequirements, activeCampaigns, upcomingInterviews, pendingOffers, activeOnboarding] = await Promise.all([
    HrHiringRequirement.countDocuments({ status: 'pending_approval' }), HrCampaign.countDocuments({ status: 'active' }),
    HrInterview.countDocuments({ status: 'scheduled', scheduledAt: { $gte: new Date() } }), HrOffer.countDocuments({ status: 'pending_approval' }),
    HrOnboarding.countDocuments({ status: { $in: ['not_started', 'in_progress'] } }),
  ]);
  res.json({ success: true, summary: { pendingRequirements, activeCampaigns, upcomingInterviews, pendingOffers, activeOnboarding } });
});

module.exports = { listRequirements, saveRequirement, deleteRequirement, requirementStatus, listJds, saveJd, deleteJd, listCampaigns, saveCampaign, deleteCampaign, saveScreening, listInterviews, saveInterview, deleteInterview, saveEvaluation, listOffers, saveOffer, deleteOffer, offerStatus, listOnboarding, createOnboarding, saveOnboarding, deleteOnboarding, updateOnboardingItem, recruitmentSummary };
