const mongoose = require('mongoose');
const callEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['connected', 'no_answer', 'follow_up'], required: true },
  notes: { type: String, trim: true, required: true, maxlength: 2000 },
  calledAt: { type: Date, required: true },
  calledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  calledByName: { type: String, required: true },
  // Corrected later by the person who logged it (or the admin).
  editedAt: { type: Date, default: null },
  editedByName: { type: String, trim: true, default: '' },
});

// Reception registration, sent to a Post Counselor. One sub-document per appointment (single source of truth).
const registrationSchema = new mongoose.Schema({
  fields: { type: Map, of: String, default: {} },
  status: { type: String, enum: ['draft', 'sent'], default: 'draft' },
  savedAt: { type: Date, default: null },
  savedByName: { type: String, trim: true, default: '' },
  postCounselor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  postCounselorName: { type: String, trim: true, default: '' },
  sentAt: { type: Date, default: null },
  sentByName: { type: String, trim: true, default: '' },
  // Corrected by reception after sending (allowed until the Post Counselor saves the record).
  editedAt: { type: Date, default: null },
  editedByName: { type: String, trim: true, default: '' },
  consultationDate: { type: String, default: '' },
  // Sent back by the Post Counselor for a correction: the note reception reads. Cleared when it is sent again.
  returned: { type: new mongoose.Schema({
    reason: { type: String, trim: true, default: '', maxlength: 1000 }, at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, byName: { type: String, trim: true, default: '' },
  }, { _id: false }), default: null },
  // Every return and the re-send that answered it, kept.
  returns: { type: [new mongoose.Schema({
    reason: { type: String, trim: true, default: '', maxlength: 1000 }, at: { type: Date, default: Date.now }, byName: { type: String, trim: true, default: '' },
    resentAt: { type: Date, default: null }, resentByName: { type: String, trim: true, default: '' },
  }, { _id: false })], default: undefined },
  // Moved to another Post Counselor by the Admin / Manager (e.g. sent to the wrong person); every move is kept.
  reassignments: { type: [new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, fromName: { type: String, trim: true, default: '' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, toName: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '', maxlength: 500 }, at: { type: Date, default: Date.now }, byName: { type: String, trim: true, default: '' },
  }, { _id: false })], default: undefined },
}, { _id: false });

// "Treatment not given" moves (and restores) of a post-counselling patient; the full history is kept.
const notGivenHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['moved', 'restored'], required: true },
  kind: { type: String, default: '' },
  reason: { type: String, trim: true, default: '', maxlength: 1000 },
  at: { type: Date, default: Date.now },
  byName: { type: String, trim: true, default: '' },
}, { _id: false });

// The post-counselling record filled in by the Post Counselor (see utils/postCounselingRecord.js).
const postCounselingSchema = new mongoose.Schema({
  record: { type: mongoose.Schema.Types.Mixed, default: undefined },
  savedAt: { type: Date, default: null },
  savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  savedByName: { type: String, trim: true, default: '' },
  // Purchase order / payment details (sections F, G, H) filled after the record
  purchase: { type: mongoose.Schema.Types.Mixed, default: undefined },
  // What was decided at the end: the patient was converted, or did not buy the package
  outcome: {
    kind: { type: String, enum: ['converted', 'not_purchased'], default: undefined },
    at: { type: Date, default: null },
    byName: { type: String, trim: true, default: '' },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    packageNotBought: { type: mongoose.Schema.Types.ObjectId, ref: 'PackageNotBoughtPatient', default: null },
  },
  // On the Treatment Not Given page while active (post counselling not done / treatment not given); restorable.
  notGiven: {
    active: { type: Boolean, default: false },
    kind: { type: String, enum: ['postcounselling_not_done', 'treatment_not_given'], default: undefined },
    reason: { type: String, trim: true, default: '', maxlength: 1000 },
    at: { type: Date, default: null },
    byName: { type: String, trim: true, default: '' },
    restoredAt: { type: Date, default: null },
    restoredByName: { type: String, trim: true, default: '' },
    history: { type: [notGivenHistorySchema], default: undefined },
  },
}, { _id: false });

const schema = new mongoose.Schema({
  postCounseling: { type: postCounselingSchema, default: undefined },
  registration: { type: registrationSchema, default: undefined },
  appointmentDate: { type: String, required: true, index: true },
  sourceAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: undefined, unique: true, sparse: true },
  appointmentCode: { type: String, trim: true, default: '' },
  // Reception token of the day: given when the patient is first marked Arrived / Online, in that order, from 11.
  tokenNumber: { type: Number, default: null },
  // Booked by the PCC (after a phase was completed) instead of Reception / Sales, with a note for reception.
  bookedByRole: { type: String, trim: true, default: '' },
  bookingNote: { type: String, trim: true, default: '', maxlength: 1000 },
  tokenDate: { type: String, trim: true, default: '' },
  // Set when Reception moves a direct entry to another date
  rescheduleNote: { type: String, trim: true, default: '', maxlength: 1000 },
  rescheduledFromDate: { type: String, default: '' },
  consultationFee: { type: Number, default: null, min: 0 },
  entryAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
  acceptedByName: { type: String, trim: true, default: '' },
  salesValues: { type: Map, of: String, default: {} },
  values: { type: Map, of: String, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true, trim: true },
  updatedByName: { type: String, trim: true, default: '' },
  lastEditedAt: { type: Date, default: null },
  lastCallAt: { type: Date, default: null },
  numberOfCalls: { type: Number, default: 0, min: 0 },
  lastCallNotes: { type: String, trim: true, default: '', maxlength: 2000 },
  callHistory: { type: [callEntrySchema], default: [] },
  callStatus: { type: String, enum: ['pending', 'connected', 'no_answer', 'follow_up'], default: 'pending' },
}, { timestamps: true });

// The lists read most: patients sent to post counselling (outcome pending), Post Counseling Done, a Post Counselor's
// own rows, and a lookup by the Patient ID typed at reception (the 'values' entry of that fixed column).
schema.index({ 'registration.status': 1, 'postCounseling.outcome.kind': 1, 'registration.sentAt': -1 });
schema.index({ 'registration.postCounselor': 1, 'registration.status': 1 });
schema.index({ 'postCounseling.outcome.kind': 1, 'registration.consultationDate': -1 });
schema.index({ 'values.6abb6329297d3a5387593670': 1 }, { sparse: true });

module.exports = mongoose.model('AppointmentManagementEntry', schema);
