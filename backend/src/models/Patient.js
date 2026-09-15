const mongoose = require('mongoose');
const { ALL_CATEGORIES, CATEGORIES } = require('../constants/patientCategories');
const { STAGES, STAGE_STATUSES, ALL_STAGE_STATUSES } = require('../constants/treatmentStages');
const { PAYMENT_MODES, ALL_PAYMENT_MODES } = require('../constants/paymentModes');
const { SCHEDULE_STATUSES, ALL_SCHEDULE_STATUSES } = require('../constants/scheduleStatuses');

// One scheduled occurrence — used for both Follow-ups and Family Sessions (same shape).
// "status" only ever holds scheduled/completed/cancelled — "late"/"done late" are computed,
// never stored (see getDisplayStatus in constants/scheduleStatuses.js).
const scheduleEntrySchema = new mongoose.Schema(
  {
    dateTime: { type: Date, required: true },
    status: { type: String, enum: ALL_SCHEDULE_STATUSES, default: SCHEDULE_STATUSES.SCHEDULED },
    followUpType: { type: String, enum: ['normal', 'sfs', 'tracker'], default: 'normal' },
    notes: { type: String, trim: true, default: '' },
    createdByName: { type: String, trim: true, default: '' },
    // Filled in only when marked completed, via the "mark done" form
    completedAt: { type: Date, default: null },
    trackerSentAt: { type: Date, default: null },
    trackerSentByName: { type: String, trim: true, default: '' },
    completionName: { type: String, trim: true, default: '' },
    completionDetails: { type: String, trim: true, default: '' },
    completionFiles: {
      type: [{ url: String, fileName: String }],
      default: [],
    },
    trackerSubmissionUrl: { type: String, trim: true, default: '' },
    meetRecordingUrl: { type: String, trim: true, default: '' },
    completionFormType: { type: String, trim: true, default: '' },
    completionFormData: { type: mongoose.Schema.Types.Mixed, default: null },
    completionPdfUrl: { type: String, default: null },
    completionPdfName: { type: String, trim: true, default: '' },
    // Filled in only when cancelled, via the cancel-with-reason prompt.
    cancelReason: { type: String, trim: true, default: '' },
    cancelledAt: { type: Date, default: null },
    cancelledByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// One payment made towards a stage's package — kept as a running log so the
// paid amount always equals the sum of individual payments.
// "date" is the user-entered paid date (date only, no time).
// "createdAt" (from timestamps below) is the real moment the record was saved.
const paymentEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    paymentMode: { type: String, enum: ALL_PAYMENT_MODES, default: PAYMENT_MODES.ONLINE },
    payToBank: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    payToBankName: { type: String, trim: true, default: '' },
    utr: { type: String, trim: true, default: '' },
    transactionId: { type: String, trim: true, default: '' },
    receivedBy: { type: String, trim: true, default: '' },
    screenshotUrl: { type: String, default: null },
    screenshotFiles: {
      type: [{ url: String, fileName: String }],
      default: [],
    },
    recordedByName: { type: String, trim: true, default: '' },
    editedByName: { type: String, trim: true, default: '' },
    editedAt: { type: Date, default: null },
    // Every new payment (on a brand-new patient or one already approved) needs an
    // Admin/Doctor/Accountant to verify it before it counts as confirmed — mirrors the
    // patient-level approvalStatus gate but per payment, so an existing, already-live
    // patient doesn't get hidden just because a later payment came in.
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved'],
      default: 'approved',
      index: true,
    },
    approvedByName: { type: String, trim: true, default: '' },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const medicineRequestSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['not_requested', 'requested', 'in_process', 'made', 'sent_to_courier'],
      default: 'not_requested',
    },
    medicines: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    prescriptionUrl: { type: String, default: null },
    prescriptionFileName: { type: String, trim: true, default: '' },
    prescriptionFiles: {
      type: [{ url: String, fileName: String }],
      default: [],
    },
    requestedAt: { type: Date, default: null },
    requestedByName: { type: String, trim: true, default: '' },
    inProcessAt: { type: Date, default: null },
    inProcessByName: { type: String, trim: true, default: '' },
    madeAt: { type: Date, default: null },
    madeByName: { type: String, trim: true, default: '' },
    medicineImageUrl: { type: String, default: null },
    medicineImageFileName: { type: String, trim: true, default: '' },
    medicineImages: {
      type: [{ url: String, fileName: String }],
      default: [],
    },
    packagedByName: { type: String, trim: true, default: '' },
    chitsWrittenByName: { type: String, trim: true, default: '' },
    lastMedicineCheckedByName: { type: String, trim: true, default: '' },
    packagingDetailsFilledByName: { type: String, trim: true, default: '' },
    packagingDetailsFilledAt: { type: Date, default: null },
    sentToCourierAt: { type: Date, default: null },
    sentToCourierByName: { type: String, trim: true, default: '' },
    courier: {
      status: {
        type: String,
        enum: ['pending', 'dispatched', 'delivered'],
        default: 'pending',
      },
      receiverName: { type: String, trim: true, default: '' },
      receiverPhone: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      courierPartner: { type: String, trim: true, default: '' },
      deliveryMode: { type: String, enum: ['courier', 'self'], default: 'courier' },
      selfPickupByName: { type: String, trim: true, default: '' },
      trackingNumber: { type: String, trim: true, default: '' },
      packageImageUrl: { type: String, default: null },
      packageImageFileName: { type: String, trim: true, default: '' },
      packageImages: {
        type: [{ url: String, fileName: String }],
        default: [],
      },
      paymentPaidBy: { type: String, enum: ['clinic', 'client'], default: 'clinic' },
      paymentAmount: { type: Number, default: 0, min: 0 },
      paymentMode: { type: String, trim: true, default: '' },
      notes: { type: String, trim: true, default: '' },
      dispatchedAt: { type: Date, default: null },
      dispatchedByName: { type: String, trim: true, default: '' },
      deliveredAt: { type: Date, default: null },
      deliveredByName: { type: String, trim: true, default: '' },
      receivedByName: { type: String, trim: true, default: '' },
      deliveryProofUrl: { type: String, default: null },
      deliveryProofFileName: { type: String, trim: true, default: '' },
      deliveryProofImages: {
        type: [{ url: String, fileName: String }],
        default: [],
      },
    },
  },
  { _id: false }
);

// One entry per treatment stage — tracks status/date/notes and the package/fee for that stage
const stageEntrySchema = new mongoose.Schema(
  {
    number: { type: Number, enum: STAGES, required: true },
    status: { type: String, enum: ALL_STAGE_STATUSES, default: STAGE_STATUSES.NOT_STARTED },
    date: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
    packageName: { type: String, trim: true, default: '' },
    totalAmount: { type: Number, default: 0, min: 0 },
    postCounselor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    medicineMonthsGiven: { type: Number, default: 0, min: 0 },
    medicineExplainDate: { type: Date, default: null },
    medicineSupplyNote: { type: String, trim: true, default: '' },
    medicineNextConnectDate: { type: Date, default: null },
    medicineNextConnectNote: { type: String, trim: true, default: '' },
    medicineTakenDate: { type: Date, default: null },
    medicineFullyGiven: { type: Boolean, default: false },
    medicineConnectDone: { type: Boolean, default: false },
    medicineConnectedAt: { type: Date, default: null },
    medicineConnectedByName: { type: String, trim: true, default: '' },
    payments: { type: [paymentEntrySchema], default: [] },
    // Patient record document for this stage (report, prescription, etc.) — one at a time, latest upload wins
    recordFileUrl: { type: String, default: null },
    recordFileName: { type: String, trim: true, default: '' },
    recordFiles: {
      type: [{ url: String, fileName: String }],
      default: [],
    },
    medicineRequest: { type: medicineRequestSchema, default: () => ({}) },
    // Follow-ups and Family Sessions scheduled specifically for this stage
    followUps: { type: [scheduleEntrySchema], default: [] },
    familySessions: { type: [scheduleEntrySchema], default: [] },
  },
  { _id: false }
);

const activityEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    details: { type: String, trim: true, default: '' },
    actorName: { type: String, trim: true, default: 'System' },
    actorRole: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

const patientSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
    },
    patientCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },
    category: {
      type: String,
      enum: ALL_CATEGORIES,
      required: [true, 'Category is required'],
    },
    age: {
      type: String,
      required: [true, 'Age is required'],
      trim: true,
    },
    number: {
      type: String,
      required: [true, 'Number is required'],
      trim: true,
    },
    // Autism/ADHD only
    guardianName: {
      type: String,
      trim: true,
      required: [
        function () {
          return this.category === CATEGORIES.AUTISM_ADHD;
        },
        'Father/Mother name is required for Autism/ADHD patients',
      ],
    },
    alternateNumber: {
      type: String,
      trim: true,
      default: '',
    },
    patientHistoryBy: {
      type: String,
      trim: true,
      default: '',
    },
    // Mental Health only
    relativeName: {
      type: String,
      trim: true,
      required: [
        function () {
          return this.category === CATEGORIES.MENTAL_HEALTH;
        },
        'Relative name is required for Mental Health patients',
      ],
    },
        // Which of the 6 treatment stages the patient is currently on
    currentStage: {
      type: Number,
      enum: STAGES,
      default: 1,
    },
    // Financial/intake approval gate. Every manually-created patient (source: 'manual')
    // starts "pending" until an Admin/Doctor/Accountant reviews payments/screenshots and
    // approves it — until then it stays hidden from Assistant Doctor/Psychologist.
    // Webhook-received patients default straight to "approved" (unaffected by this gate).
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved'],
      default: 'approved',
      index: true,
    },
    approvedByName: { type: String, trim: true, default: '' },
    approvedAt: { type: Date, default: null },
    // Which Assistant Doctor this patient is currently assigned to (set by Admin/Manager/Post Counselor)
    assignedDoctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    // Which Psychologist this patient is currently assigned to (set by Admin/Manager/Post Counselor)
    assignedPsychologist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    // Per-stage detail (status, date, notes, package fee, payments, follow-ups, family sessions) for all 6 stages
    stages: {
      type: [stageEntrySchema],
      default: () =>
        STAGES.map((n) => ({
          number: n,
          status: STAGE_STATUSES.NOT_STARTED,
          date: null,
          notes: '',
          packageName: '',
          totalAmount: 0,
          postCounselor: null,
          medicineMonthsGiven: 0,
          medicineExplainDate: null,
          medicineSupplyNote: '',
          medicineNextConnectDate: null,
          medicineNextConnectNote: '',
          medicineTakenDate: null,
          medicineFullyGiven: false,
          medicineConnectDone: false,
          medicineConnectedAt: null,
          medicineConnectedByName: '',
          payments: [],
          recordFileUrl: null,
          recordFileName: '',
          medicineRequest: {},
          followUps: [],
          familySessions: [],
        })),
    },
    // De-duplication key if the source CRM resends the same webhook
    externalId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    source: {
      type: String,
      default: 'webhook',
    },
    activityLog: {
      type: [activityEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);
