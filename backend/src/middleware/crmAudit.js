const CrmAuditLog = require('../models/CrmAuditLog');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = /password|token|secret|authorization|cookie|proof|file|image|document|attachment|screenshot|recording/i;
const LABELS = {
  accounts: 'Accounts', advice: 'Doctor Advice', banks: 'Banks', courier: 'Courier',
  'clinic-inventory': 'Clinic Inventory', 'crm-chat': 'CRM Assistant',
  'digital-marketing': 'Digital Marketing', enquiries: 'Enquiries', invoices: 'Invoices',
  knowledge: 'Knowledge Library', medicine: 'Medicine', patients: 'Patients',
  'package-not-bought': 'Package Not Bought', 'reception-registers': 'Reception Registers',
  'receptionist-checklist': 'Receptionist Checklist', 'record-room': 'Record Room',
  'sales-sheet': 'Appointments & Sales', schedule: 'Schedules', speech: 'Speech',
  users: 'Team Members', webhook: 'Webhook', worksheet: 'Worksheet', auth: 'Account Security',
};

const cleanPath = (req) => String(req.originalUrl || req.url || '').split('?')[0].slice(0, 500);
const pathParts = (path) => path.split('/').filter(Boolean);
const title = (value) => String(value || '')
  .replace(/([a-z\d])([A-Z])/g, '$1 $2')
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function actionFor(method, path) {
  const lower = path.toLowerCase();
  if (method === 'DELETE') return lower.includes('cancel') ? 'Cancelled' : 'Deleted';
  const rules = [
    ['approve', 'Approved'], ['reject', 'Rejected'], ['refund', 'Refund action'],
    ['assign', 'Assigned'], ['reschedule', 'Rescheduled'], ['cancel', 'Cancelled'],
    ['close', 'Closed'], ['reopen', 'Reopened'], ['reactivate', 'Reactivated'],
    ['upload', 'Uploaded'], ['verify', 'Verified'], ['settle', 'Settled'],
    ['payment', 'Payment action'], ['receipt', 'Receipt action'], ['call', 'Call action'],
  ];
  const match = rules.find(([needle]) => lower.includes(needle));
  if (match) return match[1];
  if (method === 'POST') return 'Created';
  return 'Updated';
}

function safeFieldNames(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body)
    .filter((key) => !SENSITIVE_KEYS.test(key) && !['expectedRevision', 'submissionKey'].includes(key))
    .slice(0, 12);
}

function describe(req, module, action, path) {
  const fields = safeFieldNames(req.body);
  const parts = pathParts(path);
  const endpoint = parts.slice(2).filter((part) => !/^[a-f\d]{24}$/i.test(part)).map(title).join(' / ');
  const base = `${action} ${module}${endpoint ? `: ${endpoint}` : ''}`;
  return fields.length ? `${base}. Fields: ${fields.map(title).join(', ')}`.slice(0, 1000) : base.slice(0, 1000);
}

function attachCrmAudit(req, res) {
  if (!req.user || !WRITE_METHODS.has(req.method) || typeof res.once !== 'function') return;
  const path = cleanPath(req);
  if (path.startsWith('/api/crm-history')) return;
  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const parts = pathParts(path);
    const moduleKey = parts[1] || 'crm';
    const module = LABELS[moduleKey] || title(moduleKey);
    const action = actionFor(req.method, path);
    const targetId = parts.find((part) => /^[a-f\d]{24}$/i.test(part)) || '';
    CrmAuditLog.create({
      actor: req.user._id,
      actorName: req.user.name || 'Unknown user',
      actorRole: req.user.role,
      module,
      action,
      summary: describe(req, module, action, path),
      method: req.method,
      path,
      targetId,
      statusCode: res.statusCode,
      occurredAt: new Date(),
    }).catch((error) => console.error('CRM audit log could not be saved:', error.message));
  });
}

module.exports = { attachCrmAudit, actionFor, describe };
