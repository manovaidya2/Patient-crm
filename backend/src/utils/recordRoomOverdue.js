const RecordRoom = require('../models/RecordRoom');

const DAY = 86400000;
const IST = 330 * 60000;
const startOfIndiaDay = (date = new Date()) => Math.floor((new Date(date).getTime() + IST) / DAY) * DAY - IST;
const uploadTiming = (record, now = new Date()) => {
  const received = record.firstReceivedAt || record.createdAt;
  const deadline = received ? startOfIndiaDay(received) + DAY : null;
  const uploaded = Boolean(record.documents?.length || record.pdfUrl || Number(record.pdfPageCount) > 0);
  return {
    uploadStatus: uploaded ? 'uploaded' : deadline !== null && new Date(now).getTime() >= deadline ? 'overdue' : 'pending',
    uploadDueAt: deadline === null ? null : new Date(deadline - 1).toISOString(),
    overdueDays: !uploaded && deadline !== null ? Math.max(0, Math.floor((new Date(now).getTime() - deadline) / DAY) + 1) : 0,
  };
};

// Existing records with no received date use their creation day. Uploaded scans / legacy PDFs are already complete.
const overdueFilter = (now = new Date()) => ({
  'documents.0': { $exists: false },
  pdfUrl: { $in: ['', null] },
  pdfPageCount: { $not: { $gt: 0 } },
  $expr: { $and: [
    { $ne: [{ $ifNull: ['$firstReceivedAt', '$createdAt'] }, null] },
    { $lt: [{ $ifNull: ['$firstReceivedAt', '$createdAt'] }, new Date(startOfIndiaDay(now))] },
  ] },
});
const overdueRecords = (limit = 0, skip = 0, now = new Date()) => {
  let query = RecordRoom.find(overdueFilter(now)).select('-documents -issueHistory').sort({ firstReceivedAt: 1, createdAt: 1, _id: 1 }).skip(skip);
  if (limit) query = query.limit(limit);
  return query.lean();
};
const overdueCount = (now = new Date()) => RecordRoom.countDocuments(overdueFilter(now));

module.exports = { startOfIndiaDay, uploadTiming, overdueFilter, overdueRecords, overdueCount };
