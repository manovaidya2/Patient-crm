const mongoose = require('mongoose');
const { isValidPlan } = require('../constants/supplyPlans');
const { profileSchemaFields } = require('../utils/patientProfile');
const { ALL_CATEGORIES, CATEGORIES } = require('../constants/patientCategories');
const { STAGES, STAGE_STATUSES, ALL_STAGE_STATUSES } = require('../constants/treatmentStages');
const { PAYMENT_MODES, ALL_PAYMENT_MODES } = require('../constants/paymentModes');
const { SCHEDULE_STATUSES, ALL_SCHEDULE_STATUSES } = require('../constants/scheduleStatuses');

// Treatment Delivery marks on a follow-up / family session that belongs to the phase's delivery plan
// (utils/treatmentDelivery.js). Absent on every hand-made entry, so the old follow-ups work as before.
const sessionDeliverySchema = new mongoose.Schema(
  {
    auto: { type: Boolean, default: false }, // made by the plan (not booked on request)
    key: { type: String, trim: true, default: '' }, // stable plan key: 'diet:1', 'fu:7', 'medc:2', 'fam:1'...
    template: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    components: { type: [String], default: [] },
    day: { type: Number, default: 0 }, // plan day, counted from the medicine start date
    seq: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    monthly: { type: Boolean, default: false },
    role: { type: String, trim: true, default: 'pcc' }, // who conducts it: pcc / doctor
    mode: { type: String, trim: true, default: '' },
    duration: { type: Number, default: 0 },
    onRequest: { type: Boolean, default: false },
    confirmedAt: { type: Date, default: null },
    confirmedByName: { type: String, trim: true, default: '' },
    movedAt: { type: Date, default: null }, // a person changed the date; a corrected start date no longer moves it
    missedAt: { type: Date, default: null },
    missReason: { type: String, trim: true, default: '' },
    missedByName: { type: String, trim: true, default: '' },
    rescheduledFrom: { type: String, trim: true, default: '' },
    rescheduledTo: { type: String, trim: true, default: '' },
    rescheduleReason: { type: String, trim: true, default: '' },
    // Cancelled because its component was unticked when the plan's ticks were corrected; ticking it again makes a new one.
    droppedAt: { type: Date, default: null },
    // The session console as it was closed: every line answered Done or N/A, then the closing form.
    checklist: {
      type: [new mongoose.Schema({
        key: { type: String, default: '' },
        text: { type: String, default: '' },
        section: { type: String, default: '' },
        answer: { type: String, enum: ['done', 'na'], default: 'done' },
        reason: { type: String, trim: true, default: '' },
      }, { _id: false })],
      default: [],
    },
    close: { type: mongoose.Schema.Types.Mixed, default: null },
    adviceId: { type: String, trim: true, default: '' }, // the urgent doctor query raised by a red flag
  },
  { _id: false }
);

// One scheduled occurrence — used for both Follow-ups and Family Sessions (same shape).
// "status" only ever holds scheduled/completed/cancelled — "late"/"done late" are computed,
// never stored (see getDisplayStatus in constants/scheduleStatuses.js).
const scheduleEntrySchema = new mongoose.Schema(
  {
    dateTime: { type: Date, required: true },
    status: { type: String, enum: ALL_SCHEDULE_STATUSES, default: SCHEDULE_STATUSES.SCHEDULED },
    followUpType: { type: String, enum: ['normal', 'sfs', 'tracker', 'video'], default: 'normal' },
    notes: { type: String, trim: true, default: '' },
    createdByName: { type: String, trim: true, default: '' },
    // Filled in only when marked completed, via the "mark done" form
    completedAt: { type: Date, default: null },
    // Who marked the entry done, kept as text so it survives role or account changes.
    completedByName: { type: String, default: '' },
    completedByRole: { type: String, default: '' },
    trackerSentAt: { type: Date, default: null },
    trackerSentByName: { type: String, trim: true, default: '' },
    videoRequestedAt: { type: Date, default: null },
    videoRequestedByName: { type: String, trim: true, default: '' },
    videoUrl: { type: String, trim: true, default: '' },
    videoFileName: { type: String, trim: true, default: '' },
    videoSize: { type: Number, default: 0 },
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
    // Optional, asked right after the entry is done: is the patient facing a problem or improving?
    outcome: { type: String, enum: ['', 'problem', 'improvement'], default: '' },
    outcomeNote: { type: String, trim: true, default: '' },
    outcomeAt: { type: Date, default: null },
    outcomeByName: { type: String, trim: true, default: '' },
    // Filled in only when cancelled, via the cancel-with-reason prompt.
    cancelReason: { type: String, trim: true, default: '' },
    cancelledAt: { type: Date, default: null },
    cancelledByName: { type: String, trim: true, default: '' },
    // Only on entries of the Treatment Delivery plan.
    delivery: { type: sessionDeliverySchema, default: undefined },
  },
  { timestamps: true }
);

// One payment made towards a stage's package — kept as a running log so the
// paid amount always equals the sum of individual payments.
// "date" is the user-entered paid date (date only, no time).
// "createdAt" (from timestamps below) is the real moment the record was saved.
const refundEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['initiated', 'paid', 'settled'], default: 'initiated' },
    initiatedByName: { type: String, trim: true, default: '' },
    paidByName: { type: String, trim: true, default: '' },
    paidAt: { type: Date, default: null },
    paymentMode: { type: String, enum: ['cash', 'online'], default: 'online' },
    referenceNumber: { type: String, trim: true, default: '' },
    proofFiles: { type: [{ url: String, fileName: String }], default: [] },
    payoutNote: { type: String, trim: true, default: '', maxlength: 2000 },
    settledByName: { type: String, trim: true, default: '' },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    paymentMode: { type: String, enum: ALL_PAYMENT_MODES, default: PAYMENT_MODES.ONLINE },
    payToBank: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    payToBankName: { type: String, trim: true, default: '' },
    utr: { type: String, trim: true, default: '' },
    transactionId: { type: String, trim: true, default: '' },
    // Several online transfers making up this one payment (same day); utr / transactionId hold them joined.
    utrEntries: {
      type: [{ _id: false, utr: { type: String, trim: true, default: '' }, transactionId: { type: String, trim: true, default: '' }, amount: { type: Number, min: 0, default: 0 } }],
      default: [],
    },
    receivedBy: { type: String, trim: true, default: '' },
    // paymentMode "split": the parts of this one payment (online / cash / card), same day; utr / receivedBy hold them joined.
    splits: {
      type: [{ _id: false, mode: { type: String, enum: ['online', 'cash', 'card'] }, amount: { type: Number, min: 0, default: 0 }, utr: { type: String, trim: true, default: '' }, receivedBy: { type: String, trim: true, default: '' } }],
      default: [],
    },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    screenshotUrl: { type: String, default: null },
    screenshotFiles: {
      type: [{ url: String, fileName: String }],
      default: [],
    },
    recordedByName: { type: String, trim: true, default: '' },
    // Who added it (older payments have the name only): told when the payment is cancelled.
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByName: { type: String, trim: true, default: '' },
    editedAt: { type: Date, default: null },
    // Every new payment (on a brand-new patient or one already approved) needs an
    // Admin/Doctor/Receptionist to verify it before it counts as confirmed — mirrors the
    // patient-level approvalStatus gate but per payment, so an existing, already-live
    // patient doesn't get hidden just because a later payment came in.
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'cancelled'],
      default: 'approved',
      index: true,
    },
    approvedByName: { type: String, trim: true, default: '' },
    approvedAt: { type: Date, default: null },
    cancelledByName: { type: String, trim: true, default: '' },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, default: '' },
    // The person who added a cancelled payment sees a red alert until they mark it checked.
    cancelAlertCheckedAt: { type: Date, default: null },
    cancelAlertCheckedByName: { type: String, trim: true, default: '' },
    refunds: { type: [refundEntrySchema], default: [] },
  },
  { timestamps: true }
);

const medicineRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, trim: true, default: '' },
    // Requests raised from a purchase order carry the PO and the supply category (empty on older requests).
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    poNumber: { type: String, trim: true, default: '' },
    // When this medicine was explained to the patient (kept per request, so every PO of the phase keeps its own).
    explanationDate: { type: Date, default: null },
    explainedAt: { type: Date, default: null },
    explainedByName: { type: String, trim: true, default: '' },
    // "6 months of medicine (Full 6 months) given for Rs 10,000 paid; balance Rs 30,000 on PO-5831" (at Verify payment).
    supplyNote: { type: String, trim: true, default: '' },
    // A later supply of a started phase (the "5" of 1 + 5, on its own PO): the day the patient starts THIS medicine,
    // filled by the PCC. The first supply's start date stays on stage.transit (it starts the treatment of the phase).
    medicineStartDate: { type: Date, default: null },
    medicineStartSetAt: { type: Date, default: null },
    medicineStartSetByName: { type: String, trim: true, default: '' },
    medicineStartNote: { type: String, trim: true, default: '' },
    // ...its explanation is not repeated: the PCC closes it as "already explained" or "skipped" with the start date.
    explanationSkippedAt: { type: Date, default: null },
    explanationSkippedByName: { type: String, trim: true, default: '' },
    explanationSkipReason: { type: String, enum: ['', 'already_explained', 'skipped'], default: '' },
    explanationSkipNote: { type: String, trim: true, default: '' },
    // Last correction by In Transit before Medicine Department accepted it.
    editedAt: { type: Date, default: null },
    editedByName: { type: String, trim: true, default: '' },
    supplyPlan: { type: String, validate: { validator: isValidPlan, message: 'Unknown medicine supply plan' }, default: '' },
    supplyPart: { type: String, enum: ['', 'full', 'first', 'rest'], default: '' },
    ageBand: { type: String, enum: ['', '0-3', '3-4', '4-12', '12-70', '70+'], default: '' },
    // Autism / ADHD / Autism + ADHD / Mental Health (from the patient's Sales case category).
    caseCategory: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['not_requested', 'requested', 'in_process', 'made', 'sent_to_courier', 'cancelled'],
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
    // Last date the medicine department committed to have the medicine ready by.
    readyByDate: { type: Date, default: null },
    readyBySetByName: { type: String, trim: true, default: '' },
    readyBySetAt: { type: Date, default: null },
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
    cancelledAt: { type: Date, default: null },
    cancelledByName: { type: String, trim: true, default: '' },
    cancelReason: { type: String, trim: true, default: '' },
    courier: {
      status: {
        type: String,
        enum: ['pending', 'dispatched', 'delivered', 'cancelled'],
        default: 'pending',
      },
      receiverName: { type: String, trim: true, default: '' },
      receiverPhone: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      courierPartner: { type: String, trim: true, default: '' },
      deliveryMode: { type: String, enum: ['courier', 'self', 'porter'], default: 'courier' },
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
      cancelledAt: { type: Date, default: null },
      cancelledByName: { type: String, trim: true, default: '' },
      cancelReason: { type: String, trim: true, default: '' },
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

// In-transit tracking for one phase: the steps between "PO + payment added" and "treatment activated"
// that no other screen records. Everything else (payments, medicine request, courier, explanation date)
// is read from the existing fields so both views always agree.
const transitSchema = new mongoose.Schema(
  {
    expectedReadyDate: { type: Date, default: null },
    enteredAt: { type: Date, default: null },
    dispatchScheduledAt: { type: Date, default: null },
    deliveryPlanNote: { type: String, trim: true, default: '' },
    plannedCourier: { type: String, trim: true, default: '' },
    plannedAddress: { type: String, trim: true, default: '' },
    explanationDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    explanationMode: { type: String, enum: ['', 'phone', 'video', 'clinic'], default: '' },
    preparationStartedAt: { type: Date, default: null },
    preparationStartedByName: { type: String, trim: true, default: '' },
    financialReleasedAt: { type: Date, default: null },
    financialReleasedByName: { type: String, trim: true, default: '' },
    financialReleaseNote: { type: String, trim: true, default: '' },
    // shipped: porter / courier scheduled, which one is picked at dispatch.
    fulfilmentMode: { type: String, enum: ['', 'courier', 'pickup', 'porter', 'shipped'], default: '' },
    fulfilmentSetAt: { type: Date, default: null },
    fulfilmentSetByName: { type: String, trim: true, default: '' },
    // Step 1 of the handover: In Transit marks the delivery schedule call done once a call connects.
    callsDoneAt: { type: Date, default: null },
    callsDoneByName: { type: String, trim: true, default: '' },
    // "Verify full payment": In Transit ticks that the PO paper is signed by the patient (required with the payment).
    poPaperSignedAt: { type: Date, default: null },
    poPaperSignedByName: { type: String, trim: true, default: '' },
    // Saved with the tick: how many months of medicine went for how much payment, and what is left on the PO.
    poPaperSignedNote: { type: String, trim: true, default: '' },
    pickupScheduledAt: { type: Date, default: null },
    pickupNote: { type: String, trim: true, default: '' },
    pickupScheduledByName: { type: String, trim: true, default: '' },
    explanationScheduledAt: { type: Date, default: null },
    explanationScheduledByName: { type: String, trim: true, default: '' },
    explanationAckAt: { type: Date, default: null },
    // The PCC moved the explanation (e.g. the call was not picked up) to another slot of theirs.
    explanationReschedules: {
      type: [{
        from: { type: Date, default: null },
        to: { type: Date, default: null },
        reason: { type: String, enum: ['not_picked', 'patient_request', 'other'], default: 'not_picked' },
        note: { type: String, trim: true, default: '', maxlength: 1000 },
        at: { type: Date, default: Date.now },
        byName: { type: String, trim: true, default: '' },
      }],
      default: undefined,
    },
    explanationAckByName: { type: String, trim: true, default: '' },
    explanationCompletedAt: { type: Date, default: null },
    explanationCompletedByName: { type: String, trim: true, default: '' },
    explainedByName: { type: String, trim: true, default: '' },
    explanationNote: { type: String, trim: true, default: '' },
    // Treatment started: set when the PCC fills the medicine start date (older cases: at the explanation).
    activatedAt: { type: Date, default: null },
    // The day the patient starts the medicine, filled by the PCC after the explanation (Medicine Explanations page).
    medicineStartDate: { type: Date, default: null },
    medicineStartSetAt: { type: Date, default: null },
    medicineStartSetByName: { type: String, trim: true, default: '' },
    medicineStartNote: { type: String, trim: true, default: '', maxlength: 500 },
    activatedByName: { type: String, trim: true, default: '' },
    calls: {
      type: [{
        at: { type: Date, default: Date.now },
        outcome: { type: String, enum: ['connected', 'not_reachable', 'busy', 'call_back', 'wrong_number'], required: true },
        notes: { type: String, trim: true, default: '', maxlength: 2000 },
        nextCallAt: { type: Date, default: null },
        byName: { type: String, trim: true, default: '' },
        // The In Transit step it was made on (utils/callFollowUps.js); older calls are the delivery schedule call.
        step: { type: String, enum: ['calls', 'scheduled', 'handover'], default: 'calls' },
        // The follow-up time this call answered, and how many days after it the call was made.
        dueAt: { type: Date, default: null },
        lateDays: { type: Number, default: 0 },
      }],
      default: [],
    },
    assignedAt: { type: Date, default: null },
    assignedByName: { type: String, trim: true, default: '' },
    // Admin can take a phase out of In Transit without touching any patient data.
    removedAt: { type: Date, default: null },
    removedByName: { type: String, trim: true, default: '' },
    removedReason: { type: String, trim: true, default: '' },
    // Why the ready medicine is not delivered yet, in In Transit's words (Ready, Not Delivered page).
    stuckNote: { type: String, trim: true, default: '', maxlength: 1000 },
    stuckNoteAt: { type: Date, default: null },
    stuckNoteByName: { type: String, trim: true, default: '' },
    holdActive: { type: Boolean, default: false },
    holdReason: { type: String, trim: true, default: '' },
    holdAt: { type: Date, default: null },
    holdByName: { type: String, trim: true, default: '' },
    // A phase can get its medicine in parts (1 + 5 months), each part on its own purchase order and medicine
    // request. The calls, the delivery schedule, the PO paper tick and the release above belong to ONE supply: the
    // round. When the next supply is requested the finished round is copied to `rounds` (nothing is lost) and the
    // round fields start empty again (utils/transitFlow.js beginSupplyRound).
    supplyRound: { type: Number, default: 1 },
    roundRequestId: { type: String, trim: true, default: '' },
    rounds: { type: [mongoose.Schema.Types.Mixed], default: undefined },
  },
  { _id: false }
);

// Treatment Delivery of one phase: what the Treatment & PO paper promised (section D ticks), how many months of
// medicine, and the plan made from them. The sessions themselves are ordinary follow-ups / family sessions carrying
// a `delivery` mark; this holds the rest. Absent until the paper is saved or the plan is set up.
const deliverySchema = new mongoose.Schema(
  {
    components: { type: [String], default: [] }, // ticked section D keys (utils/postCounselingRecord.js COMPONENTS)
    componentsSource: { type: String, trim: true, default: '' }, // paper / manual
    componentsSetAt: { type: Date, default: null },
    componentsSetByName: { type: String, trim: true, default: '' },
    // The medicine start date was saved but the ticks (or the months of supply) are not on record: someone must set the plan up.
    setupNeededAt: { type: Date, default: null },
    setupNeededWhy: { type: String, trim: true, default: '' },
    planMonths: { type: Number, default: 0 },
    phaseDays: { type: Number, default: 0 },
    followUpsPromised: { type: Number, default: 0 },
    // The rules as they were when this plan was first made, so a later settings change only affects new plans.
    rules: { type: mongoose.Schema.Types.Mixed, default: null },
    // Each supply of medicine covers its days of the plan from its own start date (`days`; a part saved before days were
    // kept has only `months`, a month being 30 days).
    parts: {
      type: [new mongoose.Schema({
        requestId: { type: String, trim: true, default: '' },
        poNumber: { type: String, trim: true, default: '' },
        months: { type: Number, default: 0 },
        days: { type: Number, default: 0 },
        startDate: { type: String, trim: true, default: '' }, // YYYY-MM-DD, clinic day
        offsetDays: { type: Number, default: 0 },
        source: { type: String, trim: true, default: 'transit' }, // transit (start date from Medicine Explanations) / receipt (older plans: continued on the receipt) / manual
        addedAt: { type: Date, default: null },
        addedByName: { type: String, trim: true, default: '' },
      }, { _id: false })],
      default: [],
    },
    generatedAt: { type: Date, default: null },
    generatedByName: { type: String, trim: true, default: '' },
    reschedulesUsed: { type: Number, default: 0 },
    tasks: {
      type: [new mongoose.Schema({
        key: { type: String, default: '' },
        title: { type: String, default: '' },
        day: { type: Number, default: 0 },
        dueDate: { type: Date, default: null },
        doneAt: { type: Date, default: null },
        doneByName: { type: String, trim: true, default: '' },
        note: { type: String, trim: true, default: '' },
      }, { _id: false })],
      default: [],
    },
    // Plan items left out because their day had passed when the plan was made; they can still be scheduled by hand.
    skipped: {
      type: [new mongoose.Schema({
        key: { type: String, default: '' },
        title: { type: String, default: '' },
        day: { type: Number, default: 0 },
        reason: { type: String, trim: true, default: '' },
      }, { _id: false })],
      default: [],
    },
    // What was decided for the next phase once this one is delivered: book / time / stop, with who and when.
    nextPhase: { type: mongoose.Schema.Types.Mixed, default: null },
    nextPhaseHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // "No further supply in this phase": the phase ends with the medicine on record (fewer months than the plan).
    supplyClosedAt: { type: Date, default: null },
    supplyClosedByName: { type: String, trim: true, default: '' },
    supplyClosedNote: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

// One entry per treatment stage — tracks status/date/notes and the package/fee for that stage
const stageEntrySchema = new mongoose.Schema(
  {
    number: { type: Number, enum: STAGES, required: true },
    status: { type: String, enum: ALL_STAGE_STATUSES, default: STAGE_STATUSES.NOT_STARTED },
    date: { type: Date, default: null },
    consultationDate: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
    packageName: { type: String, trim: true, default: '' },
    patientHistoryBy: { type: String, trim: true, default: '' },
    // The patient's age when this phase was bought (see utils/phaseAge.js); patient.age is the latest one.
    age: { type: String, trim: true, default: '', maxlength: 30 },
    purchaseOrder: { type: String, trim: true, default: '', maxlength: 80 },
    // The purchase order paper this phase was started with (saved when the patient was converted); see utils/purchaseOrderRecord.js
    poPaper: { type: mongoose.Schema.Types.Mixed, default: null },
    // The balance of the phase's earlier payments (added without a PO) taken into a new PO: { poId, poNumber, amount, at, byName }.
    earlierBalanceCarried: { type: mongoose.Schema.Types.Mixed, default: null },
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
    recordScanFiles: {
      type: [{
        url: String,
        fileName: String,
        uploadedAt: Date,
        uploadedByName: String,
      }],
      default: [],
    },
    recordPdfPageCount: { type: Number, default: 0, min: 0 },
    recordPdfUpdatedAt: { type: Date, default: null },
    transit: { type: transitSchema, default: () => ({}) },
    medicineRequest: { type: medicineRequestSchema, default: () => ({}) },
    medicineRequests: { type: [medicineRequestSchema], default: [] },
    // Follow-ups and Family Sessions scheduled specifically for this stage
    followUps: { type: [scheduleEntrySchema], default: [] },
    familySessions: { type: [scheduleEntrySchema], default: [] },
    delivery: { type: deliverySchema, default: undefined },
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
    centerName: { type: String, trim: true, default: '', maxlength: 120 },
    centerId: { type: String, trim: true, default: '', maxlength: 80 },
    // Child & family details from the clinical history sheet (see utils/patientProfile.js)
    ...profileSchemaFields(),
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
      default: '',
    },
        // Which of the 6 treatment stages the patient is currently on
    currentStage: {
      type: Number,
      enum: STAGES,
      default: 1,
    },
    // Financial/intake approval gate. Every manually-created patient (source: 'manual')
    // starts "pending" until an Admin/Doctor/Receptionist reviews payments/screenshots and
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
    // "Closed" cases — Admin/Doctor/Post Counselor mark a patient inactive once their
    // medicine/treatment stops. An inactive patient drops off the main patient list and
    // stops generating follow-up/family-session/medicine-connect reminders, but every
    // record stays intact and it can be reactivated any time.
    isActive: { type: Boolean, default: true, index: true },
    inactiveReason: { type: String, trim: true, default: '' },
    inactivatedByName: { type: String, trim: true, default: '' },
    inactivatedAt: { type: Date, default: null },
    reactivatedByName: { type: String, trim: true, default: '' },
    reactivatedAt: { type: Date, default: null },
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
          recordScanFiles: [],
          recordPdfPageCount: 0,
          recordPdfUpdatedAt: null,
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

// Common list/dashboard filters should use Mongo indexes instead of scanning
patientSchema.set('optimisticConcurrency', true);
// the complete patient collection before applying pagination.
patientSchema.index({ isActive: 1, createdAt: -1 });
patientSchema.index({ currentStage: 1, isActive: 1, createdAt: -1 });
patientSchema.index({ category: 1, isActive: 1, createdAt: -1 });
patientSchema.index({ assignedDoctor: 1, isActive: 1 });
patientSchema.index({ assignedPsychologist: 1, isActive: 1 });
patientSchema.index({ 'stages.medicineRequest.status': 1 });
patientSchema.index({ 'stages.medicineRequests.status': 1 });
patientSchema.index({ 'stages.followUps.dateTime': 1 });
patientSchema.index({ 'stages.familySessions.dateTime': 1 });
// Patient Improvement counts a session on the day it was done.
patientSchema.index({ 'stages.followUps.completedAt': 1 });
patientSchema.index({ 'stages.familySessions.completedAt': 1 });

// Which patient a medicine request / fulfilment job belongs to (handover checks, job views).
patientSchema.index({ 'stages.medicineRequests.requestId': 1 });
patientSchema.index({ 'stages.medicineRequest.requestId': 1 });

module.exports = mongoose.model('Patient', patientSchema);
