import axios from 'axios';

const getCache = new Map();
const getRequests = new Map();
const noCachePaths = ['/auth/me', '/advice/unread-count', '/schedule/reminders'];

const clearGetCache = () => {
  getCache.clear();
  getRequests.clear();
};

const stableParams = (params = {}) =>
  Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join('&');

const isCacheableGet = (url = '') => !noCachePaths.some((path) => String(url).startsWith(path));

if (typeof window !== 'undefined') {
  window.addEventListener('crm:logout', clearGetCache);
  window.addEventListener('crm:data-changed', clearGetCache);
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Attach the saved token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto logout on 401 (expired/invalid token)
api.interceptors.response.use(
  (response) => {
    if (response.config.method && response.config.method.toLowerCase() !== 'get') {
      clearGetCache();
      window.dispatchEvent(new Event('crm:data-changed'));
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      window.dispatchEvent(new Event('crm:logout'));
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Keep read pages instant while the current login session is active. Any
// successful write clears this cache, so navigation never shows stale records
// after a patient/payment/schedule edit.
const originalGet = api.get.bind(api);
api.get = (url, config = {}) => {
  if (!isCacheableGet(url)) return originalGet(url, config);

  const token = localStorage.getItem('crm_token') || '';
  const key = `${token}:${url}?${stableParams(config.params)}`;
  if (getCache.has(key)) return Promise.resolve(getCache.get(key));
  if (getRequests.has(key)) return getRequests.get(key);

  const request = originalGet(url, config)
    .then((response) => {
      getCache.set(key, response);
      return response;
    })
    .finally(() => getRequests.delete(key));
  getRequests.set(key, request);
  return request;
};

export const prefetchGet = (url, config = {}) => api.get(url, config).catch(() => null);

export default api;
