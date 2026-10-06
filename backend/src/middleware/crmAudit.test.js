const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const CrmAuditLog = require('../models/CrmAuditLog');
const { attachCrmAudit, actionFor, describe } = require('./crmAudit');

test('actionFor identifies common CRM actions', () => {
  assert.equal(actionFor('PATCH', '/api/payments/abc/approve'), 'Approved');
  assert.equal(actionFor('DELETE', '/api/patients/abc'), 'Deleted');
  assert.equal(actionFor('POST', '/api/patients'), 'Created');
});

test('describe lists safe field names without sensitive fields or values', () => {
  const summary = describe({ body: {
    patientName: 'Private patient', password: 'do-not-log', paymentScreenshot: 'binary-data', token: 'secret',
  } }, 'Patients', 'Updated', '/api/patients/507f1f77bcf86cd799439011');
  assert.match(summary, /Patient Name/);
  assert.doesNotMatch(summary, /Private patient|Password|Screenshot|Token|do-not-log|binary-data|secret/);
});

test('attachCrmAudit saves a successful authenticated write', async () => {
  const originalCreate = CrmAuditLog.create;
  let saved;
  CrmAuditLog.create = async (record) => { saved = record; };
  try {
    const response = new EventEmitter();
    response.statusCode = 200;
    attachCrmAudit({
      method: 'PATCH', originalUrl: '/api/patients/507f1f77bcf86cd799439011/assign',
      body: { assistantDoctorId: '507f191e810c19729de860ea' },
      user: { _id: '507f1f77bcf86cd799439012', name: 'Admin User', role: 'admin' },
    }, response);
    response.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(saved.actorName, 'Admin User');
    assert.equal(saved.module, 'Patients');
    assert.equal(saved.action, 'Assigned');
    assert.equal(saved.targetId, '507f1f77bcf86cd799439011');
  } finally {
    CrmAuditLog.create = originalCreate;
  }
});

test('attachCrmAudit ignores failed writes and read requests', async () => {
  const originalCreate = CrmAuditLog.create;
  let calls = 0;
  CrmAuditLog.create = async () => { calls += 1; };
  try {
    const user = { _id: '507f1f77bcf86cd799439012', name: 'Admin User', role: 'admin' };
    const failedResponse = new EventEmitter();
    failedResponse.statusCode = 400;
    attachCrmAudit({ method: 'POST', originalUrl: '/api/patients', body: {}, user }, failedResponse);
    failedResponse.emit('finish');
    const readResponse = new EventEmitter();
    readResponse.statusCode = 200;
    attachCrmAudit({ method: 'GET', originalUrl: '/api/patients', user }, readResponse);
    readResponse.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 0);
  } finally {
    CrmAuditLog.create = originalCreate;
  }
});
