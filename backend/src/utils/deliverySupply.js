// Treatment Delivery and a phase whose medicine comes in parts (a 6 month plan given as 1 + 5 months).
// Every part has its own purchase order and medicine request, in any combination of months (1 + 5, 2 + 4, 1 + 2 + 3).
// The plan is laid out only for the medicine in hand. A later part is not explained again and gets no date by itself:
// once the patient has it the PCC fills its medicine start date on the Medicine Explanations page, and the plan goes on
// from that day (transitController.setMedicineStart -> deliveryController.startDelivery).
// Until then this file tells where that next part stands: PO made -> payment verified -> medicine requested ->
// prepared -> released -> dispatched -> received, and how many days of medicine the patient still has.
// Pure: no database, no clock of its own.
const D = require('./treatmentDelivery');
const { MEDICINE_ACTIVE, requestKey } = require('./transitFlow');

const plain = (value) => (value?.toObject ? value.toObject() : value || {});
const time = (value) => (value ? new Date(value).getTime() || 0 : 0);
const courierOf = (request) => plain(request?.courier);
const isReceived = (request) => courierOf(request).status === 'delivered';
const s = (n) => (Number(n) === 1 ? '' : 's');

const aliveRequests = (stage) => {
  const seen = new Set();
  return [...(stage?.medicineRequests || []), stage?.medicineRequest].filter((request) => {
    if (!request || !MEDICINE_ACTIVE.includes(request.status) || seen.has(requestKey(request))) return false;
    seen.add(requestKey(request));
    return true;
  });
};

// The medicine requests of the phase that are not on the plan yet and can be its next supply, oldest first.
// A request counts when it was raised after the supply the plan last took. A supply added by hand names no request:
// then only what was raised or received after it was added (so an older supply is never taken twice).
function openSupplies(stage) {
  const parts = stage?.delivery?.parts || [];
  if (!parts.length) return [];
  const requests = aliveRequests(stage);
  const onPlan = new Set(parts.map((part) => part.requestId).filter(Boolean));
  let anchorIndex = -1;
  let anchor = null;
  parts.forEach((part, index) => {
    const request = part.requestId ? requests.find((item) => requestKey(item) === part.requestId) : null;
    if (request) { anchorIndex = index; anchor = request; }
  });
  const cutoff = Math.max(0, ...parts.slice(anchorIndex + 1).map((part) => time(part.addedAt)));
  return requests.filter((request) => {
    if (onPlan.has(requestKey(request))) return false;
    if (anchor && time(request.requestedAt) <= time(anchor.requestedAt)) return false;
    return !cutoff || time(request.requestedAt) > cutoff || time(courierOf(request).deliveredAt) > cutoff;
  }).sort((a, b) => time(a.requestedAt) - time(b.requestedAt));
}

// ...those of them the patient already has, in the order they were received.
const receivedSupplies = (stage) => openSupplies(stage).filter(isReceived)
  .sort((a, b) => time(courierOf(a).deliveredAt) - time(courierOf(b).deliveredAt));

// The earliest sensible start day of the next supply, shown as a hint beside the date the PCC fills (never saved by
// itself): the day after the medicine in hand ends, or the day the patient received it when that is later.
function autoStartDay(previous, receivedAt) {
  const afterPrevious = D.addDays(previous.startDate, D.partDays(previous));
  const got = receivedAt ? D.dayOf(receivedAt) : '';
  return got && got > afterPrevious ? got : afterPrevious;
}

const ORDER = ['no_po', 'po_made', 'paid', 'requested', 'preparing', 'ready', 'released', 'dispatched', 'received'];
const RANK = { unknown: 0, no_po: 0, po_sent_back: 1, ...Object.fromEntries(ORDER.map((key, index) => [key, index])) };
const OWNER = {
  no_po: '', unknown: '', po_made: 'In Transit', po_sent_back: 'In Transit', paid: 'In Transit', requested: 'Medicine Department',
  preparing: 'Medicine Department', ready: 'Medicine Department', released: 'In Transit', dispatched: 'In Transit', received: 'PCC',
};

// Where the next supply of a running plan stands. Null when the plan needs no further supply.
// pos: the purchase orders of the phase ([{ poNumber, status, supplyPlan, supplyPart, medicineRequestId, createdAt }]),
// or null when they could not be read (then only the medicine requests tell the story).
function nextSupplyOf({ stage, pos = null, now = new Date() }) {
  const d = stage?.delivery;
  if (!d?.parts?.length || !d.phaseDays || D.supplyDone(d)) return null;
  const covered = D.coveredDays(d.parts);
  const today = D.dayOf(now);
  const last = d.parts[d.parts.length - 1];
  const runsOut = D.dateOfDay(covered, d.parts);
  const daysLeft = runsOut ? D.diffDays(runsOut, today) : null;
  // The days of the phase still without medicine (months rounded up, for older screens).
  const leftDays = Math.max(0, d.phaseDays - covered);
  const monthsLeft = Math.ceil(leftDays / 30);

  const request = openSupplies(stage)[0] || null;
  const key = requestKey(request);
  const courier = courierOf(request);
  const poNumbers = new Set(d.parts.map((part) => part.poNumber).filter(Boolean));
  const requestIds = new Set(d.parts.map((part) => part.requestId).filter(Boolean));
  const free = (pos || []).filter((po) => po && po.status !== 'cancelled' && !poNumbers.has(po.poNumber) && !(po.medicineRequestId && requestIds.has(po.medicineRequestId)));
  const po = request
    ? free.find((item) => item.medicineRequestId === key || (request.poNumber && item.poNumber === request.poNumber)) || null
    : [...free].sort((a, b) => time(b.createdAt) - time(a.createdAt))[0] || null;
  const poNumber = po?.poNumber || request?.poNumber || '';
  // The days of medicine on the awaited supply (0 when its purchase order does not say).
  const days = D.partDaysOf(request?.supplyPlan, request?.supplyPart) || D.partDaysOf(po?.supplyPlan, po?.supplyPart) || 0;
  const months = days / 30;

  let stageKey;
  if (request) {
    stageKey = courier.status === 'delivered' ? 'received' : courier.status === 'dispatched' ? 'dispatched'
      : { in_process: 'preparing', made: 'ready', sent_to_courier: 'released' }[request.status] || 'requested';
  } else if (po) stageKey = po.status === 'verified' ? 'paid' : po.status === 'rejected' ? 'po_sent_back' : 'po_made';
  else stageKey = pos ? 'no_po' : 'unknown';
  const rank = RANK[stageKey];
  const rest = `the remaining ${D.lengthText(leftDays)}`;
  const text = {
    no_po: `The purchase order for ${rest} of medicine is not made yet`,
    unknown: `The medicine for ${rest} is not requested yet`,
    po_made: `${poNumber} is made: In Transit has to verify its details and payment`,
    po_sent_back: `${poNumber} was sent back: it has to be corrected and verified again`,
    paid: `${poNumber} is verified: the medicine request has to be raised`,
    requested: 'Medicine is requested: Medicine Department has to accept it',
    preparing: 'Medicine Department is preparing the medicine',
    ready: 'Medicine is ready: it has to be released to In Transit',
    released: 'Medicine is released: In Transit has to hand it over / dispatch it',
    dispatched: 'Medicine is dispatched: In Transit confirms the receipt with the patient',
    received: days
      ? 'The patient has the medicine: the PCC fills its medicine start date on the Medicine Explanations page (no new explanation), and the rest of the plan is scheduled from that day'
      : 'The patient has the medicine, but its length is not on record: the PCC fills its months / days and medicine start date (no new explanation)',
  }[stageKey];
  const headline = daysLeft == null ? 'Medicine in hand'
    : daysLeft >= 0 ? `Medicine in hand runs till ${runsOut} (${daysLeft} day${s(daysLeft)} left)`
      : `Medicine in hand finished on ${runsOut} (${-daysLeft} day${s(-daysLeft)} ago)`;
  // Nothing moving yet needs more notice than a parcel already on its way.
  const warnDays = rank < RANK.requested ? 15 : 10;
  const level = stageKey === 'received' ? (daysLeft != null && daysLeft < 0 ? 'red' : 'amber')
    : daysLeft == null ? 'info'
      : daysLeft < 0 || (daysLeft <= 3 && rank < RANK.dispatched) ? 'red'
        : daysLeft <= warnDays ? 'amber' : 'info';

  // No start date is proposed: the PCC fills the day the patient really starts this medicine. `earliest` is only a hint.
  const earliest = autoStartDay(last, request && isReceived(request) ? courier.deliveredAt : null);
  const step = (stepKey, label, from, at = null, note = '') => ({ key: stepKey, label, done: rank >= RANK[from], at: rank >= RANK[from] && at ? new Date(at).toISOString() : null, note });
  return {
    stage: stageKey, level, text, headline, owner: OWNER[stageKey] || '',
    runsOut, daysLeft, monthsLeft, leftDays, leftText: D.lengthText(leftDays), months, days, lengthText: D.lengthText(days), poNumber, poStatus: po?.status || '', requestId: key,
    received: stageKey === 'received', receivedAt: stageKey === 'received' && courier.deliveredAt ? new Date(courier.deliveredAt).toISOString() : null,
    steps: [
      step('po', 'Purchase order', 'po_made', po?.createdAt, poNumber),
      step('paid', 'Payment verified', 'paid'),
      step('requested', 'Medicine requested', 'requested', request?.requestedAt),
      step('ready', 'Medicine ready', 'ready', request?.madeAt),
      step('sent', 'Handed over / dispatched', 'dispatched', courier.dispatchedAt || courier.deliveredAt),
      step('received', 'Received by the patient', 'received', courier.deliveredAt),
    ],
    // What the "add this supply" form starts with: its length (days, at most what the phase still misses) and the
    // purchase order, never a date.
    suggest: { days: Math.min(days || leftDays, leftDays), months: Math.min(days || leftDays, leftDays) / 30, startDate: '', earliest, poNumber, requestId: key },
  };
}

module.exports = { aliveRequests, openSupplies, receivedSupplies, autoStartDay, nextSupplyOf };
