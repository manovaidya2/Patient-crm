// A PCC's (Patient Care Coordinator, role assistant_doctor) calendar, shown when In Transit picks the PCC and the
// medicine explanation date: their follow-ups, family sessions and medicine explanations per day. PCCs are off on
// Wednesday, so no explanation is booked on a Wednesday; on Saturday, Sunday and Tuesday only from 2 pm.
const mongoose = require('mongoose');

const OFF_WEEKDAYS = [3]; // 0 = Sunday ... 3 = Wednesday (India time)
// Days the PCCs take bookings only from this hour (India time).
const AFTERNOON_WEEKDAYS = [6, 0, 2]; // Saturday, Sunday, Tuesday
const AFTERNOON_FROM_HOUR = 14;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const istWeekday = (value) => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[new Date(value).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' })];
const isOffDay = (value) => OFF_WEEKDAYS.includes(istWeekday(value));
const offDayText = () => OFF_WEEKDAYS.map((d) => WEEKDAY_NAMES[d]).join(', ');
const istHour = (value) => Number(new Date(value).toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
// Why this time cannot be booked for a PCC, or '' when it can.
const slotProblem = (value) => {
  if (!value) return '';
  if (isOffDay(value)) return `PCCs are off on ${offDayText()}. Choose another day for the medicine explanation.`;
  if (AFTERNOON_WEEKDAYS.includes(istWeekday(value)) && istHour(value) < AFTERNOON_FROM_HOUR) return `On ${WEEKDAY_NAMES[istWeekday(value)]} the PCCs take bookings only from 2 pm. Choose 2 pm or later.`;
  return '';
};
const assertWorkingDay = (value) => {
  const problem = slotProblem(value);
  if (problem) throw Object.assign(new Error(problem), { statusCode: 400 });
};

const OPEN = (entry) => !['completed', 'cancelled'].includes(entry?.status);

// Everything booked for the PCC between from and to: [{ at, type, patientName, patientCode, phase, patientId }].
const pccEvents = async (pccId, from, to) => {
  const Patient = require('../models/Patient');
  const id = new mongoose.Types.ObjectId(String(pccId));
  const patients = await Patient.find({ isActive: { $ne: false }, $or: [{ assignedDoctor: id }, { 'stages.transit.explanationDoctor': id }] })
    .select('patientName patientCode assignedDoctor stages.number stages.followUps.dateTime stages.followUps.status stages.familySessions.dateTime stages.familySessions.status stages.medicineExplainDate stages.transit.explanationDoctor stages.transit.explanationCompletedAt')
    .lean();
  const inRange = (at) => at && new Date(at) >= from && new Date(at) < to;
  const events = [];
  patients.forEach((p) => {
    const own = String(p.assignedDoctor || '') === String(id);
    (p.stages || []).forEach((s) => {
      const base = { patientId: String(p._id), patientName: p.patientName, patientCode: p.patientCode || '', phase: s.number };
      if (own) {
        (s.followUps || []).filter((e) => OPEN(e) && inRange(e.dateTime)).forEach((e) => events.push({ ...base, at: e.dateTime, type: 'followup' }));
        (s.familySessions || []).filter((e) => OPEN(e) && inRange(e.dateTime)).forEach((e) => events.push({ ...base, at: e.dateTime, type: 'family_session' }));
      }
      const explainer = s.transit?.explanationDoctor ? String(s.transit.explanationDoctor) === String(id) : own;
      if (explainer && !s.transit?.explanationCompletedAt && inRange(s.medicineExplainDate)) events.push({ ...base, at: s.medicineExplainDate, type: 'explanation' });
    });
  });
  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
};

module.exports = { OFF_WEEKDAYS, AFTERNOON_WEEKDAYS, AFTERNOON_FROM_HOUR, slotProblem, istWeekday, isOffDay, assertWorkingDay, pccEvents };
