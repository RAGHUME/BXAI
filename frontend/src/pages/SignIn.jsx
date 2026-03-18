import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/bxai-logo.svg';
import { adminApi } from '../api/admin';
import { authApi } from '../api/auth';

const SignIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [status, setStatus] = useState({ loading: false, error: '' });

  useEffect(() => {
    if (location.state?.email) {
      setForm((prev) => ({ ...prev, email: location.state.email }));
    }
  }, [location.state]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, error: '' });

    try {
      const trimmedEmail = form.email.trim().toLowerCase();
      let destination = '/signin';

      if (trimmedEmail === 'raghu.bldeacet17@gmail.com') {
        const response = await adminApi.login({ email: trimmedEmail, password: form.password });
        const storage = form.remember ? localStorage : sessionStorage;
        storage.setItem('bxaiAdmin', JSON.stringify(response.admin));
        destination = '/admin/dashboard';
      } else {
        const response = await authApi.login({ email: trimmedEmail, password: form.password });
        const storage = form.remember ? localStorage : sessionStorage;
        storage.setItem('bxaiAccount', JSON.stringify(response.account));

        if (response.account.role === 'investigator') {
          destination = `/investigator/dashboard/${response.account._id}`;
        } else if (response.account.role === 'user') {
          destination = `/user/dashboard/${response.account._id}`;
        }
      }

      navigate(destination);
    } catch (error) {
      setStatus({ loading: false, error: error.message || 'Login failed' });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-12 text-text">
      <Link className="mb-12 inline-flex items-center gap-3" to="/">
        <img alt="BXAI logo" className="h-10 w-10" src={logo} />
        <span className="text-lg font-semibold text-primary">BXAI</span>
      </Link>
      <div className="w-full max-w-4xl rounded-3xl border border-primary/10 bg-white p-10 shadow-lg">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-5">
            <h1 className="text-3xl font-semibold text-primary">Welcome back</h1>
            <p className="text-sm text-text/70">
              Log in to continue monitoring evidence integrity, collaborate with your team, and review explainable AI
              insights across every case.
            </p>
          </div>
          <div className="space-y-6">
            <div className="space-y-2 text-center lg:text-left">
              <h2 className="text-2xl font-semibold text-primary">Sign in</h2>
              <p className="text-sm text-text/70">Use your work credentials to access the BXAI console.</p>
            </div>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-semibold text-primary" htmlFor="email">
                  Email address
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                  id="email"
                  name="email"
                  onChange={handleChange}
                  placeholder="you@agency.gov"
                  type="email"
                  value={form.email}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-primary" htmlFor="password">
                  Password
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                  id="password"
                  name="password"
                  onChange={handleChange}
                  placeholder="Enter your password"
                  type="password"
                  value={form.password}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-text/70">
                  <input
                    checked={form.remember}
                    className="h-4 w-4 rounded border-primary/20 text-accent1 focus:ring-accent1/30"
                    name="remember"
                    onChange={handleChange}
                    type="checkbox"
                  />
                  Keep me signed in
                </label>
                <Link className="font-semibold text-primary transition hover:text-accent1" to="/recover">
                  Forgot password?
                </Link>
              </div>

              {status.error && <p className="text-sm font-semibold text-red-500">{status.error}</p>}

              <button
                className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
                disabled={status.loading}
                type="submit"
              >
                {status.loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className="text-center text-sm text-text/70 lg:text-left">
              New team member?{' '}
              <Link className="font-semibold text-primary transition hover:text-accent1" to="/signup">
                Request access
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
