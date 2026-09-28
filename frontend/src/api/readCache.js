// Memory only: patient data is never persisted to browser storage.
export const queryKey = (url, params = {}) => `${url}?${JSON.stringify(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null).sort(([a], [b]) => a.localeCompare(b)),
)}`;

export class ReadCache {
  constructor({ freshMs = 60000, limit = 150, now = Date.now } = {}) {
    this.freshMs = freshMs;
    this.limit = limit;
    this.now = now;
    this.entries = new Map();
    this.pending = new Map();
    this.listeners = new Set();
    this.generation = 0;
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  emit() { this.listeners.forEach((listener) => listener()); }
  peek(key) { return this.entries.get(key)?.response; }
  put(key, response) {
    this.entries.delete(key);
    this.entries.set(key, { response, at: this.now() });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    this.emit();
  }
  invalidate() {
    this.generation += 1;
    this.pending.clear();
    this.entries.forEach((entry) => { entry.at = -Infinity; });
    this.emit();
  }
  clear() {
    this.invalidate();
    this.entries.clear();
    this.emit();
  }
  read(key, fetcher, force = false) {
    const entry = this.entries.get(key);
    if (!force && entry && this.now() - entry.at < this.freshMs) return Promise.resolve(entry.response);
    if (this.pending.has(key)) return this.pending.get(key);
    const generation = this.generation;
    const request = Promise.resolve().then(fetcher).then((response) => {
      if (generation === this.generation) this.put(key, response);
      return response;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }
}
