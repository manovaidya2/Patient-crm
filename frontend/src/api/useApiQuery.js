import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import api, { cacheKey, readCache } from './axios.js';

export default function useApiQuery(url, config = {}, { enabled = true } = {}) {
  const key = cacheKey(url, config);
  const latest = useRef({ url, config });
  latest.current = { url, config };
  const response = useSyncExternalStore(readCache.subscribe, () => enabled ? readCache.peek(key) : undefined);
  const [failure, setFailure] = useState(null);
  const mountedKey = useRef(null);
  const refresh = useCallback(async (force = true) => {
    if (!enabled) return;
    try {
      const result = await api.get(latest.current.url, { ...latest.current.config, forceRefresh: force !== false });
      if (mountedKey.current === key) setFailure(null);
      return result;
    } catch (error) {
      if (mountedKey.current === key) setFailure({ key, error });
    }
  }, [key, enabled]);
  useEffect(() => {
    mountedKey.current = key;
    if (!enabled) return;
    refresh(false);
    const update = () => {
      if (document.visibilityState !== 'hidden') refresh(false);
    };
    const timer = window.setInterval(update, 60000);
    window.addEventListener('crm:data-changed', update);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      mountedKey.current = null;
      window.clearInterval(timer);
      window.removeEventListener('crm:data-changed', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [key, enabled, refresh]);
  const setData = useCallback((updater) => {
    const current = readCache.peek(key);
    if (current) readCache.put(key, { ...current, data: typeof updater === 'function' ? updater(current.data) : updater });
  }, [key]);
  const error = failure?.key === key ? failure.error : null;
  return { data: response?.data, loading: enabled && !response && !error, error, refresh, setData };
}
