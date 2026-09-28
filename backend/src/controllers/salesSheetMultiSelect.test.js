const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./salesSheetController');
const SalesSheetColumn = require('../models/SalesSheetColumn');
const AppointmentManagementColumn = require('../models/AppointmentManagementColumn');
const SalesAppointment = require('../models/SalesAppointment');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const SalesSheetAudit = require('../models/SalesSheetAudit');

for (const [name, Column, Row, handler, valueField] of [
  ['Sales', SalesSheetColumn, SalesAppointment, controller.updateAppointment, 'values'],
  ['Appointment Management', AppointmentManagementColumn, AppointmentManagementEntry, controller.updateManagedAppointment, 'values'],
]) {
  test(`${name}: multiple choices save once in column order and reject unknown choices`, async () => {
    const originalFind = Column.find;
    const originalFindById = Row.findById;
    const originalAudit = SalesSheetAudit.create;
    const column = { _id: 'choices', label: 'Services', type: 'multi_select', required: true, options: ['Assessment', 'Therapy', 'Medicine'] };
    const row = { _id: 'row-1', appointmentCode: 'APT-TEST', appointmentDate: '2026-09-28', status: 'active', acceptedAt: null, createdBy: 'admin-1', createdByName: 'Admin', values: new Map(), save: async function () { this.values = new Map(Object.entries(this.values)); } };
    Column.find = () => ({ sort: () => ({ lean: async () => [column] }) });
    Row.findById = async () => row;
    SalesSheetAudit.create = async () => ({});
    const response = { json(data) { this.data = data; } };
    const invoke = async (value) => {
      let error;
      await handler({ params: { id: 'row-1' }, body: { [valueField]: { choices: value } }, user: { _id: 'admin-1', name: 'Admin', role: 'admin' }, app: { get: () => null } }, response, (err) => { error = err; });
      return error;
    };
    try {
      assert.equal(await invoke(' Medicine, Assessment, Medicine '), undefined);
      assert.equal(row.values.get('choices'), 'Assessment, Medicine');
      const invalid = await invoke('Assessment, Unknown');
      assert.equal(invalid?.statusCode, 400);
      assert.equal(row.values.get('choices'), 'Assessment, Medicine');
      const missing = await invoke('');
      assert.equal(missing?.statusCode, 400);
    } finally {
      Column.find = originalFind;
      Row.findById = originalFindById;
      SalesSheetAudit.create = originalAudit;
    }
  });
}
