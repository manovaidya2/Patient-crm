const MedicineJob = require('../models/MedicineJob');
const PurchaseOrder = require('../models/PurchaseOrder');
const AdviceRequest = require('../models/AdviceRequest');
const Expense = require('../models/Expense');
const { asyncHandler } = require('../middleware/errorHandler');
const { cached } = require('../utils/readCache');
const { STAGE_INDEX } = require('../utils/medicineJobFlow');
const { withoutClosedPatients } = require('../utils/closedPatients');

// Everything waiting on the doctor, for the top of the Control Room (Doctor, Admin, Manager): the fulfilment
// formulations to make (step 2, with the treatment components to approve), the PCC's requests for the doctor's
// advice (urgent / red flags first), the exception payments only the doctor approves, and the expense vouchers to
// approve. Each item links to the page where the doctor acts. Oldest first.
const iso = (value) => (value ? new Date(value).toISOString() : null);
const byOldest = (a, b) => new Date(a.since || 0) - new Date(b.since || 0);

const collect = async () => {
  const [jobs, advice, exceptions, vouchers] = await Promise.all([
    MedicineJob.find(await withoutClosedPatients({ status: 'open', currentStage: STAGE_INDEX.formula }))
      .select('patientName patientCode phase poNumber requestedAt readyByDate hold stages.key stages.doneAt scopeApproval').lean(),
    AdviceRequest.find({ status: 'requested', resolvedAt: null }).select('patient stage query isUrgent requestedByName askedAt createdAt alarms')
      .populate('patient', 'patientName patientCode isActive').lean(),
    PurchaseOrder.find({ 'exceptionPayment.required': true, 'exceptionPayment.approvedAt': null, status: 'pending' })
      .select('poNumber patientName phase exceptionPayment totalAmount createdAt').lean(),
    Expense.find({ deletedAt: null, 'voucher.status': 'pending' }).select('kind date purpose amount voucher.number voucher.madeAt voucher.madeByName').lean(),
  ]);
  const groups = [
    {
      key: 'formula', title: 'Formulations to make', hint: 'Fulfilment step 2: make the formulation and approve the treatment components',
      items: jobs.map((job) => ({
        id: String(job._id), href: `/admin/medicine-jobs/${job._id}`, title: job.patientName, code: job.patientCode || '',
        detail: [`Phase ${job.phase}`, job.poNumber ? `PO ${job.poNumber}` : '', job.readyByDate ? `ready by ${iso(job.readyByDate).slice(0, 10)}` : '', job.scopeApproval ? 'components approved' : ''].filter(Boolean).join(' · '),
        since: iso((job.stages || []).find((s) => s.key === 'accept')?.doneAt || job.requestedAt),
        flag: job.hold?.active ? `On hold: ${job.hold.reason || ''}` : '',
      })).sort(byOldest),
    },
    {
      key: 'advice', title: 'Doctor advice required', hint: 'Patient queries the PCC sent to the doctor',
      items: advice.filter((row) => row.patient && row.patient.isActive !== false).map((row) => ({
        id: String(row._id), href: '/admin/request-for-advice', title: row.patient.patientName, code: row.patient.patientCode || '',
        detail: `${row.stage ? `Phase ${row.stage} · ` : ''}${String(row.query || '').slice(0, 140)}${row.requestedByName ? ` — ${row.requestedByName}` : ''}`,
        since: iso(row.askedAt || row.createdAt), urgent: Boolean(row.isUrgent), flag: (row.alarms || []).length ? 'Alarm rung by the PCC' : '',
      })).sort((a, b) => Number(b.urgent) - Number(a.urgent) || byOldest(a, b)),
    },
    {
      key: 'exception', title: 'Exception payments to approve', hint: 'Purchase orders waiting for the doctor\'s approval',
      items: exceptions.map((po) => ({
        id: String(po._id), href: '/admin/exception-payments', title: po.patientName || 'Patient', code: po.poNumber ? `PO ${po.poNumber}` : '',
        detail: [po.phase ? `Phase ${po.phase}` : '', po.exceptionPayment?.reason ? String(po.exceptionPayment.reason).slice(0, 140) : '', po.exceptionPayment?.requestedByName ? `— ${po.exceptionPayment.requestedByName}` : ''].filter(Boolean).join(' · '),
        since: iso(po.exceptionPayment?.requestedAt || po.createdAt),
      })).sort(byOldest),
    },
    {
      key: 'voucher', title: 'Vouchers to approve', hint: 'Clinic expenses and medicine purchases',
      items: vouchers.map((e) => ({
        id: String(e._id), href: '/admin/all-expenses', title: e.purpose, code: e.voucher?.number || '',
        detail: `${e.kind === 'medicine' ? 'Medicine purchase' : 'Clinic expense'} · Rs ${Number(e.amount || 0).toLocaleString('en-IN')}${e.voucher?.madeByName ? ` — ${e.voucher.madeByName}` : ''}`,
        since: iso(e.voucher?.madeAt || e.date),
      })).sort(byOldest),
    },
  ];
  return { groups, total: groups.reduce((sum, g) => sum + g.items.length, 0), urgent: groups[1].items.filter((i) => i.urgent).length };
};

// @route GET /api/tasks/doctor-actions
const getDoctorActions = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await cached('doctor-actions', collect)) });
});

module.exports = { getDoctorActions, collectDoctorActions: collect };
