const mongoose = require('mongoose');

// One message of a thread. `body` is stored encrypted (utils/chatCrypto); `kind: 'event'` lines are system notes
// (resolved, closed, forwarded) that everyone in the thread sees.
const messageSchema = new mongoose.Schema({
  kind: { type: String, enum: ['message', 'event'], default: 'message' },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  senderName: { type: String, trim: true, default: '' },
  senderRole: { type: String, trim: true, default: '' },
  body: { type: String, default: '' },
  files: { type: [{ url: String, fileName: String }], default: [] },
  // Who has opened the thread since this message (the "seen" ticks).
  readBy: { type: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: { type: String, default: '' }, at: Date }], default: [] },
  // "Delete for me": hidden for these people only.
  hiddenFor: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  // "Delete for everyone" (by the sender or the admin): the others see "This message was deleted"; the admin still
  // reads what it said.
  deletedAt: { type: Date, default: null },
  deletedByName: { type: String, trim: true, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

// Internal team chat: a one-to-one thread (a query or a discussion) between the person who raised it and the person it
// was sent to - plus anyone it is forwarded to. Only they see it; the admin sees every thread.
// A query raised from a purchase order carries the PO / patient / medicine context so the other side knows at once.
const teamChatSchema = new mongoose.Schema({
  // 'direct': the running one-to-one chat between two people (one per pair); 'query': a ticket raised inside that chat.
  kind: { type: String, enum: ['direct', 'query', 'discussion'], default: 'query', index: true },
  subject: { type: String, trim: true, default: '', maxlength: 180 },
  // The query type picked for the other person's role (constants/queryTypes.js).
  queryType: { type: String, trim: true, default: '' },
  // Both people of the pair, sorted, so the direct chat and its queries are found together.
  pairKey: { type: String, trim: true, default: '', index: true },
  status: { type: String, enum: ['open', 'resolved', 'closed'], default: 'open', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdByName: { type: String, trim: true, default: '' },
  createdByRole: { type: String, trim: true, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedToName: { type: String, trim: true, default: '' },
  assignedToRole: { type: String, trim: true, default: '' },
  participants: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], index: true },
  // Who it is about, when it is about a patient.
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientName: { type: String, trim: true, default: '' },
  patientCode: { type: String, trim: true, default: '' },
  // Where it was raised from (PO timeline / medicine job), as it stood then.
  context: {
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    poNumber: { type: String, trim: true, default: '' },
    phase: { type: Number, default: null },
    requestId: { type: String, trim: true, default: '' },
    medicineJob: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineJob', default: null },
    step: { type: String, trim: true, default: '' },
    summary: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  messages: { type: [messageSchema], default: [] },
  resolution: { type: String, trim: true, default: '', maxlength: 4000 },
  resolvedAt: { type: Date, default: null }, resolvedByName: { type: String, trim: true, default: '' },
  closedAt: { type: Date, default: null }, closedByName: { type: String, trim: true, default: '' },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  // "Delete chat" by a member: everything up to that moment is hidden for that person only (the other side and the
  // admin still see it). A newer message shows the chat again, from that point on.
  clearedBy: { type: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: Date }], default: [] },
}, { timestamps: true });

teamChatSchema.index({ participants: 1, lastMessageAt: -1 });
teamChatSchema.index({ 'context.purchaseOrder': 1, status: 1 });

module.exports = mongoose.model('TeamChat', teamChatSchema);
