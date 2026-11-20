// The same rules as backend/src/careTemplates/rules.js (keep the two in step): which blocks of a follow-up / family
// session form are visible, what counts as filled, and what is still missing before "Mark done".
export const RESPONSE = ['Available → Start', 'Busy → Schedule Again', 'Not Connected → Follow Contact SOP'];
export const RESPONSE_FAMILY = ['Available → Continue', 'Busy → Reschedule', 'Different Guardian → Authorization verify', 'Technical problem → Reschedule / Reconnect'];
export const responseOptions = (block) => (Array.isArray(block?.options) && block.options.length ? block.options : block?.family ? RESPONSE_FAMILY : RESPONSE);

const INPUT_TYPES = new Set(['response', 'one', 'many', 'text', 'date', 'time', 'check', 'list', 'auto', 'facts', 'grid', 'matrix', 'tasks', 'triage', 'link', 'final']);
export const blocksOf = (template) => (template?.sections || []).flatMap((section) => (section.blocks || []).map((block) => ({ ...block, section: section.title })));

export const filled = (value) => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some(filled);
  if (typeof value === 'object') return Object.values(value).some(filled);
  return true;
};
const matches = (value, list) => (Array.isArray(value) ? value.some((v) => list.includes(v)) : list.includes(value));
export const visible = (block, answers, byId) => {
  const rule = block.show;
  if (!rule) return true;
  const parent = byId?.get(rule.id);
  if (parent && parent !== block && !visible(parent, answers, byId)) return false;
  const value = answers?.[rule.id];
  if (rule.any) return matches(value, rule.any);
  if (rule.not) return filled(value) && !matches(value, rule.not);
  return filled(value);
};
export const indexOf = (template) => new Map(blocksOf(template).filter((b) => b.id).map((b) => [b.id, b]));

export const missingOf = (template, answers = {}) => {
  const blocks = blocksOf(template);
  const byId = new Map(blocks.filter((b) => b.id).map((b) => [b.id, b]));
  const missing = [];
  blocks.forEach((block) => {
    if (!block.id || !INPUT_TYPES.has(block.t) || !visible(block, answers, byId)) return;
    const value = answers[block.id];
    if (block.t === 'response') {
      const first = responseOptions(block)[0];
      if (value !== first) missing.push({ id: block.id, text: `${block.label || 'Response'}: the parent must be available ("${first}")` });
      return;
    }
    if (block.req && !filled(value)) missing.push({ id: block.id, text: block.label || block.id });
    if (block.t === 'tasks' && Array.isArray(value)) {
      value.forEach((task, i) => {
        if (task && filled(task.issue) && (!filled(task.owner) || !filled(task.due))) missing.push({ id: block.id, text: `Task T${i + 1}: Responsible Person and Due Date are mandatory` });
      });
    }
  });
  return missing;
};

// The value the CRM fills for a `from` key (see backend/src/utils/careContext.js valueOf).
export const contextValue = (context, from) => {
  if (!context || !from) return '';
  const [kind, code] = String(from).split(':');
  if (code && context.sessions?.[code] && kind !== 'med') {
    const s = context.sessions[code];
    if (kind === 'status') return s.status;
    if (kind === 'date') return s.at || s.date;
    if (kind === 'statusDate') return [s.status, s.at || s.date].filter(Boolean).join(' — ');
    if (kind === 'finalOf') return s.final;
    if (kind === 'actions') return s.actions;
  }
  return context.values?.[from] ?? '';
};

// [Child Name], [Parent Name], [Counsellor Name] ... in the scripts, from the CRM.
export const fillScript = (text, context) => String(text || '')
  .replaceAll('[Child Name]', context?.values?.patientName || '[Child Name]')
  .replaceAll('[Parent Name]', context?.values?.parentName || '[Parent Name]')
  .replaceAll('[Counsellor Name]', context?.values?.counsellor || '[Counsellor Name]')
  .replaceAll('[Name]', context?.values?.counsellor || '[Name]');
