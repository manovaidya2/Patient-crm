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
    const sales = [ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.SALES_TEAM].includes(role);
    assert.equal(rooms.includes('sales-sheet'), sales);
    assert.equal(listeners.includes('sales-sheet:watch-date'), sales);
  }
});
