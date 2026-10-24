// "Treatment not given": a patient reception sent to post counselling whose post counselling did not happen, or who
// was not given treatment. They leave the Post Counseling Patients list for the Treatment Not Given page and can be
// restored. Every move and restore is kept in `history`.
const NOT_GIVEN_KINDS = {
  postcounselling_not_done: 'Post counselling not done',
  treatment_not_given: 'Treatment not given',
};

const notGivenView = (entry) => {
  const n = entry?.postCounseling?.notGiven;
  if (!n || (!n.active && !(n.history || []).length)) return null;
  return {
    active: Boolean(n.active),
    kind: n.kind || '',
    kindLabel: NOT_GIVEN_KINDS[n.kind] || '',
    reason: n.reason || '',
    at: n.at || null,
    byName: n.byName || '',
    restoredAt: n.restoredAt || null,
    restoredByName: n.restoredByName || '',
    history: (n.history || []).map((h) => ({ action: h.action, kind: h.kind || '', kindLabel: NOT_GIVEN_KINDS[h.kind] || '', reason: h.reason || '', at: h.at || null, byName: h.byName || '' })),
  };
};

module.exports = { NOT_GIVEN_KINDS, notGivenView };
