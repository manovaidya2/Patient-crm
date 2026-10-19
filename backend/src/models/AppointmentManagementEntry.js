const mongoose = require('mongoose');
const callEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['connected', 'no_answer', 'follow_up'], required: true },
  notes: { type: String, trim: true, required: true, maxlength: 2000 },
  calledAt: { type: Date, required: true },
  calledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  calledByName: { type: String, required: true },
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
  consultationDate: { type: String, default: '' },
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
}, { _id: false });

const schema = new mongoose.Schema({
  postCounseling: { type: postCounselingSchema, default: undefined },
  registration: { type: registrationSchema, default: undefined },
  appointmentDate: { type: String, required: true, index: true },
  sourceAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAppointment', default: undefined, unique: true, sparse: true },
  appointmentCode: { type: String, trim: true, default: '' },
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

module.exports = mongoose.model('AppointmentManagementEntry', schema);
