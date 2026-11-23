// Calls from the staff phones (utils/phoneCalls.js). Every phone's call app sends each call, with its recording, to
// one webhook: POST /api/phone-calls/webhook?key=<secret>. A call is kept only when its number is one the CRM has of a
// patient (father's, mother's, WhatsApp, alternate ...); any other call (personal, unknown) is dropped at once with its
// recording. The recordings are kept compressed in uploads/call-recordings/<month>/ (not public): Opus in WebM, like
// every recording in the CRM, plays in the browser; the phone's original (.amr, .m4a ...) is deleted once compressed.
// The Admin's Calls page lists them; the user name the app sends says who uses the phone.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const multer = require('multer');
const ffmpegPath = require('ffmpeg-static');
const PhoneCall = require('../models/PhoneCall');
const PhoneCallDevice = require('../models/PhoneCallDevice');
const Patient = require('../models/Patient');
const Management = require('../models/AppointmentManagementEntry');
const PackageNotBought = require('../models/PackageNotBoughtPatient');
const { asyncHandler } = require('../middleware/errorHandler');
const { RECEPTION_IDS } = require('../utils/receptionFlow');
const P = require('../utils/phoneCalls');

const DIR = path.join(__dirname, '../../uploads/call-recordings');
const INCOMING = path.join(DIR, 'incoming');
const ADMINS_ROOM = 'enquiry:admins';
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const unlink = (file) => (file ? fs.promises.unlink(file).catch(() => {}) : Promise.resolve());

// ---- The webhook ----------------------------------------------------------------------------------------------------
// One secret for every phone: CALL_APP_WEBHOOK_SECRET (or, while that is not set, the existing PATIENT_WEBHOOK_SECRET),
// in the URL (?key=) or the x-webhook-secret header. Checked before the recording is written to disk.
const webhookSecret = () => process.env.CALL_APP_WEBHOOK_SECRET || process.env.PATIENT_WEBHOOK_SECRET || '';
const sameSecret = (given, expected) => {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(a, b);
};
const verifySecret = (req, res, next) => {
  const expected = webhookSecret();
  if (!expected) return res.status(500).json({ success: false, message: 'The call webhook secret is not set on the server' });
  const given = req.headers['x-webhook-secret'] || req.query?.key || req.query?.secret;
  if (!given || !sameSecret(given, expected)) return res.status(401).json({ success: false, message: 'Invalid or missing webhook key' });
  next();
};

// The recording arrives on disk under a random name first; it is moved to its month folder only when the call is kept.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => fs.mkdir(INCOMING, { recursive: true }, (error) => cb(error, INCOMING)),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.part`),
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 3, fields: 60 },
});
const takeRecording = (req, res, next) => upload.any()(req, res, (error) => {
  if (!error) return next();
  Promise.all((req.files || []).map((f) => unlink(f.path))).finally(() => next(Object.assign(error, { statusCode: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400 })));
});

const headOf = async (file, bytes = 16) => {
  const handle = await fs.promises.open(file, 'r');
  try { const buffer = Buffer.alloc(bytes); const { bytesRead } = await handle.read(buffer, 0, bytes, 0); return buffer.subarray(0, bytesRead); }
  finally { await handle.close(); }
};
const monthOf = (date) => new Date(date.getTime() + 19800000).toISOString().slice(0, 7);
// Moves the received file to uploads/call-recordings/<YYYY-MM>/ when it really is audio; otherwise drops it.
const keepRecording = async (file, at) => {
  const originalName = P.text(file.originalname, 200);
  const type = P.audioTypeOf(await headOf(file.path));
  if (!type) { await unlink(file.path); return { originalName, error: 'The file sent with the call is not an audio recording' }; }
  const month = monthOf(at);
  await fs.promises.mkdir(path.join(DIR, month), { recursive: true });
  const name = `${month}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${type}`;
  await fs.promises.rename(file.path, path.join(DIR, name));
  return { file: name, type, mime: P.AUDIO_MIME[type], size: file.size, originalName };
};

// Who has this number: patients, reception registrations (visits) and Package Not Bought records.
const findMatches = async (tail) => {
  const re = P.tailPattern(tail);
  const visitCodePath = `values.${RECEPTION_IDS.patientId}`;
  const [patients, visits, notBought] = await Promise.all([
    Patient.find({ $or: P.PATIENT_FIELDS.map(([field]) => ({ [field]: re })) }).select('patientName patientCode number alternateNumber whatsappNumber').limit(20).lean(),
    Management.find({ $or: P.VISIT_FIELDS.map(([field]) => ({ [`registration.fields.${field}`]: re })) })
      .select(`registration.fields ${visitCodePath} postCounseling.outcome`).limit(20).lean(),
    PackageNotBought.find({ $or: P.NOT_BOUGHT_FIELDS.map(([field]) => ({ [field]: re })) }).select('patientName patientId fatherNumber motherNumber convertedPatient').limit(20).lean(),
  ]);
  return P.buildMatches({ tail, patients, visits, notBought, visitCodeOf: (v) => v.values?.[RECEPTION_IDS.patientId] || '' });
};

// The phone's row: who uses it, when it last sent, how many calls it sent / were kept / were left out.
const deviceKeyOf = (f) => (f.deviceId ? `device:${f.deviceId}` : f.userName ? `user:${f.userName.toLowerCase()}` : 'unknown');
const seen = (f, outcome, now = new Date()) => PhoneCallDevice.findOneAndUpdate(
  { key: deviceKeyOf(f) },
  {
    $set: { lastSeenAt: now, ...(f.deviceId ? { deviceId: f.deviceId } : {}), ...(f.userName ? { userName: f.userName } : {}), ...(f.userPhone ? { userPhone: f.userPhone } : {}) },
    $setOnInsert: { firstSeenAt: now },
    $inc: { received: 1, [outcome]: 1 },
  },
  { upsert: true },
).catch((error) => console.warn(`Call phone not updated: ${error.message}`));

const emitChanged = (req, id) => req.app?.get?.('io')?.to(ADMINS_ROOM).emit('phone-calls:changed', { id: String(id) });

// @route POST /api/phone-calls/webhook?key=<secret>  (multipart: the call's fields + the recording file)
const receive = asyncHandler(async (req, res) => {
  const files = req.files || [];
  const file = files.find((f) => f.fieldname === 'recording') || files.find((f) => /record|audio|file/i.test(f.fieldname)) || files[0] || null;
  await Promise.all(files.filter((f) => f !== file).map((f) => unlink(f.path)));
  const drop = () => unlink(file?.path);
  try {
    const now = new Date();
    const f = P.fieldsOf(req.body);
    const tail = P.phoneTail(f.phoneNumber);
    if (!tail) {
      await drop(); await seen(f, 'ignored', now);
      return res.json({ success: true, saved: false, reason: 'No 10-digit phone number in the call' });
    }
    const matches = await findMatches(tail);
    if (!matches.length) {
      // Not a patient's number: nothing of the call or its recording is kept.
      await drop(); await seen(f, 'ignored', now);
      return res.json({ success: true, saved: false, reason: 'The number is not a patient number in the CRM' });
    }
    const startedAt = P.startedAtOf(f.startedAtRaw, now) || now;
    const callId = f.callId || `${deviceKeyOf(f)}|${startedAt.getTime()}|${tail}`;

    // The app sent the same call again: kept once (its recording added if the first time came without one).
    const existing = await PhoneCall.findOne({ callId }).select('_id recording').lean();
    if (existing) {
      if (file && !existing.recording?.file) {
        const recording = await keepRecording(file, startedAt);
        await PhoneCall.updateOne({ _id: existing._id, 'recording.file': '' }, { $set: { recording } });
        emitChanged(req, existing._id);
        if (recording.file) compressRecording(existing._id).catch(() => {});
      } else await drop();
      return res.json({ success: true, saved: true, duplicate: true, id: String(existing._id) });
    }

    const recording = file ? await keepRecording(file, startedAt) : {};
    let doc;
    try {
      doc = await PhoneCall.create({
        callId, deviceId: f.deviceId, userName: f.userName, userPhone: f.userPhone,
        direction: P.directionOf(f.directionRaw), directionRaw: f.directionRaw, durationSec: P.durationOf(f.durationRaw),
        phoneNumber: f.phoneNumber, phoneTail: tail, startedAt, matches,
        patients: matches.filter((m) => m.patient).map((m) => m.patient), recording, receivedAt: now,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // Sent twice at the same moment: the other request kept it.
      await unlink(recording.file ? path.join(DIR, recording.file) : '');
      return res.json({ success: true, saved: true, duplicate: true });
    }
    await seen(f, 'saved', now);
    emitChanged(req, doc._id);
    if (recording.file) compressRecording(doc._id).catch(() => {});
    res.status(201).json({ success: true, saved: true, id: String(doc._id), matched: matches.length });
  } catch (error) {
    await drop();
    throw error;
  }
});

// ---- The recording, compressed --------------------------------------------------------------------------------------
// Opus 12 kbps, mono, 16 kHz in WebM: a phone call stays clear at about 110 KB a minute (an .m4a from the phone is
// usually 4-5x bigger; an .amr about the same, but it does not play in a browser). Done right after the call arrives
// (the app is answered first), or when it is first played if that did not finish. The compressed file replaces the
// original; the original stays only when it is smaller and plays as it is, or when compressing fails.
const COMPRESS_ARGS = ['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '12k', '-compression_level', '10', '-application', 'voip', '-f', 'webm'];
const runFfmpeg = (args, timeoutMs = 10 * 60000) => new Promise((resolve, reject) => {
  if (!ffmpegPath) { reject(new Error('ffmpeg is not available')); return; }
  const child = spawn(ffmpegPath, args, { windowsHide: true });
  let errorOutput = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  child.stderr.on('data', (chunk) => { errorOutput = `${errorOutput}${chunk}`.slice(-2000); });
  child.on('error', (error) => { clearTimeout(timer); reject(error); });
  child.on('close', (code) => { clearTimeout(timer); return code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${errorOutput.slice(-300)}`)); });
});
const inDir = (name) => {
  const full = path.resolve(DIR, String(name || ''));
  return name && full.startsWith(path.resolve(DIR) + path.sep) ? full : '';
};
const compressing = new Map();
const compressRecording = (id) => {
  const key = String(id);
  if (compressing.has(key)) return compressing.get(key);
  const job = (async () => {
    const doc = await PhoneCall.findById(id).select('recording').lean();
    const r = doc?.recording || {};
    if (!r.file || r.compressed) return doc;
    const source = inDir(r.file);
    if (!source || !fs.existsSync(source)) return doc;
    const sourceSize = r.size || (await fs.promises.stat(source)).size;
    const outName = r.file.replace(/\.[a-z0-9]+$/i, r.type === 'webm' ? '-c.webm' : '.webm');
    const target = inDir(outName);
    try {
      await runFfmpeg(['-y', '-i', source, ...COMPRESS_ARGS, target]);
      const size = (await fs.promises.stat(target)).size;
      const useIt = size > 0 && (size < sourceSize || !P.PLAYS_AS_IS.includes(r.type));
      if (!useIt) {
        // The phone's file is already smaller and plays as it is: it stays.
        await unlink(target);
        await PhoneCall.updateOne({ _id: id, 'recording.file': r.file }, { $set: { 'recording.compressed': true } });
        return { ...doc, recording: { ...r, compressed: true } };
      }
      const recording = { ...r, file: outName, type: 'webm', mime: 'audio/webm', size, compressed: true, originalType: r.type, originalSize: sourceSize };
      const done = await PhoneCall.updateOne({ _id: id, 'recording.file': r.file }, { $set: { recording } });
      if (!done.matchedCount) { await unlink(target); return doc; }
      await unlink(source);
      return { ...doc, recording };
    } catch (error) {
      await unlink(target);
      console.warn(`Call recording ${key} not compressed (the original is kept): ${error.message}`);
      return doc;
    }
  })().finally(() => compressing.delete(key));
  compressing.set(key, job);
  return job;
};

const istStamp = (date) => new Date(new Date(date).getTime() + 19800000).toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const fileLabel = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

// @route GET /api/phone-calls/:id/recording[?download=1]
// The recording (compressed). download=1: saved as a file.
const recordingFile = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Not found', 404);
  const found = await PhoneCall.findById(req.params.id).select('recording startedAt matches phoneTail').lean();
  if (!found?.recording?.file) fail('This call has no recording', 404);
  // Not compressed yet (the server restarted before it was done): done now.
  const recording = found.recording.compressed ? found.recording : ((await compressRecording(found._id))?.recording || found.recording);
  const doc = { ...found, recording };
  const name = recording.file;
  const full = inDir(name);
  if (!full || !fs.existsSync(full)) fail('The recording file is missing on the server', 404);
  const ext = path.extname(name).slice(1).toLowerCase();
  const mime = P.AUDIO_MIME[ext] || recording.mime || 'application/octet-stream';
  const who = fileLabel(doc.matches?.[0]?.name) || doc.phoneTail;
  res.set({
    'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${req.query?.download ? 'attachment' : 'inline'}; filename="Call-${who}-${istStamp(doc.startedAt)}.${ext}"`,
  });
  res.sendFile(full);
});

// ---- The Calls page -------------------------------------------------------------------------------------------------
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IST_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (day) => new Date(`${day}T00:00:00+05:30`);
const queryOf = (q = {}) => {
  const query = {};
  const from = IST_DAY.test(q.from || '') ? dayStart(q.from) : null;
  const to = IST_DAY.test(q.to || '') ? new Date(dayStart(q.to).getTime() + 86400000) : null;
  if (from || to) query.startedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  if (q.user) query.userName = P.text(q.user, 80);
  if (P.DIRECTIONS.includes(q.direction)) query.direction = q.direction;
  if (q.connected === '1') query.durationSec = { $gt: 0 };
  if (q.recording === '1') query['recording.file'] = { $gt: '' };
  if (mongoose.isValidObjectId(q.patient)) query.patients = new mongoose.Types.ObjectId(String(q.patient));
  const search = P.text(q.q, 80);
  if (search) {
    const digitsOnly = P.digits(search);
    if (digitsOnly.length >= 4 && digitsOnly.length === search.replace(/[\s+-]/g, '').length) query.phoneTail = new RegExp(escapeRegex(digitsOnly.slice(-10)));
    else { const re = new RegExp(escapeRegex(search), 'i'); query.$or = [{ 'matches.name': re }, { 'matches.code': re }, { userName: re }]; }
  }
  return query;
};
const viewOf = (doc) => ({
  id: String(doc._id), startedAt: doc.startedAt, direction: doc.direction, directionLabel: P.DIRECTION_LABEL[doc.direction] || 'Call',
  durationSec: doc.durationSec || 0, phoneNumber: doc.phoneNumber, userName: doc.userName || '', userPhone: doc.userPhone || '', deviceId: doc.deviceId || '',
  matches: (doc.matches || []).map((m) => ({ kind: m.kind, id: String(m.patient || m.visit || m.notBought || ''), patientId: m.patient ? String(m.patient) : '', name: m.name, code: m.code, label: m.label })),
  recording: { has: Boolean(doc.recording?.file), size: doc.recording?.size || 0, originalSize: doc.recording?.originalSize || 0, error: doc.recording?.error || '' },
});

// @route GET /api/phone-calls?from=&to=&user=&direction=&connected=1&recording=1&q=&patient=&page=
const listCalls = asyncHandler(async (req, res) => {
  const query = queryOf(req.query);
  const limit = 50;
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 1000);
  const [rows, total, byUser, devices] = await Promise.all([
    PhoneCall.find(query).select('-patients -callId -directionRaw').sort({ startedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PhoneCall.countDocuments(query),
    PhoneCall.aggregate([
      { $match: query },
      { $group: { _id: '$userName', calls: { $sum: 1 }, connected: { $sum: { $cond: [{ $gt: ['$durationSec', 0] }, 1, 0] } }, talkSec: { $sum: '$durationSec' }, last: { $max: '$startedAt' } } },
      { $sort: { calls: -1 } },
    ]),
    page === 1 ? PhoneCallDevice.find().sort({ lastSeenAt: -1 }).limit(100).lean() : [],
  ]);
  const users = byUser.map((u) => ({ userName: u._id || '', calls: u.calls, connected: u.connected, talkSec: u.talkSec, last: u.last }));
  const summary = users.reduce((s, u) => ({ calls: s.calls + u.calls, connected: s.connected + u.connected, talkSec: s.talkSec + u.talkSec }), { calls: 0, connected: 0, talkSec: 0 });
  res.json({
    success: true, items: rows.map(viewOf), total, page, pages: Math.max(Math.ceil(total / limit), 1), summary, users,
    devices: devices.map((d) => ({ key: d.key, deviceId: d.deviceId, userName: d.userName, userPhone: d.userPhone, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt, received: d.received, saved: d.saved, ignored: d.ignored })),
  });
});

// @route GET /api/phone-calls/setup - the webhook path and key to put in the call app on every phone (Admin).
const setup = asyncHandler(async (req, res) => {
  const key = webhookSecret();
  res.json({
    success: true, configured: Boolean(key), path: '/phone-calls/webhook', key,
    ownKey: Boolean(process.env.CALL_APP_WEBHOOK_SECRET),
    fields: ['callId', 'deviceId', 'direction', 'durationSec', 'phoneNumber', 'startedAt', 'userName', 'userPhone', 'recording (file)'],
  });
});

module.exports = { verifySecret, takeRecording, receive, recordingFile, listCalls, setup, compressRecording, findMatches, queryOf, viewOf, DIR };
