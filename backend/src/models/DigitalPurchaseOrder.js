const mongoose = require('mongoose');

// A digital purchase order (utils/digitalPo.js): the post-counselling package frozen as a purchase order, opened by
// the parent on a public link (token) where they tick the consent and sign. One per visit: "Update digital PO" puts
// the record's current package into the same one (same number, same link, version + 1); a signed version that is
// updated is kept in `history` and the parent signs the new one. ("replaced": links made before it was one per visit.) The signature file is not public (uploads/digital-po, served to staff
// only).
const digitalPurchaseOrderSchema = new mongoose.Schema(
  {
    entry: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentManagementEntry', required: true, index: true },
    // The visit's Post Counselor (their "Digital PO" page lists theirs).
    postCounselor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    ref: { type: String, trim: true, required: true },
    token: { type: String, required: true, unique: true },
    // deleted: the Post Counselor / Admin took it back before it was signed - the link stops working; the record stays.
    status: { type: String, enum: ['sent', 'signed', 'replaced', 'deleted'], default: 'sent', index: true },
    deletedAt: { type: Date, default: null },
    deletedByName: { type: String, trim: true, default: '' },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: Number, default: 1 },
    editedAt: { type: Date, default: null },
    editedByName: { type: String, trim: true, default: '' },
    // Earlier signed versions: { version, snapshot, signed, replacedAt, replacedByName } (the signature files stay).
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    expiresAt: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, trim: true, default: '' },
    replacedAt: { type: Date, default: null },
    replacedByName: { type: String, trim: true, default: '' },
    // When the parent first opened the link, and how many times.
    openedAt: { type: Date, default: null },
    openCount: { type: Number, default: 0 },
    signed: {
      type: new mongoose.Schema({
        at: Date,
        signerName: { type: String, trim: true, default: '' },
        relation: { type: String, trim: true, default: '' },
        consents: { type: [String], default: [] },
        signatureKind: { type: String, enum: ['drawn', 'photo'], default: 'drawn' },
        signatureFile: { type: String, default: '' },
        signatureMime: { type: String, default: '' },
        ip: { type: String, default: '' },
        userAgent: { type: String, default: '' },
      }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DigitalPurchaseOrder', digitalPurchaseOrderSchema);
