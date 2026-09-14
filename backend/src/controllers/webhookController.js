const Patient = require('../models/Patient');
const CallLog = require('../models/CallLog');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { asyncHandler } = require('../middleware/errorHandler');
const { CATEGORIES, ALL_CATEGORIES, CATEGORY_LABELS } = require('../constants/patientCategories');

const RECORDING_UPLOAD_FOLDER = 'recording';

// @desc    Receive a new patient from the external CRM
// @route   POST /api/webhook/patients
// @access  Public (protected by x-webhook-secret header)
const receivePatientWebhook = asyncHandler(async (req, res) => {
  const { patientName, category, age, number, guardianName, alternateNumber, relativeName, externalId } = req.body;
  const ageText = String(age ?? '').trim();

  if (!patientName || !category || !ageText || !number) {
    return res.status(400).json({
      success: false,
      message: 'patientName, category, age and number are required',
    });
  }

  if (!ALL_CATEGORIES.includes(category)) {
    return res.status(400).json({
      success: false,
      message: `Invalid category. Allowed values: ${ALL_CATEGORIES.join(', ')}`,
    });
  }

  if (category === CATEGORIES.AUTISM_ADHD && (!guardianName || !alternateNumber)) {
    return res.status(400).json({
      success: false,
      message: 'guardianName and alternateNumber are required for Autism/ADHD patients',
    });
  }

  if (category === CATEGORIES.MENTAL_HEALTH && !relativeName) {
    return res.status(400).json({
      success: false,
      message: 'relativeName is required for Mental Health patients',
    });
  }

  // If the CRM resends the same patient (same externalId), update instead of duplicating
  if (externalId) {
    const existing = await Patient.findOne({ externalId });
    if (existing) {
      existing.patientName = patientName;
      existing.category = category;
      existing.age = ageText;
      existing.number = number;
      existing.guardianName = category === CATEGORIES.AUTISM_ADHD ? guardianName : undefined;
      existing.alternateNumber = category === CATEGORIES.AUTISM_ADHD ? alternateNumber : undefined;
      existing.relativeName = category === CATEGORIES.MENTAL_HEALTH ? relativeName : undefined;
      existing.activityLog.push({
        action: 'Patient updated from CRM webhook',
        details: externalId ? `External ID: ${externalId}` : '',
        actorName: 'CRM Webhook',
        actorRole: 'system',
      });
      await existing.save();
      return res.status(200).json({ success: true, message: 'Patient updated', patient: existing });
    }
  }

  const patient = await Patient.create({
    patientName,
    category,
    age: ageText,
    number,
    guardianName: category === CATEGORIES.AUTISM_ADHD ? guardianName : undefined,
    alternateNumber: category === CATEGORIES.AUTISM_ADHD ? alternateNumber : undefined,
    relativeName: category === CATEGORIES.MENTAL_HEALTH ? relativeName : undefined,
    externalId,
    activityLog: [
      {
        action: 'Patient received from CRM webhook',
        details: externalId ? `External ID: ${externalId}` : '',
        actorName: 'CRM Webhook',
        actorRole: 'system',
      },
    ],
  });

  res.status(201).json({ success: true, message: 'Patient received', patient });
});

const normalizePhone = (value = '') => String(value).replace(/\D/g, '');

const toDurationSeconds = (duration) => {
  if (duration === undefined || duration === null || duration === '') return 0;
  if (typeof duration === 'number') return Math.max(duration, 0);

  const value = String(duration).trim();
  if (/^\d+$/.test(value)) return Number(value);

  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const toDateOrNow = (value) => {
  if (typeof value === 'string') {
    const text = value.trim();
    const numericMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (numericMatch) {
      const [, day, month, year, hour, minute, second = '0'] = numericMatch;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    }
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      sept: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const callTimeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\s*,?\s*(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\s+(\d{2,4})$/i);
    if (callTimeMatch) {
      const [, rawHour, minute, second = '0', meridiem, day, monthName, rawYear] = callTimeMatch;
      let hour = Number(rawHour) % 12;
      if (meridiem.toLowerCase() === 'pm') hour += 12;
      const month = monthMap[monthName.toLowerCase()];
      const yearNumber = Number(rawYear);
      const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
      if (month !== undefined) {
        return new Date(year, month, Number(day), hour, Number(minute), Number(second));
      }
    }
  }
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getFileNameFromUrl = (recordingUrl) => {
  try {
    const url = new URL(recordingUrl);
    const ext = path.extname(url.pathname) || '.mp3';
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  } catch {
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}.mp3`;
  }
};

const safeRecordingHost = (recordingUrl) => {
  try {
    return new URL(recordingUrl).host;
  } catch {
    return 'invalid-url';
  }
};

const cleanRecordingUrl = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return '';

  const markdownStart = text.lastIndexOf('](');
  if (markdownStart !== -1 && text.endsWith(')')) {
    return text
      .slice(markdownStart + 2, -1)
      .replace(/\\&/g, '&')
      .replace(/\\_/g, '_')
      .trim();
  }

  const urlMatch = text.match(/https?:\/\/\S+/);
  if (!urlMatch) return text.replace(/\\&/g, '&').replace(/\\_/g, '_');

  return urlMatch[0]
    .replace(/[)\].,]+$/g, '')
    .replace(/\\&/g, '&')
    .replace(/\\_/g, '_')
    .trim();
};

const fetchRecordingBuffer = (recordingUrl, redirectCount = 0) => new Promise((resolve, reject) => {
  let url;
  try {
    url = new URL(recordingUrl);
  } catch (error) {
    reject(error);
    return;
  }

  const client = url.protocol === 'http:' ? http : https;
  const request = client.get(url, (response) => {
    const { statusCode = 0, headers } = response;

    if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location && redirectCount < 3) {
      response.resume();
      const nextUrl = new URL(headers.location, url).toString();
      fetchRecordingBuffer(nextUrl, redirectCount + 1).then(resolve).catch(reject);
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      response.resume();
      reject(new Error(`Recording download failed with HTTP ${statusCode}`));
      return;
    }

    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve(Buffer.concat(chunks)));
  });

  request.setTimeout(30000, () => request.destroy(new Error('Recording download timed out')));
  request.on('error', reject);
});

const downloadRecording = async (recordingUrl) => {
  try {
    const cleanUrl = cleanRecordingUrl(recordingUrl);
    if (!cleanUrl) return null;

    const uploadDir = path.join(__dirname, '../../uploads', RECORDING_UPLOAD_FOLDER);
    fs.mkdirSync(uploadDir, { recursive: true });

    const fileName = getFileNameFromUrl(cleanUrl);
    const filePath = path.join(uploadDir, fileName);
    const buffer = await fetchRecordingBuffer(cleanUrl);
    if (!buffer.length) {
      console.warn(`Call recording download skipped: empty file from ${safeRecordingHost(cleanUrl)}`);
      return null;
    }
    await fs.promises.writeFile(filePath, buffer);

    return {
      recordingFileUrl: `/uploads/${RECORDING_UPLOAD_FOLDER}/${fileName}`,
      recordingFileName: path.basename(new URL(cleanUrl).pathname) || fileName,
    };
  } catch (error) {
    console.warn(`Call recording download failed from ${safeRecordingHost(recordingUrl)}: ${error.message}`);
    return null;
  }
};

const removeUploadedRecording = async (file) => {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch {
    // The file may already have been removed by the upload middleware cleanup.
  }
};

const parseMaybeJson = (value, fallback) => {
  if (typeof value !== 'string') return value || fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeWebhookBody = (body) => {
  const parsedBody = parseMaybeJson(body, body) || {};
  if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
    const keys = Object.keys(parsedBody);
    if (keys.length === 1 && keys[0].trim().startsWith('{')) {
      return parseMaybeJson(keys[0], parsedBody) || parsedBody;
    }
  }
  return parsedBody;
};

const normalizeKey = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const pick = (source, keys, fallback) => {
  if (!source || typeof source !== 'object') return fallback;
  const normalizedSource = Object.entries(source).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = value;
    return acc;
  }, {});

  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') return source[key];
    const normalizedValue = normalizedSource[normalizeKey(key)];
    if (normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '') return normalizedValue;
  }
  return fallback;
};

const findPatientForCall = async ({ patientId, externalPatientId, phoneNumber }) => {
  if (patientId) {
    const patient = await Patient.findById(patientId);
    if (patient) return patient;
  }

  if (externalPatientId) {
    const patient = await Patient.findOne({ externalId: externalPatientId });
    if (patient) return patient;
  }

  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;
  const phoneTail = phone.slice(-10);

  const candidates = await Patient.find({
    $or: [
      { number: phoneNumber },
      { alternateNumber: phoneNumber },
      ...(phoneTail ? [{ number: new RegExp(`${phoneTail}$`) }, { alternateNumber: new RegExp(`${phoneTail}$`) }] : []),
    ],
  }).limit(10);

  return (
    candidates.find(
      (patient) => {
        const patientPhone = normalizePhone(patient.number);
        const alternatePhone = normalizePhone(patient.alternateNumber);
        return (
          patientPhone === phone ||
          alternatePhone === phone ||
          (phoneTail && (patientPhone.endsWith(phoneTail) || alternatePhone.endsWith(phoneTail)))
        );
      }
    ) || null
  );
};

const findExistingCallForPatient = async ({ patient, externalCallId, dedupeKey, phoneNumber, callType, normalizedTime }) => {
  if (externalCallId) {
    return CallLog.findOne({ externalCallId, patient: patient._id });
  }

  if (dedupeKey) {
    const exact = await CallLog.findOne({ dedupeKey, patient: patient._id });
    if (exact) return exact;
  }

  const phoneTail = normalizePhone(phoneNumber).slice(-10);
  if (!phoneTail || !callType || !normalizedTime) return null;

  const tenMinutes = 10 * 60 * 1000;
  const candidates = await CallLog.find({
    patient: patient._id,
    callType,
    actionCreationTime: {
      $gte: new Date(normalizedTime.getTime() - tenMinutes),
      $lte: new Date(normalizedTime.getTime() + tenMinutes),
    },
  }).sort({ actionCreationTime: -1 }).limit(10);

  const matchingCalls = candidates.filter((call) => normalizePhone(call.phoneNumber).endsWith(phoneTail));
  const withoutRecording = matchingCalls.filter((call) => !call.recordingFileUrl);
  if (withoutRecording.length === 1) return withoutRecording[0];
  if (matchingCalls.length === 1) return matchingCalls[0];
  return null;
};

// @desc    Receive calling data from an external calling system
// @route   POST /api/webhook/calls
// @access  Public (protected by x-webhook-secret header)
const receiveCallWebhook = asyncHandler(async (req, res) => {
  const rawBody = normalizeWebhookBody(req.body);
  const payload =
    parseMaybeJson(rawBody.payload, null) ||
    parseMaybeJson(rawBody.body, null) ||
    parseMaybeJson(rawBody.data, null) ||
    rawBody;
  const file = req.file || null;
  const rootFields = parseMaybeJson(payload.fields, payload.fields) || payload;
  const parsedActions = parseMaybeJson(payload.actions, payload.actions);
  const actions = Array.isArray(parsedActions) && parsedActions.length ? parsedActions : [{ fields: payload }];
  const callLogs = [];
  let ignoredActions = 0;

  for (const action of actions) {
    const actionFields = parseMaybeJson(action.fields, action.fields) || action;
    const patientId = pick(rootFields, ['patientId', 'patient_id']);
    const externalPatientId = pick(rootFields, ['externalPatientId', 'external_patient_id', 'externalId']);
    const phoneNumber = pick(rootFields, ['Phone', 'phone', 'phoneNumber', 'phone_number', 'number', 'mobile', 'alternatePhone', 'alternate_phone']);
    const patientName = pick(rootFields, ['Name', 'name', 'patientName', 'patient_name']);
    const callType = pick(actionFields, ['type', 'callType', 'call_type', 'call type']);
    const duration = pick(actionFields, ['durationSeconds', 'duration_seconds', 'duration'], '0');
    const actionCreationTime = pick(
      actionFields,
      ['creationTimestamp', 'creation timestamp', 'actionCreationTime', 'action_creation_time', 'createdTime', 'created_time'],
      new Date()
    );

    if (!callType) continue;

    const patient = await findPatientForCall({ patientId, externalPatientId, phoneNumber });
    if (!patient) {
      // A calling-system contact that is not a CRM patient must never create a
      // call row or leave an uploaded recording in local storage.
      await removeUploadedRecording(file);
      ignoredActions += 1;
      continue;
    }

    const normalizedTime = toDateOrNow(actionCreationTime);
    const externalCallId = pick(actionFields, ['externalCallId', 'external_call_id', 'callId', 'call_id']);
    const dedupeKey = externalCallId
      ? undefined
      : `${normalizePhone(phoneNumber || patientName).slice(-10) || 'unknown'}|${callType.toLowerCase()}|${normalizedTime.getTime()}`;
    const recordingUrl = cleanRecordingUrl(
      pick(actionFields, ['callRecordingUrl', 'call recording url', 'recordingUrl', 'recording_url', 'callRecording', 'call_recording'])
    );
    // Match a recording only to the same patient's exact call. This prevents a
    // later recording webhook from being attached to another patient's call.
    const existing = await findExistingCallForPatient({
      patient,
      externalCallId,
      dedupeKey,
      phoneNumber,
      callType,
      normalizedTime,
    });

    if (externalCallId && !existing) {
      const callBelongsToAnotherPatient = await CallLog.exists({ externalCallId });
      if (callBelongsToAnotherPatient) {
        await removeUploadedRecording(file);
        ignoredActions += 1;
        continue;
      }
    }

    let downloadedRecording = null;
    const canAttachRecording = Boolean(patient);

    if (file && !canAttachRecording) {
      await removeUploadedRecording(file);
    } else if (!file && recordingUrl && !existing?.recordingFileUrl) {
      downloadedRecording = await downloadRecording(recordingUrl);
    }

    const callLogData = {
      patient: patient._id,
      patientName: patient.patientName || patientName || existing?.patientName || '',
      phoneNumber: phoneNumber || existing?.phoneNumber || '',
      externalPatientId: externalPatientId || existing?.externalPatientId || '',
      dedupeKey,
      callType,
      durationSeconds: toDurationSeconds(duration),
      durationText: String(pick(actionFields, ['durationText', 'duration_text', 'duration'], '')),
      callAction: pick(actionFields, ['callAction', 'call_action', 'action'], existing?.callAction || ''),
      actionCreationTime: normalizedTime,
      recordingUrl: canAttachRecording ? (recordingUrl || existing?.recordingUrl || '') : '',
      recordingFileUrl: canAttachRecording && file
        ? `/uploads/${RECORDING_UPLOAD_FOLDER}/${file.filename}`
        : canAttachRecording ? (downloadedRecording?.recordingFileUrl || existing?.recordingFileUrl || '') : '',
      recordingFileName: canAttachRecording
        ? (file?.originalname || downloadedRecording?.recordingFileName || existing?.recordingFileName || '')
        : '',
      rawPayload: payload,
    };
    if (externalCallId) {
      callLogData.externalCallId = externalCallId;
    }

    const query = existing
      ? { _id: existing._id }
      : externalCallId
        ? { externalCallId, patient: patient._id }
        : { dedupeKey, patient: patient._id };
    const callLog = await CallLog.findOneAndUpdate(query, { $set: callLogData }, {
      new: true,
      runValidators: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    callLogs.push(callLog);

    const hadRecording = Boolean(existing?.recordingFileUrl);
    const gotRecording = Boolean(callLog.recordingFileUrl);
    patient.activityLog.push({
      action: existing ? (gotRecording && !hadRecording ? 'Call recording updated' : 'Call data updated') : 'Call data received',
      details: `${callType}${callLog.durationSeconds ? ` | ${callLog.durationSeconds}s` : ''}`,
      actorName: 'Calling Webhook',
      actorRole: 'system',
    });
    await patient.save();
  }

  if (!callLogs.length) {
    if (ignoredActions) {
      return res.status(200).json({
        success: true,
        message: 'Call ignored because its number or call identity does not match a CRM patient',
        callLogs: [],
        ignoredActions,
      });
    }

    const debugPayload = {
      contentType: req.headers['content-type'] || '',
      bodyType: typeof req.body,
      receivedBodyKeys: req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? Object.keys(req.body) : [],
      receivedRootKeys: Object.keys(rootFields || {}),
      receivedActionKeys: actions.map((action) => Object.keys((action.fields || action) || {})),
    };
    console.error('Calling webhook rejected:', debugPayload);
    return res.status(400).json({
      success: false,
      message: 'No valid call actions found',
      expected: 'Send actions[].fields.type with fields.Phone',
      ...debugPayload,
    });
  }

  res.status(201).json({
    success: true,
    message: 'Call data received',
    callLogs,
    ignoredActions,
  });
});

// @desc    List collected call logs
// @route   GET /api/webhook/calls
// @access  Private (Admin/Manager/Post Counselor)
const getCallLogs = asyncHandler(async (req, res) => {
  const pageNum = Math.max(Number(req.query.page) || 1, 1);
  const limitNum = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const query = {};

  if (req.query.callType) query.callType = req.query.callType;
  if (req.query.patientId) query.patient = req.query.patientId;
  if (req.query.search) {
    const regex = new RegExp(String(req.query.search).trim(), 'i');
    query.$or = [{ patientName: regex }, { phoneNumber: regex }, { callAction: regex }, { externalCallId: regex }];
  }
  if (req.query.from || req.query.to) {
    query.actionCreationTime = {};
    if (req.query.from) query.actionCreationTime.$gte = new Date(req.query.from);
    if (req.query.to) query.actionCreationTime.$lte = new Date(req.query.to);
  }

  const [items, total] = await Promise.all([
    CallLog.find(query)
      .populate('patient', 'patientName number category currentStage')
      .sort({ actionCreationTime: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    CallLog.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: items.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
    callLogs: items,
  });
});

module.exports = { receivePatientWebhook, receiveCallWebhook, getCallLogs, CATEGORY_LABELS };
