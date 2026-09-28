import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadCache, queryKey } from './readCache.js';

test('stable keys distinguish filters and normalize omitted parameters', () => {
  assert.equal(queryKey('/patients', { page: 1, search: undefined, limit: 10 }), queryKey('/patients', { limit: 10, page: 1 }));
  assert.notEqual(queryKey('/patients', { page: 1 }), queryKey('/patients', { page: 2 }));
  assert.notEqual(queryKey('/patients', { search: 'x&y=z' }), queryKey('/patients', { search: 'x', y: 'z' }));
});

test('revisits use cached data and concurrent reads share one request', async () => {
  const cache = new ReadCache();
  let calls = 0;
  const fetcher = async () => { calls++; return { data: [1] }; };
  const first = cache.read('user-a:patients', fetcher);
  const second = cache.read('user-a:patients', fetcher);
  assert.equal(first, second);
  await first;
  assert.deepEqual(cache.peek('user-a:patients').data, [1]);
  await cache.read('user-a:patients', fetcher);
  assert.equal(calls, 1);
  assert.equal(cache.peek('user-b:patients'), undefined);
});

test('stale snapshots remain visible while refreshing and on network failure', async () => {
  let time = 0;
  const cache = new ReadCache({ now: () => time });
  await cache.read('a', async () => ({ data: 'old' }));
  time = 60001;
  let resolve;
  const pending = cache.read('a', () => new Promise((done) => { resolve = done; }));
  await Promise.resolve();
  assert.equal(cache.peek('a').data, 'old');
  resolve({ data: 'new' });
  await pending;
  assert.equal(cache.peek('a').data, 'new');
  await assert.rejects(cache.read('a', async () => { throw new Error('offline'); }, true));
  assert.equal(cache.peek('a').data, 'new');
});

test('mutation refresh cannot be overwritten by a pre-mutation response', async () => {
  const cache = new ReadCache();
  let resolve;
  const old = cache.read('a', () => new Promise((done) => { resolve = done; }));
  await Promise.resolve();
  cache.invalidate();
  await cache.read('a', async () => ({ data: 'updated' }));
  resolve({ data: 'outdated' });
  await old;
  assert.equal(cache.peek('a').data, 'updated');
});

test('logout clears snapshots and blocks in-flight cache repopulation', async () => {
  const cache = new ReadCache();
  let resolve;
  const pending = cache.read('a', () => new Promise((done) => { resolve = done; }));
  await Promise.resolve();
  cache.clear();
  resolve({ data: 'private' });
  await pending;
  assert.equal(cache.peek('a'), undefined);
});

test('cache is bounded and manual refresh bypasses freshness', async () => {
  const cache = new ReadCache({ limit: 2 });
  cache.put('a', 1); cache.put('b', 2); cache.put('c', 3);
  assert.equal(cache.peek('a'), undefined);
  await cache.read('c', async () => 4, true);
  assert.equal(cache.peek('c'), 4);
});
