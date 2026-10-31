const Management = require('../models/AppointmentManagementEntry');

// Reception details columns that tell the package result of the visit. They used to be typed by hand; now they are
// filled when the Post Counselor converts the patient (or marks package not purchased).
const PACKAGE_IDS = {
  offered: '6abb64b5297d3a5387593df8',
  advance: '6abb64e8297d3a5387593e2e',
  due: '6abb64f5297d3a5387593e5c',
  status: '6abb6525297d3a5387593e92',
};

const amount = (value) => String(Math.round(Number(value || 0) * 100) / 100);

// { 'values.<column id>': text } for the outcome saved on this appointment.
const packageValuesFor = (entry) => {
  const pc = entry.postCounseling || {};
  const kind = pc.outcome?.kind;
  const fee = Number(pc.purchase?.totals?.approvedProgramFee || pc.record?.totals?.approvedProgramFee || 0);
  const set = {};
  if (kind === 'converted') {
    const advance = Number(pc.purchase?.values?.amountReceivedNow || 0);
    const due = pc.purchase?.totals?.outstandingBalance ?? Math.max(fee - advance, 0);
    Object.assign(set, { [PACKAGE_IDS.offered]: amount(fee), [PACKAGE_IDS.advance]: amount(advance), [PACKAGE_IDS.due]: amount(due), [PACKAGE_IDS.status]: 'Purchased' });
  } else if (kind === 'not_purchased') {
    if (fee > 0) set[PACKAGE_IDS.offered] = amount(fee);
    set[PACKAGE_IDS.status] = 'Not Purchased';
  }
  return Object.fromEntries(Object.entries(set).map(([id, value]) => [`values.${id}`, value]));
};

// Called right after an outcome is saved. Never fails the outcome itself.
const fillReceptionPackage = async (entryId) => {
  try {
    const entry = await Management.findById(entryId).select('postCounseling').lean();
    const set = entry && packageValuesFor(entry);
    if (set && Object.keys(set).length) await Management.updateOne({ _id: entryId }, { $set: set });
  } catch (error) {
    console.error(`Reception package details could not be filled: ${error.message}`);
  }
};

// On start: appointments that already have an outcome but an empty Package Status get the details once.
const backfillReceptionPackage = async () => {
  const entries = await Management.find({
    'postCounseling.outcome.kind': { $in: ['converted', 'not_purchased'] },
    [`values.${PACKAGE_IDS.status}`]: { $in: [null, ''] },
  }).select('postCounseling').lean();
  let count = 0;
  for (const entry of entries) {
    const set = packageValuesFor(entry);
    if (Object.keys(set).length) { await Management.updateOne({ _id: entry._id }, { $set: set }); count += 1; }
  }
  return count;
};

module.exports = { PACKAGE_IDS, packageValuesFor, fillReceptionPackage, backfillReceptionPackage };
