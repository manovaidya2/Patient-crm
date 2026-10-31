import { useCallback, useRef, useState } from 'react';

// useState that remembers its last value per key for the session (memory only, cleared on logout). A list page
// that comes back shows what it showed last time at once, while it loads the fresh list behind it.
// A key change (another filter) swaps to that key's last value in the same render, so nothing flashes.
const snapshots = new Map();
window.addEventListener('crm:logout', () => snapshots.clear());

const read = (key, initial) => (snapshots.has(key) ? snapshots.get(key) : initial);

export default function useStaleState(key, initial) {
  const initialRef = useRef(initial);
  const [state, setState] = useState(() => ({ key, value: read(key, initial) }));
  let current = state;
  if (state.key !== key) {
    current = { key, value: read(key, initialRef.current) };
    setState(current);
  }
  const set = useCallback((next) => setState((old) => {
    const resolved = typeof next === 'function' ? next(old.value) : next;
    snapshots.set(old.key, resolved);
    return { key: old.key, value: resolved };
  }), []);
  return [current.value, set];
}
