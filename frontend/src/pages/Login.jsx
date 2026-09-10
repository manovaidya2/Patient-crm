import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import { getDefaultRoute } from '../constants/roles.js';
import BrandLogo from '../components/BrandLogo.jsx';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      const redirectTo = location.state?.from?.pathname || getDefaultRoute(user.role);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-cream">
      {/* Left brand panel — deep teal, the page's signature moment */}
      <div className="hidden lg:flex lg:w-[42%] relative overflow-hidden bg-teal-950 text-offwhite-100 flex-col justify-between p-12">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 70%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <BrandLogo size="md" />
          <span className="font-display font-bold text-lg tracking-tight">Manovaidya Operation System</span>
        </div>

        <div className="relative flex flex-col items-start">
          <div className="w-full rounded-2xl bg-offwhite-100/95 px-6 py-8 shadow-card">
            <img
              src="/manovaidya-wordmark.png"
              alt="Manovaidya"
              className="w-full max-w-[620px] object-contain"
            />
          </div>
          <h1 className="mt-8 font-display text-4xl font-extrabold leading-tight tracking-tight">
            One workspace for every department.
          </h1>
        </div>

        <p className="relative text-xs text-teal-100/40">
          Copyright © 2026 Manovaidya. All rights reserved.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <BrandLogo size="md" />
            <span className="font-display font-bold text-lg text-teal-950">Manovaidya Operation System</span>
          </div>

          <h2 className="font-display text-2xl font-bold text-teal-950">Log in</h2>
          <p className="mt-1.5 text-sm text-teal-900/60">
            Enter the credentials given to you .
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Input
              id="email"
              name="email"
              type="email"
              label="Email"
              placeholder="you@company.com"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
            <Input
              id="password"
              name="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? 'Logging in…' : 'Log in'}
            </Button>
          </form>

          <div className="mt-8 flex items-center gap-2 text-xs text-teal-900/40">
            <Lock size={13} />
            <span>Secured session.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
