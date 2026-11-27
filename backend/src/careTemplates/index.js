// The clinic's forms as data templates (the DSL is described in blocks.js). The plan of 2026-11-26 (utils/careSchedule.js):
//   Foundation sessions FCF-01 … FCF-07 (version 1), Medical Follow-ups FU-01 … FU-06 and Family Sessions FS-01 … FS-03
//   (version 2). Development Trackers (DT-01, DT-02) have no form: they are sent and their filled link is pasted.
// legacy/: the earlier forms (version 1: FU-01 … FU-07 on days 10 … 170, FS-01 … FS-03). A form saved on one keeps it,
// and a session made on the earlier plan (careSchedule.isLegacySession) still opens with it.
const { isLegacySession } = require('../utils/careSchedule');

const CURRENT = [
  require('./fcf01'), require('./fcf02'), require('./fcf03'), require('./fcf04'), require('./fcf05'), require('./fcf06'), require('./fcf07'),
  require('./fs01'), require('./fu01'), require('./fu02'), require('./fu03'), require('./fs02'), require('./fu04'), require('./fu05'), require('./fs03'), require('./fu06'),
];
const LEGACY = [
  require('./legacy/fu01'), require('./legacy/fu02'), require('./legacy/fu03'), require('./legacy/fu04'), require('./legacy/fu05'), require('./legacy/fu06'), require('./legacy/fu07'),
  require('./legacy/fs01'), require('./legacy/fs02'), require('./legacy/fs03'),
];

const TEMPLATES = Object.fromEntries(CURRENT.map((template) => [template.code, template]));
const LEGACY_BY_CODE = Object.fromEntries(LEGACY.map((template) => [template.code, template]));
const templateCodes = CURRENT.map((template) => template.code);
const templateOf = (code) => TEMPLATES[code] || null;
const legacyTemplateOf = (code) => LEGACY_BY_CODE[code] || null;
const templateByKey = (key, version) => [...CURRENT, ...LEGACY].find((t) => t.key === key && Number(t.version || 1) === Number(version || 1)) || null;

// The form a session opens with: the one its saved form was filled on; else, for a session of the earlier plan, the
// earlier form of its code; else the current one. null when there is none (a tracker).
const templateForSession = (session) => {
  const form = session?.form || {};
  const saved = form.templateKey ? templateByKey(form.templateKey, form.version) : null;
  if (saved) return saved;
  if (isLegacySession(session)) return legacyTemplateOf(session?.code);
  return templateOf(session?.code);
};

module.exports = { TEMPLATES, templateCodes, templateOf, legacyTemplateOf, templateByKey, templateForSession };
