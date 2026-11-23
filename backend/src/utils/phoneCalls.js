// Calls from the staff phones (one webhook for every phone, sent by the call app after each call). Pure rules here -
// no database - so they are tested (controllers/phoneCall.test.js):
// - what the app sends (callId, deviceId, direction, durationSec, phoneNumber, startedAt, userName, userPhone) read
//   whatever the key spelling;
// - the number's last 10 digits, matched against every number the CRM has of a patient (patient: mobile, alternate,
//   WhatsApp; the reception registration: father's, mother's, WhatsApp; Package Not Bought: father's, mother's);
// - the recording checked by its first bytes (it must really be audio).
const { parseCallTimestamp } = require('./callTimestamp');

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const digits = (value) => String(value ?? '').replace(/\D/g, '');
// The last 10 digits (+91, 0 and spaces do not matter). Shorter numbers (service numbers) match nothing.
const phoneTail = (value) => { const d = digits(value); return d.length >= 10 ? d.slice(-10) : ''; };
// Finds those 10 digits at the end of a number stored in any way ("+91 98765-43210").
const tailPattern = (tail) => new RegExp(`${tail.split('').join('\\D*')}\\D*$`);
const sameTail = (stored, tail) => Boolean(tail) && phoneTail(stored) === tail;

const DIRECTIONS = ['incoming', 'outgoing', 'missed', 'rejected', 'unknown'];
const DIRECTION_LABEL = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed', rejected: 'Rejected', unknown: 'Call' };
const directionOf = (value) => {
  const s = String(value ?? '').toLowerCase();
  if (/miss/.test(s)) return 'missed';
  if (/reject|declin|block/.test(s)) return 'rejected';
  if (/out|dial/.test(s)) return 'outgoing';
  if (/in/.test(s)) return 'incoming';
  return 'unknown';
};
// Seconds; "125", 125 or "2:05" / "0:02:05". Never below 0 or above a day.
const durationOf = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  let seconds = 0;
  if (typeof value === 'number') seconds = value;
  else if (/^\d+(\.\d+)?$/.test(String(value).trim())) seconds = Number(value);
  else {
    const parts = String(value).trim().split(':').map(Number);
    if (parts.length >= 2 && parts.length <= 3 && parts.every((n) => Number.isFinite(n))) seconds = parts.reduce((total, n) => total * 60 + n, 0);
  }
  return Math.min(Math.max(Math.round(seconds) || 0, 0), 86400);
};
// When the call started; a time that cannot be read, or more than a day ahead, is left empty (the receiving time is used).
const startedAtOf = (value, now = new Date()) => {
  const numeric = typeof value === 'string' && /^\d{10,13}$/.test(value.trim()) ? Number(value.trim()) : value;
  const date = parseCallTimestamp(numeric);
  if (!date || date.getTime() > now.getTime() + 86400000 || date.getFullYear() < 2015) return null;
  return date;
};

// The app's fields, whatever the key spelling (callId / call_id / CallID ...).
const keyOf = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
const KEYS = {
  callId: ['callId', 'call_id', 'uniqueId', 'id'],
  deviceId: ['deviceId', 'device_id', 'device', 'androidId'],
  direction: ['direction', 'callType', 'call_type', 'type'],
  durationSec: ['durationSec', 'duration_sec', 'durationSeconds', 'duration'],
  phoneNumber: ['phoneNumber', 'phone_number', 'number', 'phone', 'mobile', 'contactNumber'],
  startedAt: ['startedAt', 'started_at', 'startTime', 'callTime', 'timestamp', 'time', 'date'],
  userName: ['userName', 'user_name', 'user', 'agentName', 'agent', 'staffName'],
  userPhone: ['userPhone', 'user_phone', 'agentPhone', 'simNumber'],
};
const fieldsOf = (body) => {
  let source = body;
  if (typeof source === 'string') { try { source = JSON.parse(source); } catch { source = {}; } }
  if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
  const byKey = {};
  for (const [key, value] of Object.entries(source)) byKey[keyOf(key)] = value;
  const pick = (names) => { for (const name of names) { const value = byKey[keyOf(name)]; if (value !== undefined && value !== null && String(value).trim() !== '') return value; } return ''; };
  return {
    callId: text(pick(KEYS.callId), 120), deviceId: text(pick(KEYS.deviceId), 120), directionRaw: text(pick(KEYS.direction), 40),
    durationRaw: pick(KEYS.durationSec), phoneNumber: text(pick(KEYS.phoneNumber), 40), startedAtRaw: pick(KEYS.startedAt),
    userName: text(pick(KEYS.userName), 80), userPhone: text(pick(KEYS.userPhone), 40),
  };
};

// The recording: what kind of audio it is by its first bytes (not by the name or type it came with).
const audioTypeOf = (buffer) => {
  if (!buffer || buffer.length < 12) return '';
  const ascii = (from, to) => buffer.slice(from, to).toString('latin1');
  if (ascii(0, 5) === '#!AMR') return 'amr';
  if (ascii(4, 8) === 'ftyp') return /^3g/i.test(ascii(8, 11)) ? '3gp' : 'm4a';
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
  if (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) return 'aac';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';
  return '';
};
const AUDIO_MIME = { amr: 'audio/amr', '3gp': 'audio/3gpp', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac' };
// Plays as it is in the browser (an .amr, .3gp, .ogg or .aac does not, so it is always compressed to WebM).
const PLAYS_AS_IS = ['m4a', 'mp3', 'wav', 'webm'];

// Who the number belongs to. One entry per person (a number on two of their fields shows both labels):
// patient (converted), visit (registered at reception, not converted yet) or not_bought (Package Not Bought).
const PATIENT_FIELDS = [['number', 'Mobile'], ['alternateNumber', 'Alternate mobile'], ['whatsappNumber', 'WhatsApp']];
const VISIT_FIELDS = [['fatherNumber', "Father's mobile"], ['motherNumber', "Mother's mobile"], ['whatsappNumber', 'Mobile / WhatsApp']];
const NOT_BOUGHT_FIELDS = [['fatherNumber', "Father's mobile"], ['motherNumber', "Mother's mobile"]];
const buildMatches = ({ tail, patients = [], visits = [], notBought = [], visitCodeOf = () => '' }) => {
  const people = new Map();
  const add = (key, base, label) => {
    const person = people.get(key) || { ...base, labels: [] };
    if (!person.name && base.name) person.name = base.name;
    if (!person.code && base.code) person.code = base.code;
    if (label && !person.labels.includes(label)) person.labels.push(label);
    people.set(key, person);
  };
  for (const p of patients) {
    for (const [field, label] of PATIENT_FIELDS) {
      if (sameTail(p[field], tail)) add(`patient:${p._id}`, { kind: 'patient', patient: p._id, name: text(p.patientName, 120), code: text(p.patientCode, 40) }, label);
    }
  }
  // A Package Not Bought record made from a visit is the same person as that visit.
  const keyOfNotBought = new Map();
  for (const v of visits) {
    const f = v.registration?.fields || {};
    const outcome = v.postCounseling?.outcome || {};
    const code = text(visitCodeOf(v), 40);
    const converted = outcome.kind === 'converted' && outcome.patient;
    const key = converted ? `patient:${outcome.patient}` : code ? `code:${code}` : `visit:${v._id}`;
    if (outcome.packageNotBought) keyOfNotBought.set(String(outcome.packageNotBought), key);
    for (const [field, label] of VISIT_FIELDS) {
      if (!sameTail(f[field], tail)) continue;
      if (converted) add(key, { kind: 'patient', patient: outcome.patient, name: text(f.patientName, 120), code }, label);
      else add(key, { kind: outcome.kind === 'not_purchased' ? 'not_bought' : 'visit', visit: v._id, notBought: outcome.packageNotBought || null, name: text(f.patientName, 120), code }, label);
    }
  }
  for (const n of notBought) {
    const code = text(n.patientId, 40);
    for (const [field, label] of NOT_BOUGHT_FIELDS) {
      if (!sameTail(n[field], tail)) continue;
      if (n.convertedPatient) add(`patient:${n.convertedPatient}`, { kind: 'patient', patient: n.convertedPatient, name: text(n.patientName, 120), code }, label);
      else add(keyOfNotBought.get(String(n._id)) || (code ? `code:${code}` : `nb:${n._id}`), { kind: 'not_bought', notBought: n._id, name: text(n.patientName, 120), code }, label);
    }
  }
  return [...people.values()].map(({ labels, ...person }) => ({ ...person, label: labels.join(', ') }));
};

module.exports = {
  text, digits, phoneTail, tailPattern, DIRECTIONS, DIRECTION_LABEL, directionOf, durationOf, startedAtOf, fieldsOf,
  audioTypeOf, AUDIO_MIME, PLAYS_AS_IS, buildMatches, PATIENT_FIELDS, VISIT_FIELDS, NOT_BOUGHT_FIELDS,
};
