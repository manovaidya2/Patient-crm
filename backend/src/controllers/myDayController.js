const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');
const StockItem = require('../models/StockItem');
const Enquiry = require('../models/Enquiry');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { loadPoViews } = require('./purchaseOrderController');
const { jobActionBy } = require('./medicineJobController');
const { handedOverRequestIds, activeJobRequestIds, madeStillPending } = require('../utils/legacyHandover');
const { explanationOwner } = require('./transitController');
const { PAGES, stepRole, shared, countOf } = require('./taskCountController');
const { STAGES } = require('../utils/medicineJobFlow');
const { releaseView } = require('../utils/medicineRelease');

// "My day": the same open work the orange counts show, as a list of items - who, what, when due, and where to act.
// Every item comes from the current state of a record, so it leaves the list by itself once the work is done.
const LIMIT = 25;
const iso = (v) => (v ? new Date(v).toISOString() : null);
const allRequests = (stage) => [...(stage.medicineRequests || []), ...(stage.medicineRequest?.status ? [stage.medicineRequest] : [])];
const callHandler = (handler, user, query = {}) => new Promise((resolve, reject) => {
  const res = { status() { return this; }, json: resolve };
  Promise.resolve(handler({ user, query, params: {}, body: {} }, res, reject)).catch(reject);
});
const item = (page, key, title, detail, due, href, extra = {}) => ({ page, key: `${page}|${key}`, title, detail, due: iso(due), href, ...extra });

const REQUEST_STATUS = { requested: 'Accept the request', in_process: 'Being prepared', made: 'Made · waiting for release' };
const requestItems = async (page, statuses, detailOf, extra = () => true) => {
  const patients = await Patient.find({ $or: [{ 'stages.medicineRequest.status': { $in: statuses } }, { 'stages.medicineRequests.status': { $in: statuses } }] })
    .select('patientName patientCode stages.number stages.medicineRequest stages.medicineRequests').lean();
  const out = [];
  for (const p of patients) for (const st of p.stages || []) for (const r of allRequests(st)) {
    if (!statuses.includes(r.status) || !extra(r)) continue;
    out.push(item(page, `${p._id}-${st.number}-${r.requestId || 'legacy'}`, p.patientName, `${p.patientCode || ''} · Phase ${st.number}${r.poNumber ? ` · ${r.poNumber}` : ''} · ${detailOf(r)}`, r.readyByDate || r.requestedAt, page));
  }
  return out;
};

const COLLECTORS = {
  async '/admin/purchase-orders'(user) {
    const pos = await loadPoViews();
    return [...pos.filter((po) => po.actionBy.includes(stepRole(user)))
      .map((po) => item('/admin/purchase-orders', po.id, po.patientName, `${po.poNumber} · ${(po.openSteps.find((s) => s.actionBy.includes(stepRole(user))) || po.step).label}${po.supplyLabel ? ` · ${po.supplyLabel}` : ''}`, po.createdAt, `/admin/purchase-orders/${po.id}`, { waitingSince: true }))];
  },
  async '/admin/patient-approvals'() {
    const ps = await Patient.find({ $or: [{ approvalStatus: 'pending' }, { 'stages.payments.approvalStatus': 'pending' }] }).select('patientName patientCode approvalStatus createdAt stages.payments').limit(LIMIT).lean();
    return ps.map((p) => {
      const pending = (p.stages || []).flatMap((s) => s.payments || []).filter((x) => x.approvalStatus === 'pending');
      const detail = p.approvalStatus === 'pending' ? 'New patient to approve' : `${pending.length} payment(s) to approve · Rs ${pending.reduce((s, x) => s + Number(x.amount || 0), 0).toLocaleString('en-IN')}`;
      return item('/admin/patient-approvals', String(p._id), p.patientName, `${p.patientCode || ''} · ${detail}`, pending[0]?.createdAt || p.createdAt, '/admin/patient-approvals', { waitingSince: true });
    });
  },
  async '/admin/payments'() {
    const rows = await Patient.aggregate([
      { $match: { 'stages.payments.approvalStatus': 'pending' } }, { $unwind: '$stages' }, { $unwind: '$stages.payments' },
      { $match: { 'stages.payments.approvalStatus': 'pending' } }, { $sort: { 'stages.payments.createdAt': 1 } }, { $limit: LIMIT },
      { $project: { patientName: 1, patientCode: 1, phase: '$stages.number', p: '$stages.payments' } },
    ]);
    return rows.map((r) => item('/admin/payments', String(r.p._id), r.patientName, `${r.patientCode || ''} · Phase ${r.phase} · Rs ${Number(r.p.amount || 0).toLocaleString('en-IN')} ${r.p.paymentMode || ''}${r.p.utr ? ` · UTR ${r.p.utr}` : ''}`, r.p.createdAt || r.p.date, `/admin/patients/${r._id}?tab=phases`, { waitingSince: true }));
  },
  async '/admin/accounts/consultations'() {
    const rows = await ConsultationReceipt.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(LIMIT).lean();
    return rows.map((r) => item('/admin/accounts/consultations', String(r._id), r.patientName || r.name || 'Consultation receipt', `Rs ${Number(r.amount || 0).toLocaleString('en-IN')} · ${r.paymentMode || ''}${r.reference ? ` · ${r.reference}` : ''}`, r.createdAt, '/admin/accounts/consultations', { waitingSince: true }));
  },
  async '/admin/accounts/refunds'() {
    const rows = await Patient.aggregate([
      { $match: { 'stages.payments.refunds.status': 'initiated' } }, { $unwind: '$stages' }, { $unwind: '$stages.payments' }, { $unwind: '$stages.payments.refunds' },
      { $match: { 'stages.payments.refunds.status': 'initiated' } }, { $limit: LIMIT },
      { $project: { patientName: 1, patientCode: 1, phase: '$stages.number', r: '$stages.payments.refunds' } },
    ]);
    return rows.map((x) => item('/admin/accounts/refunds', String(x.r._id || `${x._id}-${x.phase}`), x.patientName, `${x.patientCode || ''} · Phase ${x.phase} · refund Rs ${Number(x.r.amount || 0).toLocaleString('en-IN')} to pay`, x.r.createdAt, '/admin/accounts/refunds', { waitingSince: true }));
  },
  async '/admin/courier'() {
    const { courierHandovers } = require('./purchaseOrderController');
    const MODE = { pickup: 'Self pickup', porter: 'Porter', courier: 'Courier', shipped: 'Porter / Courier' };
    return (await courierHandovers()).filter((r) => r.section === 'pending' && r.mode !== 'pickup').map((r) => item('/admin/courier', r.poId, r.patientName, `${r.poNumber} · ${MODE[r.mode] || r.mode} · ${r.medicine.label}`, r.expectedAt, `/admin/purchase-orders/${r.poId}`));
  },
  async '/admin/self-pickup-schedule'() {
    const { courierHandovers } = require('./purchaseOrderController');
    return (await courierHandovers()).filter((r) => r.section === 'pending' && r.mode === 'pickup').map((r) => item('/admin/self-pickup-schedule', r.poId, r.patientName, `${r.poNumber} · Self pickup · ${r.medicine.label}`, r.expectedAt, `/admin/purchase-orders/${r.poId}`));
  },
  async '/admin/medicine-requests'() { return requestItems('/admin/medicine-requests', ['requested', 'in_process'], (r) => REQUEST_STATUS[r.status]); },
  async '/admin/medicine-made'() { const active = await activeJobRequestIds(); return requestItems('/admin/medicine-made', ['made'], (r) => REQUEST_STATUS[r.status], (r) => madeStillPending(r, active)); },
  async '/admin/medicine-jobs'(user) {
    const finalPcc = user.role === ROLES.ASSISTANT_DOCTOR ? await require('./treatmentPaperController').getKindPcc('final') : null;
    const jobs = await MedicineJob.find({ status: { $ne: 'cancelled' }, $or: [{ status: { $in: ['open', 'ready'] } }, { 'boxReceipt.requestedAt': { $ne: null }, 'boxReceipt.receivedAt': null }] }).select('patientName patientCode poNumber purchaseOrder phase status currentStage hold readyByDate requestId formulation.custom formulation.lines.key boxReceipt releaseRequest stages.key stages.doneAt').lean();
    const handedOver = await handedOverRequestIds(jobs.map((j) => j.requestId));
    return jobs.filter((j) => jobActionBy(j, handedOver, { user, finalPcc }).includes(stepRole(user))).map((j) => {
      const release = releaseView(j);
      let detail = `${(j.currentStage || 0) + 1}. ${STAGES[j.currentStage || 0]?.label || ''}`;
      let due = j.readyByDate;
      if (j.hold?.active) detail = `On hold: ${j.hold.reason}`;
      else if (j.boxReceipt?.requestedAt && !j.boxReceipt.receivedAt && user.role === ROLES.ASSISTANT_DOCTOR) detail = `Receive medicine box · requested by ${j.boxReceipt.requestedByName}`;
      else if (release?.needsTransitAction && user.role === ROLES.IN_TRANSIT) {
        detail = release.overdue ? 'Medicine release overdue — cancel or extend the deadline' : `Request medicine release or update status · ${release.daysLeft} day(s) left`;
        if (release.followupLabel) detail += ` · ${release.followupLabel}`;
        due = release.deadlineAt;
      } else if (j.status === 'ready' && release?.state === 'requested') detail = `Medicine release requested by ${release.requestedByName} — check payment and accept`;
      else if (j.status === 'ready' && release?.state === 'accepted') detail = 'Release request accepted — release medicine';
      else if (STAGES[j.currentStage || 0]?.key === 'formula') detail = `${j.formulation?.custom && !(j.formulation.lines || []).length ? 'Create' : 'Verify'} formulation of ${j.patientName}${j.formulation?.custom ? ' (custom)' : ''}`;
      return item('/admin/medicine-jobs', String(j._id), j.patientName, `${j.poNumber || `Phase ${j.phase}`} · ${detail}`, due, `/admin/medicine-jobs/${j._id}`);
    });
  },
  async '/admin/stocks'() {
    const items = await StockItem.find({ isActive: { $ne: false } }).lean();
    const now = new Date();
    return items.filter((i) => Number(i.currentStock || 0) <= Number(i.minLevel || 0) || (i.expiryDate && new Date(i.expiryDate) < now))
      .map((i) => item('/admin/stocks', String(i._id), `${i.code} · ${i.name}`, i.expiryDate && new Date(i.expiryDate) < now ? 'Expired batch' : `${i.currentStock} ${i.unit} left · minimum ${i.minLevel}`, null, '/admin/stocks'));
  },
  async '/admin/medicine-explanations'(user) {
    const patients = await Patient.find({ isActive: { $ne: false }, 'stages.transit.explanationScheduledAt': { $type: 'date' } }).select('patientName patientCode assignedDoctor stages.number stages.transit stages.medicineExplainDate stages.medicineRequest.status stages.medicineRequest.requestId stages.medicineRequest.requestedAt stages.medicineRequest.poNumber stages.medicineRequest.courier.status stages.medicineRequest.courier.deliveredAt stages.medicineRequests.status stages.medicineRequests.requestId stages.medicineRequests.requestedAt stages.medicineRequests.poNumber stages.medicineRequests.courier.status stages.medicineRequests.courier.deliveredAt stages.delivery.parts stages.delivery.phaseDays stages.delivery.supplyClosedAt').lean();
    const { pendingStart } = require('../utils/transitFlow');
    const out = [];
    for (const p of patients) for (const st of p.stages || []) {
      const t = st.transit || {};
      if (!t.explanationScheduledAt || t.removedAt || !(t.assignedAt || t.explanationDoctor)) continue;
      if (!isAdminLike(user) && explanationOwner(p, st) !== String(user._id)) continue;
      // A started phase: only the medicine start date of a later supply the patient already has (no new explanation).
      if (t.activatedAt) {
        const due = pendingStart(st);
        if (due) out.push(item('/admin/medicine-explanations', `${p._id}-${st.number}-${due.requestId || 'legacy'}`, p.patientName, `${p.patientCode || ''} · Phase ${st.number} · next supply${due.poNumber ? ` ${due.poNumber}` : ''} received - fill its medicine start date`, due.courier?.deliveredAt || null, '/admin/medicine-explanations'));
        continue;
      }
      out.push(item('/admin/medicine-explanations', `${p._id}-${st.number}`, p.patientName, `${p.patientCode || ''} · Phase ${st.number} · ${t.explanationCompletedAt ? 'explained - fill the medicine start date' : t.explanationMode || 'phone'}`, st.medicineExplainDate, '/admin/medicine-explanations'));
    }
    return out;
  },
  // In Transit's follow-up calls whose time has come (late ones say by how many days): one ding each when due.
  async '/admin/transit-follow-ups'(user) {
    const { listFollowUps } = require('./transitController');
    const data = await callHandler(listFollowUps, user, { status: 'open' });
    return (data.rows || []).filter((r) => r.status !== 'upcoming').map((r) => item('/admin/transit-follow-ups', r.id, r.patientName, `${r.poNumber || `Phase ${r.phase}`} · ${r.label}${r.lateDays ? ` · ${r.lateDays} day${r.lateDays === 1 ? '' : 's'} late` : ''}`, r.dueAt, r.poId ? `/admin/purchase-orders/${r.poId}` : '/admin/transit-follow-ups'));
  },
  // Expenses & vouchers (controllers/expenseController openWorkFor).
  async '/admin/all-expenses'(user) { return expenseItems(user, '/admin/all-expenses', null); },
  async '/admin/clinic-expenses'(user) { return expenseItems(user, '/admin/clinic-expenses', 'clinic'); },
  async '/admin/medicine-purchases'(user) { return expenseItems(user, '/admin/medicine-purchases', 'medicine'); },
  async '/admin/followups'(user) { return reminderItems(user, 'followup', '/admin/followups'); },
  async '/admin/family-sessions'(user) { return reminderItems(user, 'family_session', '/admin/family-sessions'); },
  async '/admin/post-counseling-patients'(user) {
    const { listPostCounselingPatients } = require('./receptionFlowController');
    const data = await callHandler(listPostCounselingPatients, user, {});
    return (data.patients || []).map((p) => item('/admin/post-counseling-patients', String(p.id), p.patientName, `${p.patientId || p.appointmentCode || ''} · outcome not decided${p.postCounselorName ? ` · ${p.postCounselorName}` : ''}`, p.sentAt, '/admin/post-counseling-patients', { waitingSince: true }));
  },
  async '/admin/package-not-bought'() {
    const rows = await PackageNotBoughtPatient.find({ status: { $nin: ['converted', 'closed'] } }).select('patientName parentName program followUps followUpDate').lean();
    return rows.map((r) => {
      const next = (r.followUps || []).filter((f) => (f.status || 'scheduled') !== 'completed' && f.dateTime).map((f) => new Date(f.dateTime)).sort((a, b) => a - b)[0] || null;
      return item('/admin/package-not-bought', String(r._id), r.patientName, `${r.parentName || ''}${r.program ? ` · ${r.program}` : ''} · ${next ? 'follow-up' : 'no follow-up set'}`, next, `/admin/package-not-bought/${r._id}`);
    });
  },
  async '/admin/request-for-advice'() {
    const rows = await require('../models/AdviceRequest').find({ status: 'requested', resolvedAt: null })
      .select('patient stage query isUrgent askedAt createdAt alarms.at lastAlarmAt').populate('patient', 'patientName patientCode')
      .sort({ isUrgent: -1, createdAt: 1 }).limit(LIMIT).lean();
    return rows.map((r) => {
      const rings = (r.alarms || []).length;
      const detail = [r.patient?.patientCode, `Phase ${r.stage || '-'}`, r.isUrgent ? 'EMERGENCY' : '', rings ? `PCC rang ${rings} time${rings === 1 ? '' : 's'}` : '', `"${String(r.query || '').slice(0, 80)}"`].filter(Boolean).join(' · ');
      return item('/admin/request-for-advice', String(r._id), r.patient?.patientName || 'Patient', detail, r.askedAt || r.createdAt, '/admin/request-for-advice', { waitingSince: true });
    });
  },
  async '/admin/patient-queries'(user) {
    const work = await require('./adviceController').pccQueryWork(user);
    return work.map((w) => item('/admin/patient-queries', w.id, w.patientName, `${w.patientCode ? `${w.patientCode} · ` : ''}Phase ${w.stage || '-'} · ${w.what} · "${w.query}"`, w.due, `/admin/patient-queries?q=${w.id}`));
  },
  async '/admin/treatment-delivery'(user) {
    const work = await require('./deliveryController').deliveryWork(user);
    return work.slice(0, LIMIT).map((w) => item('/admin/treatment-delivery', w.id, w.patientName, `${w.patientCode ? `${w.patientCode} · ` : ''}Phase ${w.phase} · ${w.what}`, w.due, `/admin/treatment-delivery?p=${w.patientId}&s=${w.phase}`));
  },
  async '/admin/team-chat'(user) {
    const TeamChat = require('../models/TeamChat');
    const { unreadFor } = require('./teamChatController');
    const chats = await TeamChat.find({ participants: user._id, status: { $ne: 'closed' } }).select('kind subject patientName status participants createdByName assignedToName lastMessageAt clearedBy messages.sender messages.readBy messages.senderName messages.createdAt').sort({ lastMessageAt: -1 }).limit(LIMIT).lean();
    return chats.filter((c) => unreadFor(c, user) > 0).map((c) => item('/admin/team-chat', String(c._id), c.kind === 'direct' ? `Chat with ${String(c.participants[0]) === String(user._id) ? c.assignedToName : c.createdByName}` : c.subject, `${c.patientName ? `${c.patientName} · ` : ''}${unreadFor(c, user)} new · from ${c.messages[c.messages.length - 1]?.senderName || '-'}`, c.lastMessageAt, `/admin/team-chat?with=${(c.participants || []).find((id) => String(id) !== String(user._id)) || ''}${c.kind === 'direct' ? '' : `&q=${c._id}`}`));
  },
  async '/admin/enquiries'(user) {
    const filter = { deletedAt: null, status: { $in: ['open', 'in_progress'] } };
    if (!isAdminLike(user)) Object.assign(filter, { participants: user._id, assignedTo: user._id });
    const rows = await Enquiry.find(filter).select('subject patientName status createdByName createdAt').sort({ createdAt: 1 }).limit(LIMIT).lean();
    return rows.map((e) => item('/admin/enquiries', String(e._id), e.subject || 'Enquiry', `${e.patientName ? `${e.patientName} · ` : ''}${e.status === 'in_progress' ? 'in progress' : 'open'} · from ${e.createdByName || '-'}`, e.createdAt, `/admin/enquiries?id=${e._id}`, { waitingSince: true }));
  },
};

async function expenseItems(user, page, kind) {
  const list = (await require('./expenseController').openWorkFor(user)).filter((e) => !kind || e.kind === kind);
  return list.map((e) => {
    const what = e.voucher?.status === 'pending' ? `Approve voucher ${e.voucher.number}` : e.voucher?.status === 'approved' ? (e.repayStatus === 'supplier_due' ? `Pay supplier ${e.vendor}` : `Repay ${e.paidByName}`) : e.voucher?.status === 'rejected' ? `Voucher ${e.voucher.number} sent back: ${e.voucher.rejectReason || ''}` : 'Make the voucher';
    return item(page, String(e._id), `Rs ${Number(e.amount).toLocaleString('en-IN')} · ${e.purpose}`, `${e.kind === 'medicine' ? 'Medicine purchase' : 'Clinic expense'} · ${what}`, e.voucher?.madeAt || e.createdAt, `${page}?open=${e._id}`, { waitingSince: true });
  });
}

async function reminderItems(user, type, page) {
  const { getScheduleReminders } = require('./patientController');
  const data = await callHandler(getScheduleReminders, user, { window: '24h' });
  return (data.reminders || []).filter((r) => r.type === type)
    .map((r) => item(page, `${r.patientId}-${r.stageNumber}-${r.id || r._id || r.dateTime}`, r.patientName, `${r.patientCode || ''} · ${r.typeLabel || ''} · ${r.reminderKind === 'late' ? 'late' : 'next 24 h'}${r.assignee ? ` · ${r.assignee}` : ''}`, r.dateTime, `/admin/patients/${r.patientId}?tab=sessions`));
}

// One page's items for this person, shared with the other screens asking for the same list.
const itemsOf = (page, user) => shared('items', page, user, () => COLLECTORS[page](user));

// @route GET /api/tasks/my-day  -> { sections: [{ page, count, items: [...] }] }
const getMyDay = asyncHandler(async (req, res) => {
  const pages = Object.keys(PAGES).filter((page) => PAGES[page].includes(req.user.role) && COLLECTORS[page]);
  const sections = await Promise.all(pages.map(async (page) => {
    try {
      const [items, count] = await Promise.all([itemsOf(page, req.user), countOf(page, req.user)]);
      const sorted = [...items].sort((a, b) => (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity));
      return { page, count: Math.max(count, items.length), items: sorted.slice(0, LIMIT) };
    } catch (error) {
      console.error(`My day ${page}: ${error.message}`);
      return { page, count: 0, items: [], error: true };
    }
  }));
  res.json({ success: true, now: new Date().toISOString(), sections: sections.filter((s) => s.count > 0 || s.items.length) });
});

module.exports = { getMyDay, COLLECTORS, itemsOf };
