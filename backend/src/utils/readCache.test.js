const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { cached, clearReadCache, resetReadCache } = require('./readCache');

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
beforeEach(() => resetReadCache());

test('the same list is fetched once for everyone asking in the same minute', async () => {
  let runs = 0;
  const fn = async () => { runs += 1; return runs; };
  const [a, b] = await Promise.all([cached('k', fn), cached('k', fn)]);
  assert.deepEqual([a, b, await cached('k', fn)], [1, 1, 1]);
  assert.equal(runs, 1);
});

test('after a save the old answer is served at once and the new one is fetched behind it', async () => {
  let runs = 0;
  const fn = async () => { runs += 1; return runs; };
  assert.equal(await cached('k', fn), 1);
  clearReadCache();
  await new Promise((resolve) => setTimeout(resolve, 400)); // the background refresh of a recently used key (after it settles)
  assert.equal(await cached('k', fn), 2);
  assert.equal(runs, 2);
});

test('an expired answer is returned while a fresh one loads; `fresh` waits for it', async () => {
  let runs = 0;
  const fn = async () => { runs += 1; return runs; };
  assert.equal(await cached('k', fn, { ttl: 1 }), 1);
  await tick();
  assert.equal(await cached('k', fn, { ttl: 1 }), 1, 'stale answer right away');
  await tick();
  assert.equal(await cached('k', fn, { ttl: 1 }), 2);
  const before = runs;
  assert.equal(await cached('k', fn, { ttl: 1, fresh: true }), runs);
  assert.ok(runs > before, 'fresh ran the fetch itself');
});

test('a failed fetch is not kept', async () => {
  let n = 0;
  const fn = async () => { n += 1; if (n === 1) throw new Error('down'); return 'ok'; };
  await assert.rejects(cached('k', fn));
  assert.equal(await cached('k', fn), 'ok');
});
