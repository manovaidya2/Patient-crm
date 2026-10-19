// Matching a patient to their Records Room PDFs. The Patient ID is typed by hand in several places, so "A-3297",
// "A- 3297" and " a-3297 " all mean the same patient; some Records Room entries also have the ID typed into the
// Appointment ID box instead of the Patient ID box.
const SEPARATORS = '[\\s\\-_.]*';

// "A- 3297" -> "A3297"
const looseKey = (code) => (String(code ?? '').toUpperCase().match(/[A-Z0-9]+/g) || []).join('');

// Regex source that matches the key with any spaces / dashes / dots between its characters.
const looseSource = (code) => {
  const key = looseKey(code);
  if (key.length < 3) return null; // too short to be a real ID: never match on it
  return `^${SEPARATORS}${key.split('').join(SEPARATORS)}${SEPARATORS}$`;
};

// The $or conditions for RecordRoom.find.
const recordRoomConditions = ({ patientRef, patientCode, appointmentCodes = [] }) => {
  const conditions = [{ patient: patientRef }];
  const source = looseSource(patientCode);
  if (source) {
    conditions.push({ patientId: { $regex: source, $options: 'i' } });
    conditions.push({ appointmentId: { $regex: source, $options: 'i' } });
  }
  const codes = [...new Set(appointmentCodes.map((code) => String(code || '').trim()).filter(Boolean))];
  if (codes.length) conditions.push({ appointmentId: { $in: codes } });
  return conditions;
};

module.exports = { looseKey, looseSource, recordRoomConditions };
