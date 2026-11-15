const { getDisplayStatus, DISPLAY_STATUS_LABELS } = require('../constants/scheduleStatuses');
const D = require('./treatmentDelivery');
const iso = (value) => value ? new Date(value).toISOString() : null;

const appointmentSessions = (patient, phase, now = new Date()) => {
  if (!patient) return null;
  const stage = (patient.stages || []).find((stage) => Number(stage.number) === Number(phase || patient.currentStage));
  if (!stage) return null;
  const sessions = [['followUps', 'Follow-up'], ['familySessions', 'Family session']].flatMap(([list, kind]) => (stage[list] || []).map((entry) => {
    const delivery = entry.delivery;
    const state = delivery ? D.stateOf(entry, now) : getDisplayStatus(entry, now);
    return {
      id: String(entry._id || ''), list, kind, title: delivery?.title || (list === 'familySessions' ? 'Family session' : ({ normal: 'Follow-up', sfs: 'SFS', tracker: 'Tracker', video: 'Video follow-up' }[entry.followUpType] || 'Follow-up')),
      dateTime: iso(entry.dateTime), status: entry.status, state, stateLabel: (delivery ? D.STATE_LABELS : DISPLAY_STATUS_LABELS)[state] || state,
      notes: entry.notes || '', createdAt: iso(entry.createdAt), createdByName: entry.createdByName || '',
      mode: delivery?.mode || '', role: delivery?.role || 'pcc', duration: delivery?.duration || 0,
      confirmedAt: iso(delivery?.confirmedAt), confirmedByName: delivery?.confirmedByName || '',
      missedAt: iso(delivery?.missedAt), missedByName: delivery?.missedByName || '', missReason: delivery?.missReason || '',
      movedAt: iso(delivery?.movedAt), rescheduledFrom: delivery?.rescheduledFrom || '', rescheduledTo: delivery?.rescheduledTo || '', rescheduleReason: delivery?.rescheduleReason || '',
      completedAt: iso(entry.completedAt), completedByName: entry.completedByName || '', completionName: entry.completionName || '', completionDetails: entry.completionDetails || '',
      outcome: entry.outcome || '', outcomeNote: entry.outcomeNote || '', outcomeAt: iso(entry.outcomeAt), outcomeByName: entry.outcomeByName || '',
      cancelledAt: iso(entry.cancelledAt), cancelledByName: entry.cancelledByName || '', cancelReason: entry.cancelReason || '',
      trackerSentAt: iso(entry.trackerSentAt), trackerSentByName: entry.trackerSentByName || '', videoRequestedAt: iso(entry.videoRequestedAt), videoRequestedByName: entry.videoRequestedByName || '',
      files: [...(entry.completionFiles || []), ...(entry.completionPdfUrl ? [{ url: entry.completionPdfUrl, fileName: entry.completionPdfName || 'Completion form PDF' }] : []), ...(entry.videoUrl ? [{ url: entry.videoUrl, fileName: entry.videoFileName || 'Session video' }] : [])],
      trackerSubmissionUrl: entry.trackerSubmissionUrl || '', meetRecordingUrl: entry.meetRecordingUrl || '',
      checklist: (delivery?.checklist || []).map(({ text, answer, reason }) => ({ text, answer, reason })),
      close: delivery?.close ? { ...delivery.close, understanding: D.UNDERSTANDING[delivery.close.understanding] || delivery.close.understanding, recording: D.RECORDING[delivery.close.recording] || delivery.close.recording } : null,
    };
  })).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  const byId = new Map(sessions.map((session) => [session.id, session]));
  sessions.forEach((session) => {
    session.rescheduledFromAt = byId.get(session.rescheduledFrom)?.dateTime || null;
    session.rescheduledToAt = byId.get(session.rescheduledTo)?.dateTime || null;
  });
  const closed = (session) => ['done', 'done_late', 'cancelled', 'rescheduled'].includes(session.state);
  return {
    phase: stage.number, assignedPcc: patient.assignedDoctor?.name || '', total: sessions.length,
    completed: sessions.filter((session) => ['done', 'done_late'].includes(session.state)).length,
    pending: sessions.filter((session) => !closed(session)).length,
    cancelled: sessions.filter((session) => ['cancelled', 'rescheduled'].includes(session.state)).length,
    nextPendingAt: sessions.find((session) => !closed(session))?.dateTime || null,
    sessions,
  };
};

module.exports = { appointmentSessions };
