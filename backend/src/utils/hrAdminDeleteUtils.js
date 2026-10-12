const HrAttendance = require('../models/HrAttendance');
const HrCallRecord = require('../models/HrCallRecord');
const HrCampaign = require('../models/HrCampaign');
const HrCandidate = require('../models/HrCandidate');
const HrEmployee = require('../models/HrEmployee');
const HrInterview = require('../models/HrInterview');
const HrJobDescription = require('../models/HrJobDescription');
const HrLeaveRequest = require('../models/HrLeaveRequest');
const HrLifecycleRecord = require('../models/HrLifecycleRecord');
const HrOffer = require('../models/HrOffer');
const HrOnboarding = require('../models/HrOnboarding');
const HrTraining = require('../models/HrTraining');

const deleteEmployeeCascade = async (employeeId) => {
  const [attendance, leaves, lifecycle] = await Promise.all([
    HrAttendance.deleteMany({ employee: employeeId }),
    HrLeaveRequest.deleteMany({ employee: employeeId }),
    HrLifecycleRecord.deleteMany({ employee: employeeId }),
    HrTraining.updateMany({}, { $pull: { participants: { employee: employeeId } } }),
  ]);
  const employee = await HrEmployee.deleteOne({ _id: employeeId });
  return { employees: employee.deletedCount, attendance: attendance.deletedCount, leaves: leaves.deletedCount, lifecycle: lifecycle.deletedCount };
};

const deleteOnboardingCascade = async (onboardingId) => {
  const employees = await HrEmployee.find({ onboarding: onboardingId }).select('_id').lean();
  for (const employee of employees) await deleteEmployeeCascade(employee._id);
  const onboarding = await HrOnboarding.deleteOne({ _id: onboardingId });
  return { onboardings: onboarding.deletedCount, employees: employees.length };
};

const deleteOfferCascade = async (offerId) => {
  const onboardings = await HrOnboarding.find({ offer: offerId }).select('_id').lean();
  for (const onboarding of onboardings) await deleteOnboardingCascade(onboarding._id);
  const offer = await HrOffer.deleteOne({ _id: offerId });
  return { offers: offer.deletedCount, onboardings: onboardings.length };
};

const deleteCandidateCascade = async (candidateId) => {
  const [offers, employees] = await Promise.all([
    HrOffer.find({ candidate: candidateId }).select('_id').lean(),
    HrEmployee.find({ candidate: candidateId }).select('_id').lean(),
  ]);
  for (const offer of offers) await deleteOfferCascade(offer._id);
  for (const employee of employees) {
    if (await HrEmployee.exists({ _id: employee._id })) await deleteEmployeeCascade(employee._id);
  }
  const [calls, interviews, onboardings] = await Promise.all([
    HrCallRecord.deleteMany({ candidate: candidateId }),
    HrInterview.deleteMany({ candidate: candidateId }),
    HrOnboarding.deleteMany({ candidate: candidateId }),
  ]);
  const candidate = await HrCandidate.deleteOne({ _id: candidateId });
  return { candidates: candidate.deletedCount, calls: calls.deletedCount, interviews: interviews.deletedCount, offers: offers.length, onboardings: onboardings.deletedCount };
};

const deleteCampaignCascade = async (campaignId) => {
  const candidates = await HrCandidate.updateMany({ campaign: campaignId }, { $set: { campaign: null, campaignCode: '' } });
  const campaign = await HrCampaign.deleteOne({ _id: campaignId });
  return { campaigns: campaign.deletedCount, candidatesUnlinked: candidates.modifiedCount };
};

const deleteJobDescriptionCascade = async (jobDescriptionId) => {
  const campaigns = await HrCampaign.find({ jobDescription: jobDescriptionId }).select('_id').lean();
  for (const campaign of campaigns) await deleteCampaignCascade(campaign._id);
  const jobDescription = await HrJobDescription.deleteOne({ _id: jobDescriptionId });
  return { jobDescriptions: jobDescription.deletedCount, campaigns: campaigns.length };
};

module.exports = { deleteEmployeeCascade, deleteOnboardingCascade, deleteOfferCascade, deleteCandidateCascade, deleteCampaignCascade, deleteJobDescriptionCascade };
