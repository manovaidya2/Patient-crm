const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, payrollTotals } = require('./hrLifecycleUtils');

test('Admin and Doctor give final approval to appraisal, payroll and exit records', () => {
  for (const module of ['appraisals', 'payroll', 'exits']) {
    assert.equal(canTransition(module, 'pending_approval', 'approved', 'admin'), true);
    assert.equal(canTransition(module, 'pending_approval', 'approved', 'doctor'), true);
    assert.equal(canTransition(module, 'pending_approval', 'approved', 'hr'), false);
  }
});

test('HR submits controlled records and payroll totals are calculated server-side', () => {
  assert.equal(canTransition('payroll', 'draft', 'pending_approval', 'hr'), true);
  assert.equal(canTransition('payroll', 'draft', 'pending_approval', 'admin'), true);
  assert.equal(canTransition('payroll', 'approved', 'paid', 'doctor'), true);
  assert.equal(canTransition('payroll', 'draft', 'approved', 'hr'), false);
  assert.deepEqual(payrollTotals({ basicSalary: '30000', allowances: '5000', deductions: '2500' }), { basicSalary: 30000, allowances: 5000, deductions: 2500, netPay: 32500 });
  assert.equal(payrollTotals({ basicSalary: '-1', allowances: 0, deductions: 0 }), null);
});
