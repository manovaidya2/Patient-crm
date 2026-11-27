const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATES, templateCodes, templateOf, legacyTemplateOf } = require('./index');
const C = require('../utils/careSchedule');

const blocksOf = (template) => template.sections.flatMap((section) => section.blocks);
const CHOICE = new Set(['one', 'many', 'final']);
const optionsOf = (block) => (block.t === 'triage' ? block.levels.map((l) => l.value) : block.t === 'list' ? block.items : block.options);

// The forms of the plan of 2026-11-26 and the earlier ones (legacy/, kept for the forms saved on them).
const LEGACY_DAYS = { 'FU-01': 10, 'FU-02': 20, 'FU-03': 50, 'FU-04': 80, 'FU-05': 110, 'FU-06': 140, 'FU-07': 170, 'FS-01': 15, 'FS-02': 105, 'FS-03': 165 };
const LEGACY = Object.keys(LEGACY_DAYS).map(legacyTemplateOf);
const CURRENT = templateCodes.map(templateOf);

test('every form of the plan has its template with the plan\'s code, key, kind, day and version', () => {
  const formCodes = C.PLAN.filter((item) => item.kind !== 'tracker').map((item) => item.code);
  assert.deepEqual([...templateCodes].sort(), [...formCodes].sort());
  for (const code of templateCodes) {
    const t = TEMPLATES[code];
    const item = C.PLAN_BY_CODE[code];
    assert.equal(templateOf(code), t);
    assert.equal(t.key, `MV-${code}`);
    assert.equal(t.kind, item.kind);
    assert.equal(t.day, item.day, `${code} day`);
    assert.equal(t.seq, item.seq, `${code} seq`);
    assert.equal(t.version, item.kind === 'foundation' ? 1 : 2, `${code} version`);
    assert.ok(t.title && Array.isArray(t.meta) && t.meta.length >= 3, `${code} header`);
    assert.ok(t.sections.length >= 4 && t.sections.every((s) => s.title && Array.isArray(s.blocks) && s.blocks.length), `${code} sections`);
  }
  assert.equal(templateOf('DT-01'), null);
  assert.equal(templateOf('FU-07'), null, 'no FU-07 in the plan');
});

test('the earlier forms stay (version 1) for the sessions and forms made on them', () => {
  for (const t of LEGACY) {
    assert.ok(t, 'legacy template');
    assert.equal(t.version, 1);
    assert.equal(t.day, LEGACY_DAYS[t.code]);
    assert.notEqual(t, templateOf(t.code));
  }
});

for (const t of [...CURRENT, ...LEGACY]) {
  const name = `${t.code} v${t.version}`;
  test(`${name}: ids, show rules, options, links, final and response`, () => {
    const blocks = blocksOf(t);
    const byId = new Map();
    for (const block of blocks) {
      assert.ok(block.t, `${name}: block without type`);
      if (block.id) {
        assert.ok(!byId.has(block.id), `${name}: duplicate id "${block.id}"`);
        byId.set(block.id, block);
      } else {
        assert.ok(['say', 'note', 'info'].includes(block.t), `${name}: ${block.t} block needs an id`);
      }
      if (CHOICE.has(block.t)) assert.ok(block.options?.length >= 2, `${name}: ${block.id} needs 2+ options`);
      if (block.t === 'grid') block.rows.forEach((row) => assert.ok(row.options?.length >= 2, `${name}: grid ${block.id}.${row.id} needs 2+ options`));
      if (['facts', 'matrix', 'grid'].includes(block.t)) {
        const rowIds = block.rows.map((row) => row.id);
        assert.equal(new Set(rowIds).size, rowIds.length, `${name}: duplicate row id in ${block.id}`);
      }
      if (block.t === 'matrix') block.columns.filter((c) => c.type === 'one').forEach((c) => assert.ok(c.options?.length >= 2, `${name}: ${block.id}.${c.id} options`));
      if (block.t === 'link' && t.version > 1) assert.ok(C.PLAN_BY_CODE[block.code], `${name}: link ${block.id} to ${block.code} (in the plan)`);
      if (block.t === 'triage') assert.deepEqual(block.levels.map((l) => l.value), ['Emergency', 'Urgent Doctor Review', 'Routine Support']);
    }
    for (const block of blocks.filter((b) => b.show)) {
      const target = byId.get(block.show.id);
      assert.ok(target, `${name}: show.id "${block.show.id}" must be a block of the form`);
      assert.ok(Array.isArray(block.show.any || block.show.not), `${name}: show needs any / not`);
      const options = optionsOf(target);
      if (options && target.t !== 'response') [...(block.show.any || []), ...(block.show.not || [])].forEach((v) => assert.ok(options.includes(v), `${name}: show value "${v}" is not an option of "${block.show.id}"`));
    }
    const finals = blocks.filter((b) => b.t === 'final');
    assert.equal(finals.length, 1, `${name}: exactly one final`);
    assert.equal(finals[0].id, 'final');
    assert.equal(blocks.filter((b) => b.t === 'response' && b.id === 'response').length, 1, `${name}: one response block`);
    if (t.kind === 'family') {
      assert.ok(byId.has('trainingStatus'), `${name}: trainingStatus`);
      assert.ok(byId.has('homeActions'), `${name}: homeActions (agreed home actions)`);
    }
  });
}

test('every earlier answer a form shows (ans:CODE:block[.row]) is a block of that form', () => {
  const keys = CURRENT.flatMap((t) => blocksOf(t).flatMap((b) => [b.from, ...(Array.isArray(b.rows) ? b.rows : []).map((r) => r.from)]).filter((f) => String(f || '').startsWith('ans:')).map((from) => ({ from, in: t.code })));
  assert.ok(keys.length > 0, 'the forms carry answers forward');
  for (const { from, in: code } of keys) {
    const [, codes, path] = from.split(':');
    const [blockId, rowId] = path.split('.');
    const found = codes.split('|').some((c) => {
      const block = blocksOf(TEMPLATES[c] || { sections: [] }).find((b) => b.id === blockId);
      return block && (!rowId || (block.rows || []).some((r) => r.id === rowId));
    });
    assert.ok(found, `${code}: "${from}" — no such block${rowId ? ' / row' : ''} in ${codes}`);
  }
});

test('the carry-forward ids the forms agreed on', () => {
  const has = (code, id) => blocksOf(TEMPLATES[code]).some((b) => b.id === id);
  [['FS-01', 'childIssues'], ['FS-01', 'homeActions'], ['FS-01', 'mainConcern'], ['FU-01', 'ladder'], ['FU-03', 'fs02Point1'], ['FU-05', 'observation'], ['FS-03', 'homeActions'], ['FCF-07', 'routineCard']]
    .forEach(([code, id]) => assert.ok(has(code, id), `${code} has "${id}"`));
  const actions = blocksOf(TEMPLATES['FS-01']).find((b) => b.id === 'homeActions');
  assert.deepEqual(actions.rows.map((r) => r.id), ['a1', 'a2']);
  assert.ok(actions.columns.some((c) => c.id === 'activity'), 'homeActions has the activity column (the CRM reads it)');
});
