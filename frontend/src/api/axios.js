import axios from 'axios';
import { ReadCache, queryKey } from './readCache.js';

export const readCache = new ReadCache();
const noCachePaths = ['/auth/', '/advice/unread-count', '/schedule/reminders', '/patients/check-code'];
export const cacheKey = (url, config = {}) => `${localStorage.getItem('crm_token') || ''}:${queryKey(url, config.params)}`;
export const cachedResponse = (url, config) => readCache.peek(cacheKey(url, config));

window.addEventListener('crm:logout', () => readCache.clear());
// Keep snapshots visible during refresh; writes invalidate their freshness.
window.addEventListener('crm:data-changed', () => readCache.invalidate());

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((response) => {
  if (response.config.method && response.config.method.toLowerCase() !== 'get') {
    window.dispatchEvent(new Event('crm:data-changed'));
  }
  return response;
}, (error) => {
  if (error.response?.status === 401) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.dispatchEvent(new Event('crm:logout'));
    if (window.location.pathname !== '/login') window.location.href = '/login';
  }
  return Promise.reject(error);
});

const originalGet = api.get.bind(api);
api.get = (url, config = {}) => {
  if (config.skipCache || config.signal || noCachePaths.some((path) => String(url).startsWith(path))) {
    return originalGet(url, config);
  }
  return readCache.read(cacheKey(url, config), () => originalGet(url, config), config.forceRefresh);
};
export const prefetchGet = (url, config = {}) => api.get(url, config).catch(() => null);
export default api;
