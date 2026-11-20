// Rules every form follows, on the server (saving / marking done) and in the browser (the same logic in
// frontend/src/components/care/formRules.js): which blocks are visible, what "filled" means, what must be filled
// before "Mark done", and which triage answers go to the doctor.
const { responseOptions } = require('./blocks');

const INPUT_TYPES = new Set(['response', 'one', 'many', 'text', 'date', 'time', 'check', 'list', 'auto', 'facts', 'grid', 'matrix', 'tasks', 'triage', 'link', 'final']);
const blocksOf = (template) => (template?.sections || []).flatMap((section) => (section.blocks || []).map((block) => ({ ...block, section: section.title })));

const filled = (value) => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some(filled);
  if (typeof value === 'object') return Object.values(value).some(filled);
  return true;
};
const matches = (value, list) => (Array.isArray(value) ? value.some((v) => list.includes(v)) : list.includes(value));
// A block is shown when its `show` rule holds (and the block it depends on is shown itself).
const visible = (block, answers, byId) => {
  const rule = block.show;
  if (!rule) return true;
  const parent = byId?.get(rule.id);
  if (parent && parent !== block && !visible(parent, answers, byId)) return false;
  const value = answers?.[rule.id];
  if (rule.any) return matches(value, rule.any);
  if (rule.not) return filled(value) && !matches(value, rule.not);
  return filled(value);
};

// What is still missing before the session can be marked done ([] = ready).
const missingOf = (template, answers = {}) => {
  const blocks = blocksOf(template);
  const byId = new Map(blocks.filter((b) => b.id).map((b) => [b.id, b]));
  const missing = [];
  blocks.forEach((block) => {
    if (!block.id || !INPUT_TYPES.has(block.t) || !visible(block, answers, byId)) return;
    const value = answers[block.id];
    if (block.t === 'response') {
      const first = responseOptions(block)[0];
      if (value !== first) missing.push(`${block.label || 'Response'}: the parent must be available ("${first}") to complete the session — otherwise reschedule or record the call attempt`);
      return;
    }
    if (block.req && !filled(value)) missing.push(block.label || block.id);
    if (block.t === 'tasks' && Array.isArray(value)) {
      value.forEach((task, i) => {
        if (task && filled(task.issue) && (!filled(task.owner) || !filled(task.due))) missing.push(`Task T${i + 1}: Responsible Person and Due Date are mandatory`);
      });
    }
  });
  return missing;
};

// Triage answers that go to the doctor: [{ blockId, level, section, text }] (Emergency / Urgent Doctor Review).
const DOCTOR_LEVELS = ['Emergency', 'Urgent Doctor Review'];
const escalationsOf = (template, answers = {}) => {
  const blocks = blocksOf(template);
  const byId = new Map(blocks.filter((b) => b.id).map((b) => [b.id, b]));
  return blocks.filter((b) => b.t === 'triage' && visible(b, answers, byId) && DOCTOR_LEVELS.includes(answers[b.id])).map((block) => {
    const near = blocks.filter((b) => b.section === block.section && b.id && b !== block && ['text', 'matrix', 'one'].includes(b.t) && visible(b, answers, byId));
    const parts = near.map((b) => {
      const v = answers[b.id];
      if (!filled(v)) return '';
      if (typeof v === 'object') {
        const rows = Object.entries(v).map(([row, cells]) => {
          const label = (b.rows || []).find((r) => r.id === row)?.label || row;
          const text = typeof cells === 'object' ? Object.values(cells || {}).filter(filled).join(' / ') : cells;
          return filled(text) ? `${label}: ${text}` : '';
        }).filter(Boolean);
        return rows.join('; ');
      }
      return `${b.label || b.id}: ${v}`;
    }).filter(Boolean);
    return { blockId: block.id, level: answers[block.id], section: block.section || '', text: parts.join(' | ').slice(0, 1500) };
  });
};

// Answers are kept as sent, within limits (strings cut at 5000 characters, at most 400 keys).
const clip = (value, depth = 0) => {
  if (value == null) return value;
  if (typeof value === 'string') return value.slice(0, 5000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => clip(v, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 400).filter(([k]) => !k.startsWith('$') && !k.includes('.')).map(([k, v]) => [k, clip(v, depth + 1)]));
  return null;
};
const cleanAnswers = (answers) => (answers && typeof answers === 'object' && !Array.isArray(answers) ? clip(answers) : {});

module.exports = { blocksOf, filled, visible, missingOf, escalationsOf, cleanAnswers, DOCTOR_LEVELS };
