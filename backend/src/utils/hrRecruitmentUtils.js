const REQUIREMENT_TRANSITIONS = {
  draft: ['pending_approval'], rejected: ['pending_approval'], pending_approval: ['approved', 'rejected'], approved: ['closed'], closed: [],
};
const OFFER_TRANSITIONS = {
  draft: ['pending_approval', 'withdrawn'], rejected: ['pending_approval', 'withdrawn'],
  pending_approval: ['approved', 'rejected'], approved: ['sent', 'withdrawn'], sent: ['accepted', 'declined', 'expired', 'withdrawn'],
  accepted: [], declined: [], expired: [], withdrawn: [],
};

const canTransition = (map, from, to) => Boolean(map[from]?.includes(to));
const hasFullAccess = (role) => ['admin', 'manager', 'doctor'].includes(role);
const canEditOffer = (role, status) => hasFullAccess(role)
  ? true
  : role === 'hr' && ['draft', 'rejected'].includes(status);
const canManageOfferTransition = (role, next) => ['approved', 'rejected'].includes(next)
  ? hasFullAccess(role)
  : role === 'hr';
const nextInterviewRound = (previousRound, existingCount) => Math.max(Number(previousRound) || 1, Number(existingCount) || 0) + 1;
const offerCompensation = (monthlyValue, annualValue) => {
  const monthlyGross = Number(monthlyValue);
  const hasAnnual = String(annualValue ?? '').trim() !== '';
  const annualCtc = hasAnnual ? Number(annualValue) : monthlyGross * 12;
  if (!Number.isFinite(monthlyGross) || monthlyGross <= 0 || !Number.isFinite(annualCtc) || annualCtc < 0) return null;
  return { monthlyGross, annualCtc };
};
const interviewChainMetadata = (rows) => {
  const groups = new Map();
  rows.forEach((row) => {
    const candidateId = String(row.candidate);
    if (!groups.has(candidateId)) groups.set(candidateId, []);
    groups.get(candidateId).push(row);
  });
  const metadata = new Map();
  groups.forEach((group) => {
    group.sort((a, b) => new Date(a.createdAt || a.scheduledAt) - new Date(b.createdAt || b.scheduledAt));
    group.forEach((row, index) => {
      const prior = group[index - 1];
      const inferredPrevious = !row.previousInterview && prior?.evaluation?.recommendation === 'next_round' ? String(prior._id) : '';
      metadata.set(String(row._id), {
        previousInterviewId: row.previousInterview ? String(row.previousInterview) : inferredPrevious,
        roundNumber: Number(row.roundNumber) > 1 ? Number(row.roundNumber) : index + 1,
      });
    });
  });
  const parents = new Set([...metadata.values()].map((entry) => entry.previousInterviewId).filter(Boolean));
  metadata.forEach((entry, id) => { entry.hasNextRound = parents.has(id); });
  return metadata;
};
const splitList = (value, maxItems = 30) => (Array.isArray(value) ? value : String(value || '').split(/[,\n]/))
  .map((entry) => String(entry).trim()).filter(Boolean).slice(0, maxItems);
const validDateKey = (value, optional = false) => {
  if (optional && !value) return true;
  const key = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key;
};

module.exports = { REQUIREMENT_TRANSITIONS, OFFER_TRANSITIONS, canTransition, canEditOffer, canManageOfferTransition, nextInterviewRound, offerCompensation, interviewChainMetadata, splitList, validDateKey };
