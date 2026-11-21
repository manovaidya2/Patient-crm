// Patient 360° rows and the PCC report numbers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { patient360Row, medicineOf, programmeOf, pccReportRows, daysInRange } = require('./insights');

const id = () => new mongoose.Types.ObjectId();
const NOW = new Date('2026-11-21T06:00:00Z');

test('medicine: the newest request decides - requested, preparing, dispatched, delivered, started', () => {
  const req = (status, courier, extra = {}) => ({ requestId: 'r1', status, requestedAt: new Date('2026-11-01'), courier: { status: courier }, ...extra });
  assert.equal(medicineOf({ medicineRequests: [] }), 'Not requested');
  assert.equal(medicineOf({ medicineRequests: [req('requested', 'pending')] }), 'Requested');
  assert.equal(medicineOf({ medicineRequests: [req('in_process', 'pending')] }), 'Preparing');
  assert.equal(medicineOf({ medicineRequests: [req('sent_to_courier', 'dispatched')] }), 'Dispatched');
  assert.equal(medicineOf({ medicineRequests: [req('sent_to_courier', 'delivered')] }), 'Delivered');
  assert.equal(medicineOf({ medicineRequests: [req('sent_to_courier', 'delivered')], transit: { medicineStartDate: new Date('2026-11-05') } }), 'Started');
  // A second supply on its way: the newest request shows.
  assert.equal(medicineOf({ medicineRequests: [req('sent_to_courier', 'delivered'), req('requested', 'pending', { requestId: 'r2', requestedAt: new Date('2026-11-20') })], transit: { medicineStartDate: new Date('2026-11-05') } }), 'Requested');
});

test('programme: months and the category word from the supply plan', () => {
  assert.equal(programmeOf({ category: 'autism_adhd' }, { medicineRequests: [{ requestId: 'r', status: 'requested', supplyPlan: '1+5' }] }), '6 month autism');
  assert.equal(programmeOf({ category: 'mental_health' }, { medicineRequests: [{ requestId: 'r', status: 'requested', supplyPlan: 'C0m45d' }] }), '45 day mental wellness');
  assert.equal(programmeOf({ category: 'mental_health' }, { medicineMonthsGiven: 3 }), '3 month mental wellness');
  assert.equal(programmeOf({ category: 'other' }, { packageName: 'Custom pack' }), 'Custom pack');
});

test('a Patient 360° row: due (approved payments less refunds), next open session, sessions done, team, phase end', () => {
  const patient = {
    _id: id(), patientName: 'Diya', patientCode: 'D-3200', category: 'autism_adhd', currentStage: 1, assignedDoctor: { name: 'Sakshi' },
    stages: [{
      number: 1, totalAmount: 40000, postCounselor: { name: 'Abhishek' },
      payments: [{ amount: 20000 }, { amount: 5000, approvalStatus: 'pending' }, { amount: 10000, refunds: [{ amount: 2000, status: 'paid' }] }],
      medicineRequests: [{ requestId: 'r1', status: 'sent_to_courier', supplyPlan: '6M', courier: { status: 'delivered' } }],
      transit: { medicineStartDate: new Date('2026-11-01T00:00:00+05:30') },
      carePlan: { parts: [{ requestId: 'r1', startDate: '2026-11-01', days: 180, offsetDays: 0 }] },
    }],
  };
  const s = (code, status, targetDate, title = code) => ({ _id: id(), phase: 1, code, title, status, targetDate });
  const row = patient360Row(patient, [s('FU-01', 'completed', '2026-11-11'), s('FS-01', 'scheduled', '2026-11-16', 'Family Session 01'), s('FU-02', 'pending', '2026-11-23'), s('DT-01', 'cancelled', '2027-01-01')], NOW);
  assert.equal(row.due, 12000, '40000 - (20000 + 10000 - 2000); the pending 5000 does not count');
  assert.deepEqual(row.sessions, { done: 1, total: 3, missed: 0 });
  assert.deepEqual([row.next.code, row.next.overdue, row.overdue], ['FS-01', true, 1]);
  assert.deepEqual([row.programme, row.medicine, row.pcc, row.postCounselor, row.phaseEnds], ['6 month autism', 'Started', 'Sakshi', 'Abhishek', '2027-04-30']);
});

test('PCC report: due in the range (till today), on time vs late, missed, closed, overdue now, next 7 days, covers', () => {
  const a = { _id: id(), name: 'Aditi' };
  const b = { _id: id(), name: 'Sakshi' };
  const s = (who, status, targetDate, extra = {}) => ({ _id: id(), assignee: who._id, owner: who._id, status, targetDate, reschedules: [], attempts: [], doctorRequests: [], ...extra });
  const sessions = [
    s(a, 'completed', '2026-11-10', { completedAt: new Date('2026-11-10T08:00:00Z'), form: { durationSec: 600 } }),
    s(a, 'completed', '2026-11-12', { completedAt: new Date('2026-11-14T08:00:00Z'), reschedules: [{}], attempts: [{}, {}], form: { durationSec: 1200 } }),
    s(a, 'missed', '2026-11-15'),
    s(a, 'pending', '2026-11-18'),
    s(a, 'pending', '2026-11-25'),
    s(a, 'cancelled', '2026-11-16'),
    s(b, 'completed', '2026-11-19', { completedAt: new Date('2026-11-19T08:00:00Z'), owner: a._id }),
    s(b, 'completed', '2026-09-01', { completedAt: new Date('2026-09-01T08:00:00Z') }),
  ];
  const { rows, team } = pccReportRows({ pccs: [a, b], sessions, from: '2026-11-01', to: '2026-11-21', now: NOW, leaveDays: new Map([[String(a._id), 2]]) });
  const [ra, rb] = rows;
  assert.deepEqual([ra.due, ra.done, ra.onTime, ra.late, ra.missed, ra.closed, ra.overdue, ra.upcoming], [4, 2, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual([ra.onTimeRate, ra.completionRate, ra.reschedules, ra.notConnected, ra.avgFormMinutes, ra.leaveDays], [25, 50, 1, 2, 15, 2]);
  assert.deepEqual([rb.due, rb.done, rb.covers, rb.onTimeRate], [1, 1, 1, 100], 'the September one is outside the range');
  assert.deepEqual([team.due, team.done, team.onTimeRate], [5, 3, 40]);
  assert.equal(daysInRange([{ from: '2026-10-30', to: '2026-11-02' }, { from: '2026-11-02', to: '2026-11-03' }], '2026-11-01', '2026-11-21'), 3);
});
