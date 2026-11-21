const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const { jobStep, requestStep, splitSteps, requestSteps } = require('./pendingStepsController');
const { STAGES } = require('../utils/medicineJobFlow');

const doctor = { role: 'doctor' };

test('a fulfilment job waits on its stage: the stage name and the roles that can do it, opening the queue on that step', () => {
  const step = jobStep({ status: 'open', currentStage: 1 }, ['doctor'], doctor);
  assert.equal(step.key, 'stage-1');
  assert.equal(step.title, `${STAGES[1].n}. ${STAGES[1].label}`);
  assert.deepEqual(step.roles, ['doctor']);
  assert.equal(step.href, '/admin/medicine-jobs?step=1&mine=1');
});

test('hold, sent back and release states are their own steps with the role they wait on', () => {
  assert.equal(jobStep({ status: 'open', currentStage: 2, hold: { active: true } }, ['medicine_department'], doctor).key, 'hold');
  const back = jobStep({ status: 'open', currentStage: 0, returned: { at: new Date() } }, ['in_transit'], doctor);
  assert.equal(back.key, 'returned');
  assert.deepEqual(back.roles, ['in_transit']);
  const finalDone = [{ key: 'final', doneAt: new Date() }];
  assert.equal(jobStep({ status: 'ready', currentStage: 10, stages: finalDone }, ['in_transit'], { role: 'in_transit' }).key, 'release-transit');
  const requested = jobStep({ status: 'ready', currentStage: 10, stages: finalDone, releaseRequest: { requestedAt: new Date() } }, ['medicine_department'], { role: 'medicine_department' });
  assert.equal(requested.key, 'release-requested');
  assert.deepEqual(requested.roles, ['medicine_department']);
});

test('medicine requests: to accept, being prepared; other statuses are not a step', () => {
  assert.equal(requestStep('requested').title, 'Accept the medicine request');
  assert.equal(requestStep('in_process').href, '/admin/medicine-requests?status=in_process');
  assert.equal(requestStep('made'), null);
});

test('a list section is split into one section per step, in step order, with who it is pending with', () => {
  const item = (key, step) => ({ key, step, people: [] });
  const accept = jobStep({ status: 'open', currentStage: 0 }, ['medicine_department', 'doctor'], doctor);
  const formula = jobStep({ status: 'open', currentStage: 1 }, ['doctor'], doctor);
  const sections = splitSteps({ page: '/admin/medicine-jobs', shared: true, count: 3, items: [item('a', formula), item('b', accept), item('c', formula)] });
  assert.deepEqual(sections.map((s) => [s.step, s.count, s.items.map((i) => i.key)]), [['stage-0', 1, ['b']], ['stage-1', 2, ['a', 'c']]]);
  assert.equal(sections[0].pendingWith, 'Medicine Department, Doctor');
  assert.equal(sections[1].href, '/admin/medicine-jobs?step=1&mine=1');
  assert.equal(sections[1].shared, true);
});

test('per-person counts follow the step; other pages and lists without steps stay one section', () => {
  const step = (i) => jobStep({ status: 'open', currentStage: i }, ['assistant_doctor'], { role: 'assistant_doctor' });
  const [first, second] = splitSteps({ page: '/admin/medicine-jobs', shared: false, count: 3, byPerson: [{ name: 'A', count: 2 }, { name: 'B', count: 1 }],
    items: [{ key: '1', step: step(9), people: ['A'] }, { key: '2', step: step(10), people: ['A'] }, { key: '3', step: step(10), people: ['B'] }] });
  assert.deepEqual(first.byPerson, [{ name: 'A', count: 1 }]);
  assert.deepEqual(second.byPerson, [{ name: 'A', count: 1 }, { name: 'B', count: 1 }]);
  const stocks = { page: '/admin/stocks', count: 2, items: [{ key: 'x' }] };
  assert.deepEqual(splitSteps(stocks), [stocks]);
  const empty = { page: '/admin/medicine-jobs', count: 4, items: [] };
  assert.deepEqual(splitSteps(empty), [empty]);
});

test('request step cards count each request once, by where it stands', async (t) => {
  t.mock.method(Patient, 'find', () => ({ select: () => ({ lean: async () => [
    { stages: [{ medicineRequests: [{ requestId: 'r1', status: 'requested' }, { requestId: 'r2', status: 'in_process' }, { requestId: 'r3', status: 'made' }], medicineRequest: { requestId: 'r1', status: 'requested' } }] },
    { stages: [{ medicineRequest: { status: 'requested' } }] },
  ] }) }));
  const cards = await requestSteps();
  assert.deepEqual(cards.map((c) => [c.key, c.title, c.pendingWith, c.count]), [
    ['requested', 'Accept the medicine request', 'Medicine Department', 2],
    ['in_process', 'Prepare the medicine (being made)', 'Medicine Department', 1],
  ]);
});
