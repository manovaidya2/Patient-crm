const mongoose = require('mongoose');

// One shared notepad per patient+stage+schedule type (Follow-ups or Family Sessions) —
// not tied to a single scheduled entry. Each user only ever sees their own notes here.
const scheduleNoteSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientName: { type: String, trim: true, default: '' },
    patientCode: { type: String, trim: true, default: '' },
    stage: { type: Number, required: true },
    scheduleType: { type: String, enum: ['followup', 'family_session'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

scheduleNoteSchema.index({ patient: 1, stage: 1, scheduleType: 1, author: 1, createdAt: -1 });

module.exports = mongoose.model('ScheduleNote', scheduleNoteSchema);
