const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATES, templateCodes, templateOf } = require('./index');

const DAYS = { 'FU-01': 10, 'FU-02': 20, 'FU-03': 50, 'FU-04': 80, 'FU-05': 110, 'FU-06': 140, 'FU-07': 170, 'FS-01': 15, 'FS-02': 105, 'FS-03': 165 };
const blocksOf = (template) => template.sections.flatMap((section) => section.blocks);
const CHOICE = new Set(['one', 'many', 'final']);

test('all ten templates are listed with their code, key, kind and day', () => {
  assert.deepEqual(templateCodes, Object.keys(DAYS));
  for (const code of templateCodes) {
    const t = TEMPLATES[code];
    assert.equal(templateOf(code), t);
    assert.equal(t.key, `MV-${code}`);
    assert.equal(t.kind, code.startsWith('FU') ? 'followup' : 'family');
    assert.equal(t.day, DAYS[code]);
    assert.equal(t.seq, Number(code.slice(3)));
    assert.ok(t.title && t.subtitle && t.meta.length >= 4, `${code} header`);
    assert.ok(t.sections.length >= 8 && t.sections.every((s) => s.title && Array.isArray(s.blocks) && s.blocks.length), `${code} sections`);
  }
  assert.equal(templateOf('DT-01'), null);
});

for (const code of Object.keys(DAYS)) {
  test(`${code}: ids, show rules, options, final and response`, () => {
    const blocks = blocksOf(TEMPLATES[code]);
    const seen = new Set();
    for (const block of blocks) {
      assert.ok(block.t, `${code}: block without type`);
      if (block.show) {
        assert.ok(seen.has(block.show.id), `${code}: show.id "${block.show.id}" must be an earlier block`);
        assert.ok(Array.isArray(block.show.any || block.show.not), `${code}: show needs any / not`);
      }
      if (block.id) {
        assert.ok(!seen.has(block.id), `${code}: duplicate id "${block.id}"`);
        seen.add(block.id);
      } else {
        assert.ok(['say', 'note', 'info'].includes(block.t), `${code}: ${block.t} block needs an id`);
      }
      if (CHOICE.has(block.t)) assert.ok(block.options?.length >= 2, `${code}: ${block.id} needs 2+ options`);
      if (block.t === 'grid') block.rows.forEach((row) => assert.ok(row.options?.length >= 2, `${code}: grid ${block.id}.${row.id} needs 2+ options`));
      if (['facts', 'matrix', 'grid'].includes(block.t)) {
        const rowIds = block.rows.map((row) => row.id);
        assert.equal(new Set(rowIds).size, rowIds.length, `${code}: duplicate row id in ${block.id}`);
      }
      if (block.t === 'matrix') block.columns.filter((c) => c.type === 'one').forEach((c) => assert.ok(c.options?.length >= 2, `${code}: ${block.id}.${c.id} options`));
      if (block.t === 'link') assert.match(block.code, /^(FU|FS|DT)-0\d$/, `${code}: link ${block.id}`);
      if (block.t === 'triage') assert.deepEqual(block.levels.map((l) => l.value), ['Emergency', 'Urgent Doctor Review', 'Routine Support']);
    }
    const finals = blocks.filter((b) => b.t === 'final');
    assert.equal(finals.length, 1, `${code}: exactly one final`);
    assert.equal(finals[0].req, true);
    assert.equal(finals[0].id, 'final');
    assert.ok(blocks.some((b) => b.t === 'response' && b.id === 'response'), `${code}: response block`);
    for (const id of ['mode', 'spokeWith', 'safety', 'triage', 'tasks']) assert.ok(seen.has(id), `${code}: well-known id "${id}"`);
    if (code.startsWith('FU')) assert.ok(seen.has('caseNote'), `${code}: caseNote`);
    else {
      assert.ok(seen.has('trainingStatus'), `${code}: trainingStatus`);
      assert.ok(seen.has('homeActions'), `${code}: homeActions (agreed home actions)`);
    }
  });
}
