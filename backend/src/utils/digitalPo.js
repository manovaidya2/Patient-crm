// Digital purchase order: the post-counselling package (section C components, section E fee and payment plan) as a
// purchase order the parent opens on a public link, ticks the consent and signs (with a finger, or a photo of the
// signature). Pure rules here - no database - so they are tested (digitalPo.test.js).
//
// What the public link may show is only what is in the snapshot below: the patient's name and ID, program, age,
// phase, the parent's name, the Post Counselor's name, the components with their values and the payment plan.
// Never the phone numbers, the notes, the payment records or anything else of the patient.
const crypto = require('crypto');
const { COMPONENTS, CUSTOM_PRICE_KEY, normalizeRecord, emptyRecord } = require('./postCounselingRecord');
const { CATEGORY_LABEL } = require('./receptionFlow');

const LINK_DAYS = 30;
// The consent the parent ticks (all of them) before signing. English and Hindi, as printed on the page.
const CONSENT_ITEMS = [
  { key: 'explained', en: 'The treatment plan, its price and what is / is not included were explained to me in my language.', hi: 'इलाज की योजना, उसकी कीमत और क्या शामिल है / क्या नहीं, यह मुझे मेरी भाषा में समझाया गया है।' },
  { key: 'noGuarantee', en: 'I understand that results are not guaranteed and differ from child to child.', hi: 'मैं समझता/समझती हूँ कि परिणाम की गारंटी नहीं है और हर बच्चे में अलग हो सकते हैं।' },
  { key: 'onlyListed', en: 'Only the components listed above are included; future items are not promised.', hi: 'सिर्फ़ ऊपर लिखे components शामिल हैं; आगे की चीज़ों का वादा नहीं है।' },
  { key: 'agree', en: 'I agree to the approved program fee and payment plan above and give my consent to start the treatment.', hi: 'मैं ऊपर लिखी approved fee और payment plan से सहमत हूँ और इलाज शुरू करने की सहमति देता/देती हूँ।' },
];
const RELATIONS = ['Mother', 'Father', 'Guardian', 'Self', 'Other'];
const NOTE = 'Only doctor-selected components apply. Session counts are not additional to integrated follow-ups unless specified.';

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const money = (value) => (value === '' || value === null || value === undefined ? null : Number(value) || 0);

// The link's secret: 32 random bytes (43 characters). Unguessable; checked by shape before any lookup.
const newToken = () => crypto.randomBytes(32).toString('base64url');
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const validToken = (token) => TOKEN_SHAPE.test(String(token || ''));
const newRef = (now = new Date()) => {
  const ist = new Date(now.getTime() + 19800000).toISOString();
  return `DPO-${ist.slice(2, 4)}${ist.slice(5, 7)}${ist.slice(8, 10)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
};

// The purchase order as the parent sees and signs it, frozen when the link is made.
const snapshotOf = ({ registration, record, phase, now = new Date() }) => {
  const f = registration?.fields || {};
  const rec = normalizeRecord({ ...emptyRecord(), ...(record || {}) });
  const selected = rec.components?.selected || [];
  const components = COMPONENTS.filter((c) => selected.includes(c.key)).map((c) => {
    const value = c.key === CUSTOM_PRICE_KEY ? Number(rec.components.ayurvedicPrice || 0) : Number(c.price || 0);
    return { name: c.label, scope: c.scope || '', value };
  });
  const parts = [1, 2, 3].map((n) => ({ part: n, amount: money(rec.e?.[`part${n}Amount`]), due: money(rec.e?.[`part${n}Due`]) })).filter((p) => p.amount !== null);
  return {
    date: new Date(now.getTime() + 19800000).toISOString().slice(0, 10),
    patient: {
      name: text(f.patientName, 120), patientId: text(registration?.patientId, 40), program: CATEGORY_LABEL[f.category] || '', age: text(f.age, 20),
      parent: text(f.fatherName || f.motherName || f.primaryCaregiver, 120), phase: Number(phase) || 1, counsellor: text(registration?.postCounselorName, 120),
    },
    components,
    otherComponent: text(rec.otherComponent, 300),
    referenceValue: Number(rec.totals?.referenceValue || 0),
    concession: Number(rec.totals?.concession || 0),
    approvedFee: Number(rec.totals?.approvedProgramFee || 0),
    paymentPlan: text(rec.e?.paymentPlan, 40),
    parts,
    otherPlan: text(rec.e?.otherPlan, 500),
    note: NOTE,
  };
};

// The parent's answers on the public page: every consent ticked, a name, who they are.
const cleanSign = (body = {}) => {
  let consents = body.consents;
  if (typeof consents === 'string') { try { consents = JSON.parse(consents); } catch { consents = [consents]; } }
  consents = Array.isArray(consents) ? consents.map(String) : [];
  const missing = CONSENT_ITEMS.filter((item) => !consents.includes(item.key));
  if (missing.length) return { error: 'Please tick every consent point / सभी सहमति बिंदु टिक करें' };
  const signerName = text(body.signerName, 80);
  if (signerName.length < 2) return { error: 'Write your full name / अपना पूरा नाम लिखें' };
  const relation = RELATIONS.includes(body.relation) ? body.relation : '';
  if (!relation) return { error: 'Choose who is signing / कौन sign कर रहा है चुनें' };
  const kind = body.kind === 'photo' ? 'photo' : 'drawn';
  return { value: { consents: CONSENT_ITEMS.map((item) => item.key), signerName, relation, kind } };
};

// The signature file must really be an image (checked by its first bytes, not the name it came with).
const imageType = (buffer) => {
  if (!buffer || buffer.length < 12) return '';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return '';
};
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// Where a link stands for the parent and the staff.
const statusOf = (doc, now = new Date()) => {
  if (doc.status === 'signed') return 'signed';
  if (doc.status === 'replaced') return 'replaced';
  if (doc.status === 'deleted') return 'deleted';
  return doc.expiresAt && new Date(doc.expiresAt) < now ? 'expired' : 'sent';
};

module.exports = { LINK_DAYS, CONSENT_ITEMS, RELATIONS, NOTE, newToken, validToken, newRef, snapshotOf, cleanSign, imageType, MIME, statusOf };
