import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BriefcaseIcon,
  ClipboardDocumentListIcon,
  CubeTransparentIcon,
  CpuChipIcon,
  UsersIcon,
  BellAlertIcon,
  Cog6ToothIcon,
  Bars3Icon,
  Bars3BottomLeftIcon,
} from '@heroicons/react/24/outline';
import logo from '../assets/bxai-logo.svg';
import { adminApi } from '../api/admin';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [summary, setSummary] = useState({
    cases: 0,
    evidenceItems: 0,
    activeAlerts: 0,
    latestActivity: [],
  });
  const [status, setStatus] = useState({ loading: true, error: '' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navItems = [
    { id: 'cases', label: 'Cases', icon: BriefcaseIcon },
    { id: 'evidence', label: 'Evidence', icon: ClipboardDocumentListIcon },
    { id: 'blockchain', label: 'Blockchain', icon: CubeTransparentIcon },
    { id: 'xai', label: 'XAI', icon: CpuChipIcon },
    { id: 'users', label: 'User Management', icon: UsersIcon },
    { id: 'notifications', label: 'Notification', icon: BellAlertIcon },
    { id: 'settings', label: 'Setting', icon: Cog6ToothIcon },
  ];

  useEffect(() => {
    const storedAdmin = localStorage.getItem('bxaiAdmin') || sessionStorage.getItem('bxaiAdmin');
    if (!storedAdmin) {
      navigate('/signin');
      return;
    }

    const parsedAdmin = JSON.parse(storedAdmin);
    setAdmin(parsedAdmin);

    const fetchSummary = async () => {
      try {
        const data = await adminApi.fetchSummary();
        setSummary(data);
        setStatus({ loading: false, error: '' });
      } catch (error) {
        setStatus({ loading: false, error: error.message || 'Failed to load dashboard data' });
      }
    };

    fetchSummary();
  }, [navigate]);

  const handleSignOut = () => {
    localStorage.removeItem('bxaiAdmin');
    sessionStorage.removeItem('bxaiAdmin');
    navigate('/signin');
  };

  if (!admin) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-text">
      <aside
        className={`flex h-screen flex-col border-r border-primary/10 bg-white/90 backdrop-blur transition-all duration-300 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-6">
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <img alt="BXAI logo" className="h-8 w-8" src={logo} />
            {!sidebarCollapsed && (
              <div>
                <p className="text-sm font-semibold text-primary">BXAI Admin</p>
                <p className="text-xs text-text/60">Operations</p>
              </div>
            )}
          </div>
          <button
            aria-label="Toggle navigation"
            className="rounded-full border border-primary/20 p-2 text-primary transition hover:bg-primary hover:text-white"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            type="button"
          >
            {sidebarCollapsed ? <Bars3BottomLeftIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-text/70 transition hover:bg-primary/10 hover:text-primary"
              href={`#${id}`}
            >
              <Icon className="h-5 w-5 text-primary" />
              {!sidebarCollapsed && <span>{label}</span>}
            </a>
          ))}
        </nav>
        <div className="px-4 py-4">
          <button
            className="w-full rounded-xl border border-primary/20 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white"
            onClick={handleSignOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <header className="border-b border-primary/10 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-sm font-semibold text-primary">{admin.name || 'BXAI Admin'}</p>
              <p className="text-xs text-text/60">{admin.email}</p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/60">Mission Control</p>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-10">
          <section className="rounded-3xl border border-primary/10 bg-white/80 p-8 shadow-card backdrop-blur" id="overview">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
                  Admin Overview
                </p>
                <h1 className="text-3xl font-semibold text-primary sm:text-4xl">Mission control for BXAI operations</h1>
                <p className="max-w-xl text-sm text-text/70">
                  Track case progression, evidence integrity, and AI-driven alerts from a single command interface. All
                  metrics refresh automatically from the BXAI data plane.
                </p>
              </div>
              <div className="rounded-2xl border border-dashed border-primary/20 bg-background/70 p-4 text-sm text-text/70">
                <p className="font-semibold text-primary">System health</p>
                {status.loading ? (
                  <p className="mt-2">Loading latest metrics…</p>
                ) : status.error ? (
                  <p className="mt-2 text-red-500">{status.error}</p>
                ) : (
                  <p className="mt-2">Dashboard synced with BXAI cluster.</p>
                )}
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-6 sm:grid-cols-3" id="cases">
            <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase text-primary/70">Active cases</p>
              <p className="mt-3 text-3xl font-bold text-primary">{summary.cases}</p>
              <p className="text-xs text-text/60">Across jurisdictions connected to BXAI</p>
            </div>
            <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="evidence">
              <p className="text-xs font-semibold uppercase text-primary/70">Evidence assets</p>
              <p className="mt-3 text-3xl font-bold text-primary">{summary.evidenceItems}</p>
              <p className="text-xs text-text/60">Encrypted artifacts tracked on-chain</p>
            </div>
            <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="notifications">
              <p className="text-xs font-semibold uppercase text-primary/70">Open alerts</p>
              <p className="mt-3 text-3xl font-bold text-primary">{summary.activeAlerts}</p>
              <p className="text-xs text-text/60">Explainable AI notifications awaiting review</p>
            </div>
          </section>

          <section className="mt-10 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="blockchain">
            <h2 className="text-lg font-semibold text-primary">Blockchain assurance</h2>
            <p className="mt-2 text-sm text-text/70">
              Insight into chain-of-custody checkpoints, ledger synchronization, and notarization outcomes. Integrate
              downstream tools to display attestation events here.
            </p>
          </section>

          <section className="mt-10 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="xai">
            <h2 className="text-lg font-semibold text-primary">Explainable AI insights</h2>
            <p className="mt-2 text-sm text-text/70">
              Summaries of model rationale, audit notes, and analyst feedback will populate this panel as the XAI
              service emits new findings.
            </p>
          </section>

          <section className="mt-10 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="users">
            <h2 className="text-lg font-semibold text-primary">User management</h2>
            <p className="mt-2 text-sm text-text/70">
              Provision agencies, assign roles, and monitor access requests. Connect this area to fine-grained policy
              APIs when they are available.
            </p>
          </section>

          <section className="mt-10 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="notifications">
            <h2 className="text-lg font-semibold text-primary">Notification center</h2>
            <p className="mt-2 text-sm text-text/70">
              Configure alert routing, escalation timelines, and delivery channels. Hook into messaging providers to see
              live notification telemetry.
            </p>
          </section>

          <section className="mt-10 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="settings">
            <h2 className="text-lg font-semibold text-primary">Settings</h2>
            <p className="mt-2 text-sm text-text/70">
              Manage environment keys, integrations, and compliance preferences for the BXAI control plane.
            </p>
          </section>

          <section className="mt-10 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm" id="activity">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary">Latest activity</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/50">Recent 5 entries</span>
            </div>
            <div className="mt-4 space-y-4">
              {summary.latestActivity.length === 0 ? (
                <p className="text-sm text-text/60">No activity recorded yet.</p>
              ) : (
                summary.latestActivity.map((item, index) => (
                  <div key={index} className="flex items-start justify-between rounded-2xl border border-primary/10 bg-background/70 p-4">
                    <div>
                      <p className="text-sm font-semibold text-primary">{item.description}</p>
                      <p className="text-xs text-text/60">{item.actor || 'system'}</p>
                    </div>
                    <span className="text-xs text-text/60">{item.timestamp || '—'}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
