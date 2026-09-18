const ScheduleNote = require('../models/ScheduleNote');
const Patient = require('../models/Patient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { STAGES } = require('../constants/treatmentStages');

// Same assignment/approval rule used everywhere else a schedule entry is touched —
// Assistant Doctor/Psychologist only for their own approved, assigned patients.
const canAccessPatient = (user, patient) => {
  if (user.role !== ROLES.ASSISTANT_DOCTOR && user.role !== ROLES.PSYCHOLOGIST) return true;
  if ((patient.approvalStatus || 'approved') !== 'approved') return false;
  const assignment = user.role === ROLES.ASSISTANT_DOCTOR ? patient.assignedDoctor : patient.assignedPsychologist;
  if (!assignment) return false;
  return String(assignment._id || assignment) === String(user._id);
};

const formatNote = (note) => ({
  id: note._id,
  text: note.text,
  authorName: note.authorName,
  createdAt: note.createdAt,
});

// One shared notepad per patient+stage+schedule type (not tied to a single scheduled
// entry) — every user only ever sees their own notes here, newest first.
const listNotesFor = (patientId, scheduleType, stageNum, authorId) =>
  ScheduleNote.find({ patient: patientId, scheduleType, stage: stageNum, author: authorId })
    .sort({ createdAt: -1 })
    .lean()
    .then((rows) => rows.map(formatNote));

const loadPatientForAccess = async (req, res) => {
  const patient = await Patient.findById(req.params.id)
    .select('patientName patientCode assignedDoctor assignedPsychologist approvalStatus')
    .lean();
  if (!patient) {
    res.status(404).json({ success: false, message: 'Patient not found' });
    return null;
  }
  if (!canAccessPatient(req.user, patient)) {
    res.status(403).json({ success: false, message: 'This patient is not assigned to you' });
    return null;
  }
  return patient;
};

const listScheduleNotes = (scheduleType) =>
  asyncHandler(async (req, res) => {
    const stageNum = parseInt(req.params.number, 10);
    if (!STAGES.includes(stageNum)) {
      return res.status(400).json({ success: false, message: 'Invalid stage number' });
    }

    const patient = await loadPatientForAccess(req, res);
    if (!patient) return;

    const notes = await listNotesFor(patient._id, scheduleType, stageNum, req.user._id);
    res.status(200).json({ success: true, notes });
  });

const addScheduleNote = (scheduleType) =>
  asyncHandler(async (req, res) => {
    const text = String(req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }

    const stageNum = parseInt(req.params.number, 10);
    if (!STAGES.includes(stageNum)) {
      return res.status(400).json({ success: false, message: 'Invalid stage number' });
    }

    const patient = await loadPatientForAccess(req, res);
    if (!patient) return;

    await ScheduleNote.create({
      patient: patient._id,
      patientName: patient.patientName,
      patientCode: patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`,
      stage: stageNum,
      scheduleType,
      text,
      author: req.user._id,
      authorName: req.user.name,
    });

    const notes = await listNotesFor(patient._id, scheduleType, stageNum, req.user._id);
    res.status(201).json({ success: true, notes });
  });

const deleteScheduleNote = (scheduleType) =>
  asyncHandler(async (req, res) => {
    const stageNum = parseInt(req.params.number, 10);
    const note = await ScheduleNote.findOne({ _id: req.params.noteId, scheduleType, stage: stageNum });
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }
    if (String(note.author) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You can only delete your own notes' });
    }

    await note.deleteOne();
    const notes = await listNotesFor(note.patient, scheduleType, stageNum, req.user._id);
    res.status(200).json({ success: true, notes });
  });

module.exports = { listScheduleNotes, addScheduleNote, deleteScheduleNote };
