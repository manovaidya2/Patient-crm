import { useEffect, useState } from 'react';
import api from '../api/axios.js';

// Open work per page for the signed-in role (GET /tasks/counts), shared by the sidebar badges and the
// "Your pending work" strip: one request every 30 seconds however many places show it.
const STORE = 'crm_task_counts';
const saved = () => { try { return JSON.parse(sessionStorage.getItem(STORE) || '{}'); } catch { return {}; } };
let counts = saved();
let timer = null;
let inFlight = null;
const listeners = new Set();
const publish = () => listeners.forEach((listener) => listener(counts));

export const refreshTaskCounts = async () => {
  if (inFlight) return inFlight;
  inFlight = api.get('/tasks/counts', { skipCache: true })
    .then(({ data }) => { counts = data.counts || {}; try { sessionStorage.setItem(STORE, JSON.stringify(counts)); } catch { /* optional */ } publish(); })
    .catch(() => { /* badges are optional */ })
    .finally(() => { inFlight = null; });
  return inFlight;
};

export default function useTaskCounts(refreshKey) {
  const [value, setValue] = useState(counts);
  useEffect(() => {
    listeners.add(setValue);
    if (!timer) timer = window.setInterval(refreshTaskCounts, 30000);
    return () => {
      listeners.delete(setValue);
      if (!listeners.size && timer) { window.clearInterval(timer); timer = null; counts = {}; }
    };
  }, []);
  // Refresh on mount and whenever the caller's key changes (e.g. the page the user moved to).
  useEffect(() => { refreshTaskCounts(); }, [refreshKey]);
  return value;
}
