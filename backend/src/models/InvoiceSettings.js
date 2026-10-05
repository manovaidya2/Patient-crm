const mongoose = require('mongoose');
const DEFAULT_PARTICULARS = ['Consultation Fee', 'First Instalment - Card', 'First Instalment - Cash', 'First Instalment - Online', 'Card Processing Charge', 'Final Instalment'];
const DEFAULT_STATUSES = ['FULLY PAID', 'PARTIALLY PAID', 'UNPAID'];
const schema = new mongoose.Schema({
  _id: { type: String, default: 'final-bill' },
  paymentParticulars: { type: [String], default: () => [...DEFAULT_PARTICULARS] },
  paymentStatuses: { type: [String], default: () => [...DEFAULT_STATUSES] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
module.exports = { InvoiceSettings: mongoose.model('InvoiceSettings', schema), DEFAULT_PARTICULARS, DEFAULT_STATUSES };
