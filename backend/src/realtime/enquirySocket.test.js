const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerSalesSheetSocket } = require('./salesSheetSocket');
const { ALL_ROLES, ROLES } = require('../constants/roles');
test('each person joins only their private enquiry room; sales rooms remain restricted', () => {
  let connect;
  registerSalesSheetSocket({ use() {}, on(event, handler) { if (event === 'connection') connect = handler; } });
  for (const role of ALL_ROLES) {
    const rooms = []; const listeners = [];
    connect({ user: { _id: 'person1', role }, join(room) { rooms.push(room); }, on(event) { listeners.push(event); } });
    assert.ok(rooms.includes('enquiry:user:person1'));
    const sales = [ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST, ROLES.SALES_TEAM].includes(role);
    // Only the admin hears every Team Chat; the manager gets its own room for enquiries.
    assert.equal(rooms.includes('enquiry:admins'), role === ROLES.ADMIN);
    assert.equal(rooms.includes('enquiry:managers'), role === ROLES.MANAGER);
    assert.equal(rooms.includes('sales-sheet'), sales);
    assert.equal(listeners.includes('sales-sheet:watch-date'), sales);
  }
});

test('medicine job changes reach the people who work on or follow the jobs, and only them', () => {
  const { emitMedicineJobChanged, MEDICINE_JOBS_ROOM } = require('./salesSheetSocket');
  let connect;
  registerSalesSheetSocket({ use() {}, on(event, handler) { if (event === 'connection') connect = handler; } });
  for (const role of ALL_ROLES) {
    const rooms = [];
    connect({ user: { _id: 'person1', role }, join(room) { rooms.push(room); }, on() {} });
    assert.equal(rooms.includes(MEDICINE_JOBS_ROOM), [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT, ROLES.IN_TRANSIT].includes(role), role);
  }
  const sent = [];
  const io = { to(room) { sent.push(room); return this; }, emit(event, payload) { sent.push(event, payload.id); } };
  emitMedicineJobChanged({ get: () => io }, 'job1');
  assert.deepEqual(sent, [MEDICINE_JOBS_ROOM, 'medicine-job:changed', 'job1']);
  emitMedicineJobChanged(null, 'job1');
});
