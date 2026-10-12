const MODULES = ['kpis', 'performance', 'appraisals', 'pip', 'grievances', 'payroll', 'exits'];

const STATUS_MAP = {
  kpis: ['draft', 'active', 'completed', 'cancelled'],
  performance: ['draft', 'finalized'],
  appraisals: ['draft', 'pending_approval', 'approved', 'rejected'],
  pip: ['active', 'extended', 'completed', 'cancelled'],
  grievances: ['open', 'in_review', 'resolved', 'closed'],
  payroll: ['draft', 'pending_approval', 'approved', 'paid'],
  exits: ['initiated', 'pending_approval', 'approved', 'rejected', 'clearance', 'completed'],
};

const START_STATUS = { kpis: 'draft', performance: 'draft', appraisals: 'draft', pip: 'active', grievances: 'open', payroll: 'draft', exits: 'initiated' };
const APPROVAL_MODULES = new Set(['appraisals', 'payroll', 'exits']);

const validModule = (value) => MODULES.includes(value);
const validStatus = (module, status) => STATUS_MAP[module]?.includes(status);

const canTransition = (module, from, to, role) => {
  if (!validStatus(module, to) || from === to) return false;
  if (APPROVAL_MODULES.has(module)) {
    if (to === 'pending_approval') return ['admin', 'hr'].includes(role) && ['draft', 'rejected', 'initiated'].includes(from);
    if (['approved', 'rejected'].includes(to)) return role === 'admin' && from === 'pending_approval';
    if (module === 'payroll' && to === 'paid') return role === 'admin' && from === 'approved';
    if (module === 'exits' && to === 'clearance') return ['admin', 'hr'].includes(role) && from === 'approved';
    if (module === 'exits' && to === 'completed') return ['admin', 'hr'].includes(role) && from === 'clearance';
    return false;
  }
  return ['admin', 'hr'].includes(role);
};

const payrollTotals = ({ basicSalary, allowances, deductions }) => {
  const basic = Number(basicSalary), extra = Number(allowances || 0), less = Number(deductions || 0);
  if (!Number.isFinite(basic) || basic < 0 || !Number.isFinite(extra) || extra < 0 || !Number.isFinite(less) || less < 0) return null;
  return { basicSalary: basic, allowances: extra, deductions: less, netPay: basic + extra - less };
};

module.exports = { MODULES, STATUS_MAP, START_STATUS, APPROVAL_MODULES, validModule, validStatus, canTransition, payrollTotals };
