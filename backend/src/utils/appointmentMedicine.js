const { buildJobView } = require('./medicineJobFlow');

// Read the same stage definitions and saved approvals used by the fulfilment job. This view never completes a step.
const appointmentMedicine = (job) => {
  if (!job) return null;
  const view = buildJobView(job, { includeEvents: true });
  return {
    id: view.id, status: view.status, progress: view.progress, readyByDate: view.readyByDate,
    current: view.status === 'cancelled' ? 'Cancelled' : view.status === 'released' ? 'Released to In Transit' : view.status === 'ready' ? 'Ready — awaiting release' : view.stages.find((stage) => stage.state === 'current')?.label || '',
    requestedAt: view.requestedAt, requestedByName: view.requestedByName || '', requestNotes: view.requestNotes || '',
    hold: view.hold, returned: view.returned, returns: view.returns,
    stages: view.stages.map((stage, index) => ({
      key: stage.key, number: index + 1, label: stage.label, state: stage.state,
      at: stage.doneAt, byName: stage.doneByName, byRole: stage.doneByRole,
      notes: stage.notes, values: (stage.fields || []).filter((field) => stage.values[field.key] !== undefined && stage.values[field.key] !== null && stage.values[field.key] !== '').map((field) => ({ label: field.label, type: field.type, value: stage.values[field.key] })),
      checks: stage.state === 'done' ? stage.checks.filter((_, index) => stage.checksDone[index]) : [],
      oldFlow: Boolean(stage.snapshot?.oldFlow),
    })),
    doctorVerification: view.doctorVerification, finalVerification: view.finalVerification,
    boxReceipt: view.boxReceipt, release: view.releaseRequest, photos: view.photos,
    consumption: view.consumption.map(({ code, name, unit, planned, actual }) => ({ code, name, unit, planned, actual })),
    chits: view.chits.map(({ chitNo, name, dose, when, confirmed, confirmedAt, confirmedByName }) => ({ chitNo, name, dose, when, confirmed, confirmedAt, confirmedByName })),
    events: view.events.map(({ at, action, details, byName, byRole }) => ({ at, action, details, byName, byRole })),
  };
};

module.exports = { appointmentMedicine };
