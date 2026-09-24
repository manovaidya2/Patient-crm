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

      if (token && savedUser) {
        try {
          setUser(JSON.parse(savedUser));
          const { data } = await api.get('/auth/me');
          setUser(data.user);
          localStorage.setItem('crm_user', JSON.stringify(data.user));
        } catch (err) {
          localStorage.removeItem('crm_token');
          localStorage.removeItem('crm_user');
          setUser(null);
        }
      }
      setLoading(false);
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
