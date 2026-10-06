const mongoose = require('mongoose');
const CrmAuditLog = require('../models/CrmAuditLog');
const { asyncHandler } = require('../middleware/errorHandler');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(new Date(`${value}T00:00:00+05:30`).getTime());
const indiaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const startOfIndiaDate = (value) => new Date(`${value}T00:00:00.000+05:30`);
const endOfIndiaDate = (value) => new Date(`${value}T23:59:59.999+05:30`);

const listHistory = asyncHandler(async (req, res) => {
  const from = String(req.query.from || indiaToday());
  const to = String(req.query.to || from);
  if (!validDate(from) || !validDate(to) || from > to) return res.status(400).json({ message: 'Select a valid date range' });

  const filter = { occurredAt: { $gte: startOfIndiaDate(from), $lte: endOfIndiaDate(to) } };
  if (req.query.actor) {
    if (!mongoose.isObjectIdOrHexString(req.query.actor)) return res.status(400).json({ message: 'Invalid person filter' });
    filter.actor = req.query.actor;
  }
  for (const key of ['module', 'action', 'role']) {
    const value = String(req.query[key] || '').trim().slice(0, 100);
    if (value) filter[key === 'role' ? 'actorRole' : key] = value;
  }
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ actorName: regex }, { summary: regex }, { module: regex }, { action: regex }];
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 50));
  const [logs, total, grouped] = await Promise.all([
    CrmAuditLog.find(filter).sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CrmAuditLog.countDocuments(filter),
    CrmAuditLog.aggregate([{ $match: filter }, { $group: { _id: '$action', count: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(grouped.map((item) => [item._id, item.count]));
  res.json({
    logs: logs.map((log) => ({
      id: String(log._id), actorId: String(log.actor), actorName: log.actorName,
      actorRole: log.actorRole, module: log.module, action: log.action,
      summary: log.summary, targetId: log.targetId,
      statusCode: log.statusCode, occurredAt: log.occurredAt,
    })),
    total, page, pages: Math.max(1, Math.ceil(total / limit)), counts, from, to,
  });
});

const listFilters = asyncHandler(async (_req, res) => {
  const [people, modules, actions, roles] = await Promise.all([
    CrmAuditLog.aggregate([
      { $sort: { occurredAt: -1 } },
      { $group: { _id: '$actor', name: { $first: '$actorName' }, role: { $first: '$actorRole' } } },
      { $sort: { name: 1 } },
    ]),
    CrmAuditLog.distinct('module'),
    CrmAuditLog.distinct('action'),
    CrmAuditLog.distinct('actorRole'),
  ]);
  res.json({
    people: people.map((person) => ({ id: String(person._id), name: person.name, role: person.role })),
    modules: modules.sort(), actions: actions.sort(), roles: roles.sort(),
  });
});

module.exports = { listHistory, listFilters, indiaToday };
