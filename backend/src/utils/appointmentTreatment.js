const iso = (value) => value ? new Date(value).toISOString() : null;
const LABELS = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };

const appointmentTreatment = (patient, phase) => {
  if (!patient) return null;
  const stage = (patient.stages || []).find((stage) => Number(stage.number) === Number(phase || patient.currentStage));
  if (!stage) return null;
  const transit = stage.transit || {};
  let status = stage.status || 'unknown';
  let label = LABELS[status] || status.replace(/_/g, ' ');
  let note = stage.notes || ''; let at = null; let byName = '';
  if (patient.isActive === false) {
    status = 'inactive'; label = 'Patient inactive'; note = patient.inactiveReason || ''; at = patient.inactivatedAt; byName = patient.inactivatedByName || '';
  } else if (transit.removedAt) {
    status = 'removed'; label = 'Removed from In Transit'; note = transit.removedReason || ''; at = transit.removedAt; byName = transit.removedByName || '';
  } else if (transit.holdActive) {
    status = 'on_hold'; label = 'On hold'; note = transit.holdReason || ''; at = transit.holdAt; byName = transit.holdByName || '';
  }
  return {
    phase: stage.number, activated: Boolean(transit.activatedAt), activatedAt: iso(transit.activatedAt), activatedByName: transit.activatedByName || '',
    medicineStartDate: iso(transit.medicineStartDate), startSetAt: iso(transit.medicineStartSetAt), startSetByName: transit.medicineStartSetByName || '',
    startNote: transit.medicineStartNote || '',
    explanation: {
      scheduledFor: iso(stage.medicineExplainDate), mode: transit.explanationMode || '',
      completedAt: iso(transit.explanationCompletedAt), completedByName: transit.explanationCompletedByName || '', note: transit.explanationNote || '',
    },
    status, label, stageStatus: stage.status || 'unknown', stageDate: iso(stage.date), note, at: iso(at), byName,
  };
};
module.exports = { appointmentTreatment };
