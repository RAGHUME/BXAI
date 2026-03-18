import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/bxai-logo.svg';
import { authApi } from '../api/auth';

const SignUp = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState('investigator');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    organization: '',
    idNumber: '',
  });
  const [status, setStatus] = useState({ loading: false, error: '', success: '' });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ loading: true, error: '', success: '' });

    try {
      const payload = {
        role,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        organization: role === 'investigator' ? form.organization : undefined,
        idNumber: role === 'investigator' ? form.idNumber : undefined,
      };

      const response = await authApi.signup(payload);
      setStatus({ loading: false, error: '', success: 'Account created. Redirecting to sign in…' });
      setTimeout(() => {
        navigate('/signin', { state: { email: response.account.email } });
      }, 1200);
    } catch (error) {
      setStatus({ loading: false, error: error.message || 'Unable to create account', success: '' });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-12 text-text">
      <Link className="mb-12 inline-flex items-center gap-3" to="/">
        <img alt="BXAI logo" className="h-10 w-10" src={logo} />
        <span className="text-lg font-semibold text-primary">BXAI</span>
      </Link>
      <div className="w-full max-w-5xl rounded-3xl border border-primary/10 bg-white p-10 shadow-lg">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-5">
            <h1 className="text-3xl font-semibold text-primary">Create your BXAI account</h1>
            <p className="text-sm text-text/70">
              Provision a secure collaborative workspace for your investigators. BXAI blends explainable AI, blockchain,
              and digital forensics expertise to keep evidence aligned and auditable.
            </p>
            <ul className="space-y-3 text-sm text-text/70">
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent1/15 text-xs font-semibold text-accent1">
                  1
                </span>
                Invite cross-functional teams with policy-aware permissions.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent2/15 text-xs font-semibold text-accent2">
                  2
                </span>
                Link evidence sources to tamper-proof chains of custody.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  3
                </span>
                Surface explainable analytics with documentation-ready outputs.
              </li>
            </ul>
          </div>
          <div className="space-y-6">
            <div className="space-y-2 text-center lg:text-left">
              <h2 className="text-2xl font-semibold text-primary">Sign up</h2>
              <p className="text-sm text-text/70">Complete the form to request access for your organization.</p>
            </div>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-semibold text-primary" htmlFor="role">
                  Role
                </label>
                <select
                  className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                  id="role"
                  name="role"
                  onChange={(event) => setRole(event.target.value)}
                  value={role}
                >
                  <option value="investigator">Investigator</option>
                  <option value="user">User</option>
                </select>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-primary" htmlFor="firstName">
                    First name
                  </label>
                  <input
                    className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                    id="firstName"
                    name="firstName"
                    onChange={handleChange}
                    placeholder="Aria"
                    type="text"
                    value={form.firstName}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary" htmlFor="lastName">
                    Last name
                  </label>
                  <input
                    className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                    id="lastName"
                    name="lastName"
                    onChange={handleChange}
                    placeholder="Sen"
                    type="text"
                    value={form.lastName}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-primary" htmlFor="email">
                  Work email
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
              {role === 'investigator' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-primary" htmlFor="idNumber">
                      Investigator ID number
                    </label>
                    <input
                      className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                      id="idNumber"
                      name="idNumber"
                      onChange={handleChange}
                      placeholder="Enter issued investigator ID"
                      type="text"
                      value={form.idNumber}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-primary" htmlFor="org">
                      Organization
                    </label>
                    <input
                      className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                      id="org"
                      name="organization"
                      onChange={handleChange}
                      placeholder="Digital Forensics Unit"
                      type="text"
                      value={form.organization}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-semibold text-primary" htmlFor="password">
                  Password
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                  id="password"
                  name="password"
                  onChange={handleChange}
                  placeholder="Create a secure passphrase"
                  type="password"
                  value={form.password}
                />
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-dashed border-primary/20 bg-background/70 p-4 text-sm text-text/70">
                <input className="mt-1 h-4 w-4 rounded border-primary/20 text-accent1 focus:ring-accent1/30" type="checkbox" />
                <p>
                  I agree to the BXAI transparency charter and accept the{' '}
                  <Link className="font-semibold text-primary transition hover:text-accent1" to="#terms">
                    terms & compliance obligations
                  </Link>
                  .
                </p>
              </div>

              {status.error && <p className="text-sm font-semibold text-red-500">{status.error}</p>}
              {status.success && <p className="text-sm font-semibold text-green-600">{status.success}</p>}
              <button
                className="w-full rounded-full bg-accent1 px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent1/90"
                disabled={status.loading}
                type="submit"
              >
                {status.loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
          <p className="text-center text-sm text-text/70 lg:text-left">
            Already have clearance?{' '}
            <Link className="font-semibold text-primary transition hover:text-accent1" to="/signin">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
