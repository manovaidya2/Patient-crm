const Patient = require('../models/Patient');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const PatientHelpDeskQuery = require('../models/PatientHelpDeskQuery');
const SalesSheetColumn = require('../models/SalesSheetColumn');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const serialize = (query) => ({
  id: String(query._id), patientId: query.patient ? String(query.patient) : null, patientCode: query.patientCode,
  patientName: query.patientName, appointmentCode: query.appointmentCode,
  appointmentId: query.appointmentManagement ? String(query.appointmentManagement) : (query.appointment ? String(query.appointment) : null),
  issue: query.issue, askedBy: query.askedBy, reference: query.reference,
  sentTo: query.sentTo, notes: query.notes, solution: query.solution, solutionReference: query.solutionReference,
  solutionGivenByName: query.solutionGivenByName, solutionGivenAt: query.solutionGivenAt,
  status: query.status, createdByName: query.createdByName, createdAt: query.createdAt,
  updatedAt: query.updatedAt,
  history: (query.history || []).map((item) => ({ id: String(item._id), action: item.action, note: item.note, actorName: item.actorName, actorRole: item.actorRole, createdAt: item.createdAt })),
});

const findPatientFromAppointment = async (appointment) => {
  const values = appointment?.values instanceof Map ? Object.fromEntries(appointment.values) : (appointment?.values || {});
  const candidates = Object.values(values).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean);
  return Patient.findOne({ patientCode: { $in: candidates } });
};

const lookup = asyncHandler(async (req, res) => {
  const identifier = String(req.query.identifier || '').trim();
  if (!identifier) return res.status(400).json({ success: false, message: 'Enter an Appointment ID or Patient ID' });
  const normalized = identifier.toUpperCase();
  let patient = await Patient.findOne({ patientCode: normalized }).lean();
  const management = await AppointmentManagementEntry.findOne({ appointmentCode: normalized }).lean();
  const appointment = management ? { _id: management._id, appointmentCode: management.appointmentCode, values: management.salesValues } : null;
  if (appointment && !patient) patient = await findPatientFromAppointment(appointment);
  if (!patient && !appointment) return res.status(404).json({ success: false, message: 'No patient or appointment found for this ID' });
  let appointmentDetails = [];
  if (appointment) {
    const values = appointment.values instanceof Map ? Object.fromEntries(appointment.values) : (appointment.values || {});
    const columns = await SalesSheetColumn.find({ isActive: true }).sort({ order: 1 }).lean();
    appointmentDetails = columns.map((column) => ({ label: column.label, value: values[String(column._id)] || '' })).filter((item) => item.value);
  }
  res.json({ success: true, patient: patient ? { id: String(patient._id), patientCode: patient.patientCode, patientName: patient.patientName, category: patient.category, number: patient.number } : null, appointment: appointment ? { id: appointment._id ? String(appointment._id) : null, appointmentCode: appointment.appointmentCode, details: appointmentDetails } : null });
});

const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status && ['open', 'in_progress', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.search) {
    const search = new RegExp(String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ patientCode: search }, { patientName: search }, { issue: search }, { appointmentCode: search }];
  }
  const queries = await PatientHelpDeskQuery.find(filter).sort({ updatedAt: -1 }).lean();
  res.json({ success: true, queries: queries.map(serialize) });
});

const create = asyncHandler(async (req, res) => {
  const patient = req.body.patientId ? await Patient.findById(req.body.patientId).lean() : null;
  if (req.body.patientId && !patient) return res.status(404).json({ success: false, message: 'Patient not found' });
  if (!patient && !req.body.appointmentId && !String(req.body.appointmentCode || '').trim()) return res.status(400).json({ success: false, message: 'A patient or appointment reference is required' });
  const issue = String(req.body.issue || '').trim();
  if (!issue) return res.status(400).json({ success: false, message: 'Issue is required' });
  const entry = await PatientHelpDeskQuery.create({
    patient: patient?._id || null, patientCode: patient?.patientCode || '', patientName: patient?.patientName || '',
    appointmentManagement: req.body.appointmentId || null, appointmentCode: String(req.body.appointmentCode || '').trim(),
    issue, askedBy: String(req.body.askedBy || '').trim(), reference: String(req.body.reference || '').trim(),
    sentTo: String(req.body.sentTo || '').trim(), notes: String(req.body.notes || '').trim(),
    createdBy: req.user._id, createdByName: req.user.name,
    history: [{ action: 'Ticket created', note: issue, actorName: req.user.name, actorRole: req.user.role }],
  });
  res.status(201).json({ success: true, query: serialize(entry) });
});

const resolve = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.RECEPTIONIST) return res.status(403).json({ success: false, message: 'Only a receptionist can provide the patient solution' });
  const entry = await PatientHelpDeskQuery.findById(req.params.id);
  if (!entry) return res.status(404).json({ success: false, message: 'Help Desk ticket not found' });
  const solution = String(req.body.solution || '').trim();
  const solutionReference = String(req.body.solutionReference || '').trim();
  const sentTo = String(req.body.sentTo || '').trim();
  if (!solution) return res.status(400).json({ success: false, message: 'Solution is required' });
  entry.sentTo = sentTo; entry.reference = solutionReference; entry.solution = solution; entry.solutionReference = solutionReference; entry.solutionGivenByName = req.user.name; entry.solutionGivenAt = new Date(); entry.status = 'resolved';
  entry.history.push({ action: 'Solution provided and ticket resolved', note: `${solution}${sentTo ? ` | Sent to: ${sentTo}` : ''}${solutionReference ? ` | Reference: ${solutionReference}` : ''}`, actorName: req.user.name, actorRole: req.user.role });
  await entry.save();
  res.json({ success: true, query: serialize(entry) });
});

module.exports = { lookup, list, create, resolve };
