import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('crm_token');
      const savedUser = localStorage.getItem('crm_user');

      if (!token || !savedUser) { setLoading(false); return; }
      // Show the app at once with the saved login; check it with the server in the background.
      try { setUser(JSON.parse(savedUser)); } catch { setUser(null); }
      setLoading(false);
      try {
        const { data } = await api.get('/auth/me');
        setUser(data.user);
        localStorage.setItem('crm_user', JSON.stringify(data.user));
      } catch (err) {
        // Only a refused login logs out; a slow or offline server keeps the saved session.
        if (err.response?.status === 401) {
          localStorage.removeItem('crm_token');
          localStorage.removeItem('crm_user');
          setUser(null);
        }
      }
    };

    restoreSession();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('crm_token', data.token);
    localStorage.setItem('crm_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.dispatchEvent(new Event('crm:logout'));
    setUser(null);
  };

  // After the signed-in user's own details change (e.g. the admin edits their login email).
  const refreshUser = (next) => {
    if (!next) return;
    localStorage.setItem('crm_user', JSON.stringify(next));
    setUser(next);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
