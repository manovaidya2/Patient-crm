// Digital purchase order (utils/digitalPo.js). The Post Counselor makes it from the saved post-counselling record
// (postCounselingRecordController.createDigitalPo); the parent opens the public link, ticks the consent and signs.
// The public side answers only by the link's secret and shows only the frozen purchase order - nothing else of the
// patient. The signature file is kept out of the public /uploads folder and served to logged-in staff only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const DigitalPurchaseOrder = require('../models/DigitalPurchaseOrder');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const D = require('../utils/digitalPo');

const DIR = path.join(__dirname, '../../uploads/digital-po');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const dbUp = () => mongoose.connection.readyState === 1;

// ---- Staff side ------------------------------------------------------------------------------------------------------
const signedView = (signed) => (signed?.at ? {
  at: signed.at, signerName: signed.signerName, relation: signed.relation, consents: signed.consents || [],
  signatureKind: signed.signatureKind, hasSignature: Boolean(signed.signatureFile),
} : null);
const staffView = (doc, now = new Date()) => {
  const status = D.statusOf(doc, now);
  return {
    id: String(doc._id), ref: doc.ref, status, token: status === 'sent' ? doc.token : '',
    snapshot: doc.snapshot, createdAt: doc.createdAt, createdByName: doc.createdByName || '', expiresAt: doc.expiresAt,
    openedAt: doc.openedAt || null, openCount: doc.openCount || 0, replacedAt: doc.replacedAt || null, replacedByName: doc.replacedByName || '',
    version: doc.version || 1, editedAt: doc.editedAt || null, editedByName: doc.editedByName || '',
    deletedAt: doc.deletedAt || null, deletedByName: doc.deletedByName || '',
    signed: signedView(doc.signed),
    history: (doc.history || []).map((h) => ({ version: h.version, snapshot: h.snapshot, signed: signedView(h.signed), replacedAt: h.replacedAt || null, replacedByName: h.replacedByName || '' })),
  };
};
// The digital purchase orders of one post-counselling visit, newest first (with the consent wording for the paper).
const digitalPosOf = async (entryId) => {
  if (!dbUp() || !entryId) return { items: [], consentItems: D.CONSENT_ITEMS };
  const rows = await DigitalPurchaseOrder.find({ entry: entryId }).sort({ createdAt: -1 }).limit(20).lean();
  return { items: rows.map((row) => staffView(row)), consentItems: D.CONSENT_ITEMS };
};

// One digital purchase order per visit. The first time it is made; after that the same one (same number, same link)
// gets the record's current package: version + 1 when something changed, and the link works 30 days again. A signed
// one that changed goes back to "waiting" (the parent signs again on the same link); the signed version is kept in
// `history`. Returns { doc, action: created | updated | extended | resign }.
const sameContent = (a = {}, b = {}) => { const strip = ({ date, ...rest } = {}) => rest; return JSON.stringify(strip(a)) === JSON.stringify(strip(b)); };
const saveForEntry = async ({ entry, registration, phase, user, now = new Date() }) => {
  if (!entry.postCounseling?.savedAt || !entry.postCounseling?.record) fail('Save the post-counselling record first');
  const snapshot = D.snapshotOf({ registration, record: entry.postCounseling.record, phase, now });
  if (!snapshot.components.length) fail('Select the treatment components first');
  if (!(snapshot.approvedFee > 0)) fail('The approved program fee is Rs 0');
  const expiresAt = new Date(now.getTime() + D.LINK_DAYS * 86400000);
  const current = await DigitalPurchaseOrder.findOne({ entry: entry._id, status: { $nin: ['replaced', 'deleted'] } }).sort({ createdAt: -1 }).lean();
  if (!current) {
    const doc = await DigitalPurchaseOrder.create({
      entry: entry._id, postCounselor: entry.registration?.postCounselor || null, ref: D.newRef(now), token: D.newToken(), snapshot, expiresAt,
      version: 1, createdBy: user._id, createdByName: user.name,
    });
    return { doc, action: 'created' };
  }
  const unchanged = sameContent(current.snapshot, snapshot);
  const version = current.version || 1;
  if (current.status === 'signed' && unchanged) fail('Nothing changed in the record since the parent signed: the signed purchase order stands. Change sections C / E and save first.');
  const update = { $set: { snapshot, expiresAt, editedAt: now, editedByName: user.name, ...(unchanged ? {} : { version: version + 1 }) } };
  if (current.status === 'signed') {
    Object.assign(update.$set, { status: 'sent', openedAt: null, openCount: 0 });
    update.$unset = { signed: 1 };
    update.$push = { history: { version, snapshot: current.snapshot, signed: current.signed, replacedAt: now, replacedByName: user.name } };
  }
  const doc = await DigitalPurchaseOrder.findOneAndUpdate({ _id: current._id, status: current.status }, update, { new: true });
  if (!doc) fail('The parent has just signed this purchase order. Press "Check again" and look before updating it.', 409);
  return { doc, action: current.status === 'signed' ? 'resign' : unchanged ? 'extended' : 'updated' };
};

// The visit's digital purchase order is taken back before the parent signed: the link stops working at once (the
// record is kept, marked deleted). A signed one is the parent's consent and is not deleted (Update changes it).
const deleteForEntry = async ({ entry, user, now = new Date() }) => {
  const current = await DigitalPurchaseOrder.findOne({ entry: entry._id, status: { $nin: ['replaced', 'deleted'] } }).sort({ createdAt: -1 }).lean();
  if (!current) fail('There is no digital purchase order to delete', 404);
  if (current.status === 'signed') fail('The parent has signed this purchase order: it is their consent and is not deleted. Use "Update digital PO" to change it.', 409);
  const doc = await DigitalPurchaseOrder.findOneAndUpdate({ _id: current._id, status: 'sent' }, { $set: { status: 'deleted', deletedAt: now, deletedByName: user.name } }, { new: true });
  if (!doc) fail('The parent has just signed this purchase order. Press "Check again".', 409);
  return doc;
};

// @route GET /api/digital-po?view=signed|waiting|all&q=&from=&to=   (staff)  - the "Digital PO" page: the purchase orders
// the parents submitted (signed), the links still waiting for a signature, or all. A Post Counselor sees their own.
const VIEWS = ['signed', 'waiting', 'all'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const listDigitalPos = asyncHandler(async (req, res) => {
  const now = new Date();
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'signed';
  const mine = req.user.role === ROLES.POST_COUNSELOR ? { $or: [{ postCounselor: req.user._id }, { createdBy: req.user._id }] } : {};
  const waiting = { status: 'sent', expiresAt: { $gt: now } };
  const filter = { ...mine, ...(view === 'signed' ? { status: 'signed' } : view === 'waiting' ? waiting : {}) };
  const and = [];
  const q = text(req.query.q, 80);
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({ $or: [{ ref: rx }, { 'snapshot.patient.name': rx }, { 'snapshot.patient.patientId': rx }, { 'signed.signerName': rx }] });
  }
  // From / to (India days): when it was signed (Submitted), else when the link was made.
  const field = view === 'signed' ? 'signed.at' : 'createdAt';
  const range = {};
  if (DAY.test(String(req.query.from || ''))) range.$gte = new Date(`${req.query.from}T00:00:00+05:30`);
  if (DAY.test(String(req.query.to || ''))) range.$lte = new Date(`${req.query.to}T23:59:59.999+05:30`);
  if (Object.keys(range).length) and.push({ [field]: range });
  if (and.length) filter.$and = and;
  const [rows, signed, open] = await Promise.all([
    DigitalPurchaseOrder.find(filter).sort(view === 'signed' ? { 'signed.at': -1 } : { createdAt: -1 }).limit(500).lean(),
    DigitalPurchaseOrder.countDocuments({ ...mine, status: 'signed' }),
    DigitalPurchaseOrder.countDocuments({ ...mine, ...waiting }),
  ]);
  res.json({ success: true, items: rows.map((row) => ({ ...staffView(row, now), entryId: String(row.entry) })), counts: { signed, waiting: open }, consentItems: D.CONSENT_ITEMS });
});

// @route GET /api/digital-po/:id/signature   (staff)  - the parent's signature image.
// ?version=N: an earlier signed version's signature.
const signatureFile = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Not found', 404);
  const doc = await DigitalPurchaseOrder.findById(req.params.id).select('signed history version').lean();
  const asked = Number(req.query?.version) || 0;
  const signed = asked && asked !== (doc?.version || 1) ? (doc?.history || []).find((h) => h.version === asked)?.signed : doc?.signed;
  const name = signed?.signatureFile ? path.basename(signed.signatureFile) : '';
  const file = name ? path.join(DIR, name) : '';
  if (!file || !fs.existsSync(file)) fail('Signature not found', 404);
  res.set('Cache-Control', 'private, no-store');
  res.type(signed.signatureMime || 'image/png');
  res.sendFile(file);
});

// ---- Public side (no login) ------------------------------------------------------------------------------------------
// A small brake per network address, so the links cannot be tried in bulk.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 60;
const hits = new Map();
const clientIp = (req) => text(String(req.headers?.['x-forwarded-for'] || '').split(',')[0] || req.ip || req.socket?.remoteAddress, 60);
const publicGuard = (req, res, next) => {
  const ip = clientIp(req);
  const now = Date.now();
  if (hits.size > 5000) hits.forEach((hit, key) => { if (now - hit.start > WINDOW_MS) hits.delete(key); });
  const hit = hits.get(ip);
  if (!hit || now - hit.start > WINDOW_MS) hits.set(ip, { start: now, count: 1 });
  else if ((hit.count += 1) > MAX_HITS) return next(Object.assign(new Error('Too many tries. Please wait a few minutes and open the link again.'), { statusCode: 429 }));
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  return next();
};
const NOT_VALID = 'This link is not valid. Please ask the clinic for the link again. / यह link सही नहीं है, clinic से दोबारा link माँगें।';
const findByToken = async (token) => {
  if (!D.validToken(token)) fail(NOT_VALID, 404);
  const doc = await DigitalPurchaseOrder.findOne({ token }).lean();
  if (!doc) fail(NOT_VALID, 404);
  return doc;
};
// Only the frozen purchase order, and only while it can be signed. After that: just where it stands.
const publicView = (doc, now = new Date()) => {
  const status = D.statusOf(doc, now);
  const base = { success: true, status, ref: doc.ref };
  if (status === 'sent') return { ...base, version: doc.version || 1, snapshot: doc.snapshot, consentItems: D.CONSENT_ITEMS, relations: D.RELATIONS };
  if (status === 'signed') return { ...base, signedAt: doc.signed?.at || null };
  return base;
};

// @route GET /api/digital-po/public/:token
const getPublic = asyncHandler(async (req, res) => {
  const doc = await findByToken(req.params.token);
  if (D.statusOf(doc) === 'sent') {
    await DigitalPurchaseOrder.updateOne({ _id: doc._id }, { $inc: { openCount: 1 }, ...(doc.openedAt ? {} : { $set: { openedAt: new Date() } }) });
  }
  res.json(publicView(doc));
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 12, fieldSize: 4000 } }).single('signature');
const takeSignature = (req, res, next) => upload(req, res, (error) => (error
  ? next(Object.assign(new Error(error.code === 'LIMIT_FILE_SIZE' ? 'The photo is too big (6 MB at most) / photo बहुत बड़ी है' : 'Could not read the signature, please try again'), { statusCode: 400 }))
  : next()));

// @route POST /api/digital-po/public/:token/sign   (multipart: signature image + consents, signerName, relation, kind)
const signPublic = asyncHandler(async (req, res) => {
  const doc = await findByToken(req.params.token);
  const status = D.statusOf(doc);
  if (status === 'signed') fail('This purchase order is already signed. / यह पहले ही sign हो चुका है।', 409);
  if (status === 'expired') fail('This link has expired. Please ask the clinic for a new link. / Link की अवधि ख़त्म, clinic से नया link माँगें।', 410);
  if (status === 'replaced') fail('This link was replaced by a newer one. Please use the latest link from the clinic. / नया link इस्तेमाल करें।', 410);
  if (status === 'deleted') fail('This link is no longer active. Please contact the clinic. / यह link अब चालू नहीं है, clinic से संपर्क करें।', 410);
  // The clinic updated the purchase order while the parent had the page open: they read the new one first.
  if (req.body?.version && Number(req.body.version) !== (doc.version || 1)) fail('The clinic has just updated this purchase order. Please reload the page and read it again. / PO update हुआ है, page reload करके दोबारा पढ़ें।', 409);
  const { value, error } = D.cleanSign(req.body);
  if (error) fail(error);
  if (!req.file?.buffer?.length) fail('Sign in the box, or upload a photo of your signature / box में sign करें या signature की photo डालें');
  const type = D.imageType(req.file.buffer);
  if (!type) fail('The signature must be an image (JPG / PNG) / signature photo JPG या PNG होनी चाहिए');
  await fs.promises.mkdir(DIR, { recursive: true });
  const name = `${doc._id}-${crypto.randomBytes(8).toString('hex')}.${type}`;
  await fs.promises.writeFile(path.join(DIR, name), req.file.buffer);
  const now = new Date();
  const claimed = await DigitalPurchaseOrder.findOneAndUpdate(
    { _id: doc._id, status: 'sent', expiresAt: { $gt: now }, ...(doc.version ? { version: doc.version } : {}) },
    { $set: { status: 'signed', signed: { at: now, ...value, signatureKind: value.kind, signatureFile: name, signatureMime: D.MIME[type], ip: clientIp(req), userAgent: text(req.headers?.['user-agent'], 300) } } },
    { new: true },
  );
  if (!claimed) {
    await fs.promises.unlink(path.join(DIR, name)).catch(() => {});
    fail('This link was already used. / यह link पहले ही इस्तेमाल हो चुका है।', 409);
  }
  // The Post Counselor's open screens reload (the signed paper shows under the record).
  try {
    const io = req.app?.get?.('io');
    if (io) {
      const Management = require('../models/AppointmentManagementEntry');
      const { postCounselingUserRoom, POST_COUNSELING_ALL_ROOM } = require('../realtime/salesSheetSocket');
      const entry = await Management.findById(doc.entry).select('registration.postCounselor').lean();
      io.to(postCounselingUserRoom(entry?.registration?.postCounselor)).to(POST_COUNSELING_ALL_ROOM).emit('post-counseling:changed', { id: String(doc.entry) });
    }
  } catch (e) { /* telling the screens is extra */ }
  res.json({ success: true, status: 'signed', signedAt: now, ref: doc.ref });
});

module.exports = { digitalPosOf, saveForEntry, deleteForEntry, listDigitalPos, signatureFile, publicGuard, getPublic, takeSignature, signPublic, staffView, publicView, DIR };
