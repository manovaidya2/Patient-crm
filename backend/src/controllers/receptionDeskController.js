const SalesAppointment = require('../models/SalesAppointment');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const SalesSheetColumn = require('../models/SalesSheetColumn');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const { asyncHandler } = require('../middleware/errorHandler');
const { SALES_IDS, RECEPTION_IDS } = require('../utils/receptionFlow');

// Reception "Today's desk": the day's appointments as lanes - to accept, expected, in clinic, done - read from the
// sales sheet and appointment management records. Nothing is stored here; it only reads.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const mapOf = (value) => (value instanceof Map ? Object.fromEntries(value) : value || {});

const person = (values, timeColumnId) => {
  const v = mapOf(values);
  return {
    name: v[SALES_IDS.patientName] || 'Unnamed',
    age: v[SALES_IDS.age] || '',
    guardian: v[SALES_IDS.guardianName] || '',
    phone: v[SALES_IDS.fatherNumber] || v[SALES_IDS.motherNumber] || '',
    city: v[SALES_IDS.city] || '',
    category: v[SALES_IDS.caseCategory] || '',
    time: timeColumnId ? v[timeColumnId] || '' : '',
  };
};

// @route GET /api/reception/desk?date=YYYY-MM-DD
const getDesk = asyncHandler(async (req, res) => {
  const date = DATE.test(String(req.query.date || '')) ? req.query.date : istToday();
  const [sales, managed, timeColumn] = await Promise.all([
    SalesAppointment.find({ appointmentDate: date }).select('-callHistory -salesCallHistory').lean(),
    AppointmentManagementEntry.find({ appointmentDate: date }).select('-callHistory').lean(),
    SalesSheetColumn.findOne({ type: 'time', isActive: true }).sort({ order: 1 }).select('_id').lean(),
  ]);
  const timeId = timeColumn ? String(timeColumn._id) : '';
  const dayStart = new Date(`${date}T00:00:00.000+05:30`);
  const dayEnd = new Date(`${date}T23:59:59.999+05:30`);
  const receipts = await ConsultationReceipt.find({ createdAt: { $gte: dayStart, $lte: dayEnd }, status: { $ne: 'cancelled' } }).select('amount status').lean();

  const card = (row, values, extra) => ({ id: String(row._id), code: row.appointmentCode || '', bookedBy: row.createdByName || '', ...person(values, timeId), ...extra });
  const managedBySource = new Set(managed.map((m) => String(m.sourceAppointment || '')));
  const lanes = { toAccept: [], expected: [], inClinic: [], done: [] };

  for (const s of sales) {
    if (s.status === 'not_coming') { lanes.done.push(card(s, s.values, { state: 'not_coming', note: s.notComingReason || '', href: '/admin/appointment-management' })); continue; }
    if (s.status === 'rescheduled') { lanes.done.push(card(s, s.values, { state: 'rescheduled', note: s.rescheduledTo ? `to ${s.rescheduledTo}` : '', href: '/admin/appointment-management' })); continue; }
    if (!s.acceptedAt) lanes.toAccept.push(card(s, s.values, { state: 'pending_acceptance', calls: s.numberOfCalls || 0, href: '/sales' }));
    else if (!managedBySource.has(String(s._id))) lanes.expected.push(card(s, s.values, { state: 'accepted', acceptedBy: s.acceptedByName || '', href: '/admin/appointment-management' }));
  }
  for (const m of managed) {
    const values = { ...mapOf(m.salesValues), ...mapOf(m.values) };
    const v = mapOf(m.values);
    const arrival = v[RECEPTION_IDS.arrivalStatus] || '';
    const base = card(m, values, { patientId: v[RECEPTION_IDS.patientId] || '', arrivalTime: v[RECEPTION_IDS.arrivalTime] || '', concern: v[RECEPTION_IDS.primaryConcern] || '', href: '/admin/appointment-management' });
    if (m.registration?.status === 'sent') lanes.done.push({ ...base, state: 'post_counselling', note: m.registration.postCounselorName ? `to ${m.registration.postCounselorName}` : '' });
    else if (arrival === 'Arrived' || arrival === 'Online') lanes.inClinic.push({ ...base, online: arrival === 'Online', state: m.registration?.savedAt || m.registration?.status ? 'registration_saved' : arrival === 'Online' ? 'online' : 'arrived' });
    else lanes.expected.push({ ...base, state: arrival === 'Arriving' ? 'arriving' : 'accepted', acceptedBy: m.acceptedByName || '' });
  }
  const byTime = (a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99'));
  Object.values(lanes).forEach((list) => list.sort(byTime));

  res.json({
    success: true, date,
    lanes,
    totals: {
      total: sales.filter((s) => s.status !== 'rescheduled').length,
      toAccept: lanes.toAccept.length, expected: lanes.expected.length, inClinic: lanes.inClinic.length,
      sentToPostCounselling: lanes.done.filter((x) => x.state === 'post_counselling').length,
      notComing: lanes.done.filter((x) => x.state === 'not_coming').length,
      rescheduled: lanes.done.filter((x) => x.state === 'rescheduled').length,
      collected: receipts.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      toVerify: receipts.filter((r) => r.status === 'pending').length,
    },
  });
});

module.exports = { getDesk };
