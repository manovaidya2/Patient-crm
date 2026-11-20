const mongoose = require('mongoose');

// A leave marked on a PCC's calendar (Care Schedule): by the PCC themself or by the Manager / Admin. On those days
// the PCC's follow-ups / family sessions show a leave alert and the Manager gives them to someone else.
// A removed leave is kept (removedAt) for the record.
const staffLeaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, trim: true, default: '' },
    from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    to: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, trim: true, default: '', maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, trim: true, default: '' },
    removedAt: { type: Date, default: null },
    removedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

staffLeaveSchema.index({ user: 1, from: 1, to: 1 });

module.exports = mongoose.model('StaffLeave', staffLeaveSchema);
