// The clinic's follow-up and family session forms (MV-FU-01 … MV-FU-07, MV-FS-01 … MV-FS-03) as data templates.
// The DSL is described in blocks.js. Development Tracker (DT-01 … DT-03) templates are not given yet.
const LIST = [
  require('./fu01'), require('./fu02'), require('./fu03'), require('./fu04'), require('./fu05'), require('./fu06'), require('./fu07'),
  require('./fs01'), require('./fs02'), require('./fs03'),
];

const TEMPLATES = Object.fromEntries(LIST.map((template) => [template.code, template]));
const templateCodes = LIST.map((template) => template.code);
const templateOf = (code) => TEMPLATES[code] || null;

module.exports = { TEMPLATES, templateCodes, templateOf };
