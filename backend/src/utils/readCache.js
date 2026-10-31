// A shared read cache for the heavy "what is pending" lists (sidebar badges, My day, the reminder bell, Team pending,
// the PO list). The link to the database is slow, so the same list must travel once, not once per screen per minute.
//
// It answers like a good receptionist: the last known answer at once, and the fresh one is fetched in the background
// when the old one has expired. A successful write (POST / PUT / PATCH / DELETE) marks every entry out of date and
// refreshes the ones in recent use, one at a time, so a save never floods the database link either.
const TTL = 60 * 1000;
const RECENT = 5 * 60 * 1000;
const store = new Map(); // key -> { value: Promise, at, version, fn, usedAt }
let version = 0;
let refreshing = null;

const fetchInto = (key, fn) => {
  const startedAt = version;
  const value = Promise.resolve().then(fn);
  const entry = { value, at: Date.now(), version: startedAt, fn, usedAt: Date.now() };
  value.then(() => { entry.at = Date.now(); }, () => { if (store.get(key) === entry) store.delete(key); });
  return entry;
};

// `fn` is run once for everyone asking for `key` during `ttl`; afterwards the old answer is still returned while a
// new one is fetched behind it. With `fresh: true` the caller waits for a new answer.
const cached = (key, fn, { ttl = TTL, fresh = false } = {}) => {
  const hit = store.get(key);
  if (hit) hit.usedAt = Date.now();
  const expired = !hit || hit.version !== version || Date.now() - hit.at > ttl;
  if (hit && !expired) return hit.value;
  if (hit && !fresh) {
    // Serve the old answer now; fetch the new one in the background (only one at a time per key).
    if (!hit.refreshing) {
      hit.refreshing = true;
      const next = fetchInto(key, fn);
      next.value.then(() => { if (store.get(key) === hit) store.set(key, next); }, () => {}).finally(() => { hit.refreshing = false; });
    }
    return hit.value;
  }
  const entry = fetchInto(key, fn);
  store.set(key, entry);
  return entry.value;
};

// After a write: everything is out of date; the lists someone looked at recently are refreshed one by one.
// Saves that come in a burst (one form, several requests) start a single refresh, at most one every SETTLE ms.
const SETTLE = 2000;
let lastRefreshAt = 0;
const clearReadCache = () => {
  version += 1;
  if (refreshing) return;
  refreshing = (async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.max(300, SETTLE - (Date.now() - lastRefreshAt))));
    lastRefreshAt = Date.now();
    for (const [key, entry] of [...store.entries()]) {
      if (Date.now() - entry.usedAt > RECENT) { store.delete(key); continue; }
      if (store.get(key) !== entry || entry.version === version) continue;
      try { const next = fetchInto(key, entry.fn); await next.value; if (store.get(key) === entry) store.set(key, next); } catch { /* the next read retries */ }
    }
  })().finally(() => { refreshing = null; });
};

// Writes that never change a pending list (chat messages, logins, HR, the library) leave the cache alone.
const UNRELATED = ['/api/auth', '/api/team-chat', '/api/crm-chat', '/api/hr', '/api/knowledge', '/api/webhook', '/api/digital-marketing'];
// Express middleware: a successful write refreshes the cache once the response has gone out.
const clearOnWrite = (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !UNRELATED.some((prefix) => req.originalUrl.startsWith(prefix))) {
    res.on('finish', () => { if (res.statusCode < 400) clearReadCache(); });
  }
  next();
};

// Tests only.
const resetReadCache = () => { store.clear(); version = 0; };

module.exports = { cached, clearReadCache, clearOnWrite, resetReadCache };
