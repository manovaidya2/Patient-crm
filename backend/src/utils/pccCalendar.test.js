const test = require('node:test');
const assert = require('node:assert/strict');
const { isOffDay, assertWorkingDay } = require('./pccCalendar');

test('PCCs are off on Wednesday (India time): no explanation is booked then', () => {
  assert.equal(isOffDay('2026-11-04T05:30:00.000Z'), true, 'Wed 4 Nov 2026, 11:00 IST');
  assert.equal(isOffDay('2026-11-03T20:00:00.000Z'), true, 'Tue 20:00 UTC is already Wednesday in India');
  assert.equal(isOffDay('2026-11-05T05:30:00.000Z'), false, 'Thursday');
  assert.throws(() => assertWorkingDay(new Date('2026-11-04T05:30:00.000Z')), /off on Wednesday/);
  assert.doesNotThrow(() => assertWorkingDay(new Date('2026-11-05T05:30:00.000Z')));
  assert.doesNotThrow(() => assertWorkingDay(null));
});

test('on Saturday, Sunday and Tuesday the PCCs take bookings only from 2 pm', () => {
  const { slotProblem } = require('./pccCalendar');
  assert.match(slotProblem('2026-11-07T05:30:00.000Z'), /only from 2 pm/, 'Saturday 11:00 IST');
  assert.equal(slotProblem('2026-11-07T08:30:00.000Z'), '', 'Saturday 14:00 IST');
  assert.match(slotProblem('2026-11-08T08:29:00.000Z'), /only from 2 pm/, 'Sunday 13:59 IST');
  assert.match(slotProblem('2026-11-10T04:30:00.000Z'), /only from 2 pm/, 'Tuesday 10:00 IST');
  assert.equal(slotProblem('2026-11-09T04:30:00.000Z'), '', 'Monday morning is fine');
});
