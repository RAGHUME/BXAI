import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import logo from '../assets/bxai-logo.svg';
import {
  BuildingLibraryIcon,
  ClipboardDocumentListIcon,
  BoltIcon,
  ArrowLeftOnRectangleIcon,
  PlusCircleIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  UserGroupIcon,
  BookmarkIcon,
} from '@heroicons/react/24/outline';

const initialSummary = {
  casesFollowing: 0,
  sharedEvidence: 0,
  recentActivity: [],
  followingCases: [],
  availableCases: [],
  caseRequests: [],
};

const UserDashboard = () => {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [summary, setSummary] = useState(initialSummary);
  const [status, setStatus] = useState({ loading: true, error: '' });
  const [navOpen, setNavOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ subject: '', details: '', urgency: 'standard' });
  const [requestStatus, setRequestStatus] = useState({ submitting: false, message: '', error: '' });
  const [caseActionBusy, setCaseActionBusy] = useState({});
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('bxaiAccount') || sessionStorage.getItem('bxaiAccount');
    if (!stored) {
      navigate('/signin');
      return;
    }

    const parsed = JSON.parse(stored);
    if (parsed.role !== 'user' || parsed._id !== accountId) {
      navigate('/signin');
      return;
    }

    setAccount(parsed);

    const fetchSummary = async () => {
      try {
        const data = await authApi.fetchUserDashboard(accountId);
        setSummary({ ...initialSummary, ...data });
        setStatus({ loading: false, error: '' });
      } catch (error) {
        setStatus({ loading: false, error: error.message || 'Unable to load dashboard data' });
      }
    };

    fetchSummary();
  }, [accountId, navigate]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    if (!requestModalOpen) {
      setRequestStatus({ submitting: false, message: '', error: '' });
    }
  }, [requestModalOpen]);

  const handleSignOut = () => {
    localStorage.removeItem('bxaiAccount');
    sessionStorage.removeItem('bxaiAccount');
    navigate('/signin');
  };

  const handleFollowToggle = async (caseItem, currentlyFollowing) => {
    if (!account) return;
    const caseId = caseItem._id;
    setCaseActionBusy((previous) => ({ ...previous, [caseId]: true }));

    try {
      const response = await authApi.followCase({
        accountId: account._id,
        caseId,
        action: currentlyFollowing ? 'unfollow' : 'follow',
      });

      const updatedCase = response.case;
      const action = response.action;

      setSummary((previous) => {
        let followingCases = previous.followingCases.filter((item) => item._id !== caseId);
        let availableCases = previous.availableCases.filter((item) => item._id !== caseId);

        if (action === 'follow') {
          followingCases = [updatedCase, ...followingCases];
        } else {
          availableCases = [updatedCase, ...availableCases];
        }

        return {
          ...previous,
          followingCases,
          availableCases,
          casesFollowing: followingCases.length,
        };
      });

      setFeedback({
        type: 'success',
        message: action === 'follow' ? 'Case added to your watchlist.' : 'Case removed from your watchlist.',
      });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to update case follow status.' });
    } finally {
      setCaseActionBusy((previous) => {
        const { [caseId]: _ignored, ...rest } = previous;
        return rest;
      });
    }
  };

  const handleRequestSubmit = async (event) => {
    event.preventDefault();
    if (!account) return;

    const trimmedSubject = requestForm.subject.trim();
    const trimmedDetails = requestForm.details.trim();
    if (!trimmedSubject || !trimmedDetails) {
      setRequestStatus({ submitting: false, message: '', error: 'Please complete subject and details.' });
      return;
    }

    setRequestStatus({ submitting: true, message: '', error: '' });

    try {
      const payload = {
        accountId: account._id,
        subject: trimmedSubject,
        details: trimmedDetails,
        urgency: requestForm.urgency,
      };
      const response = await authApi.createCaseRequest(payload);
      const { caseRequest } = response;

      setSummary((previous) => ({
        ...previous,
        caseRequests: [caseRequest, ...previous.caseRequests],
      }));

      setRequestStatus({ submitting: false, message: 'Request submitted successfully.', error: '' });
      setRequestForm({ subject: '', details: '', urgency: 'standard' });
      setRequestModalOpen(false);
      setFeedback({ type: 'success', message: 'Case request sent to command.' });
    } catch (error) {
      setRequestStatus({ submitting: false, message: '', error: error.message || 'Unable to submit case request.' });
    }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text">
        <p className="text-sm font-semibold text-primary">Preparing collaboration hub…</p>
      </div>
    );
  }

  const firstName = account.name?.split(' ')[0] || account.firstName || account.email;

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-70" aria-hidden="true" />

        <header className="relative z-10 mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img alt="BXAI logo" className="h-12 w-12" src={logo} />
              <div>
                <p className="text-lg font-semibold text-primary">BXAI Collaboration Hub</p>
                <p className="text-sm text-text/70">Stakeholder intelligence surface</p>
              </div>
            </div>

            <div className="hidden items-center gap-6 text-sm font-medium text-text/80 md:flex">
              <a className="transition hover:text-primary" href="#overview">
                Overview
              </a>
              <a className="transition hover:text-primary" href="#cases">
                Cases
              </a>
              <a className="transition hover:text-primary" href="#requests">
                Requests
              </a>
              <a className="transition hover:text-primary" href="#activity">
                Activity
              </a>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                onClick={() => {
                  setRequestModalOpen(true);
                  setNavOpen(false);
                }}
                type="button"
              >
                <PlusCircleIcon className="h-4 w-4" /> Request case
              </button>
              <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/70 px-4 py-2 text-xs text-text/70">
                <div className="text-right">
                  <p className="text-sm font-semibold text-primary">{account.name}</p>
                  <p>{account.email}</p>
                </div>
                <button
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
                  onClick={handleSignOut}
                  type="button"
                >
                  <ArrowLeftOnRectangleIcon className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>

            <button
              className="inline-flex items-center justify-center rounded-full border border-primary/20 bg-white/70 p-2 text-primary md:hidden"
              onClick={() => setNavOpen((previous) => !previous)}
              type="button"
            >
              {navOpen ? <XMarkIcon className="h-5 w-5" /> : <PlusCircleIcon className="h-5 w-5 rotate-45" />}
            </button>
          </div>

          <div className={`mt-4 space-y-4 rounded-3xl border border-primary/10 bg-white/80 p-5 shadow-card md:hidden ${navOpen ? 'block' : 'hidden'}`}>
            <nav className="grid gap-3">
              {[
                { href: '#overview', label: 'Overview' },
                { href: '#cases', label: 'Cases' },
                { href: '#requests', label: 'Requests' },
                { href: '#activity', label: 'Activity' },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  className="rounded-2xl border border-primary/10 bg-white px-4 py-3 text-center text-sm font-semibold text-primary transition hover:bg-primary/10"
                  href={href}
                  onClick={() => setNavOpen(false)}
                >
                  {label}
                </a>
              ))}
            </nav>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
              onClick={() => {
                setRequestModalOpen(true);
                setNavOpen(false);
              }}
              type="button"
            >
              <PlusCircleIcon className="h-4 w-4" /> Request case
            </button>
            <div className="rounded-2xl border border-primary/10 bg-white px-4 py-3 text-sm text-text/70">
              <p className="text-sm font-semibold text-primary">{account.name}</p>
              <p>{account.email}</p>
              <button
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:text-primary/80"
                onClick={handleSignOut}
                type="button"
              >
                <ArrowLeftOnRectangleIcon className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="relative z-10">
          <section id="overview" className="mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-16 pt-10 lg:flex-row lg:items-center">
            <div className="max-w-2xl space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/65 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Stakeholder pulse
              </span>
              <h1 className="text-4xl font-bold leading-tight text-primary sm:text-5xl lg:text-6xl">
                Welcome back, {firstName}. Curate the stories you care about.
              </h1>
              <p className="text-base text-text/80 sm:text-lg">
                Follow active investigations, review secure drops, and coordinate with command without leaving this
                collaboration surface.
              </p>
              {feedback && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    feedback.type === 'error'
                      ? 'border-red-200 bg-red-50 text-red-600'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                  }`}
                >
                  {feedback.message}
                </div>
              )}
              {status.error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {status.error}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-accent1 px-7 py-3 text-sm font-semibold text-white transition hover:bg-accent1/90"
                  onClick={() => setRequestModalOpen(true)}
                  type="button"
                >
                  <PaperAirplaneIcon className="h-5 w-5" /> Submit new case request
                </button>
                <a className="text-sm font-semibold text-primary transition hover:text-accent1" href="#requests">
                  View your pending requests
                </a>
              </div>
            </div>
            <div className="grid flex-1 gap-6 sm:grid-cols-2">
              <article className="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-card backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-primary/70">Cases following</p>
                  <BuildingLibraryIcon className="h-6 w-6 text-accent1" />
                </div>
                <p className="mt-4 text-4xl font-bold text-primary">{summary.casesFollowing}</p>
                <p className="text-xs text-text/60">Matters where you’re a named stakeholder</p>
              </article>
              <article className="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-card backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-primary/70">Shared evidence</p>
                  <ClipboardDocumentListIcon className="h-6 w-6 text-accent2" />
                </div>
                <p className="mt-4 text-4xl font-bold text-primary">{summary.sharedEvidence}</p>
                <p className="text-xs text-text/60">Secure artifacts you can inspect</p>
              </article>
              <article className="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-card backdrop-blur sm:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-primary/70">Recent actions</p>
                  <BoltIcon className="h-6 w-6 text-accent3" />
                </div>
                <p className="mt-4 text-4xl font-bold text-primary">{summary.recentActivity.length}</p>
                <p className="text-xs text-text/60">Interactions captured in the past week</p>
              </article>
            </div>
          </section>

          <section id="cases" className="mx-auto max-w-6xl px-6 pb-16">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                  Watchlist
                </span>
                <h2 className="mt-3 text-3xl font-bold text-primary">Cases you’re following</h2>
                <p className="text-sm text-text/70">
                  Receive ledger updates and investigator signals the moment they land.
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {summary.followingCases.length === 0 && !status.loading ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <div className="rounded-3xl border border-dashed border-primary/20 bg-white/80 p-8 text-sm text-text/60">
                    You’re not following any cases yet. Browse available investigations and add the ones you care about.
                  </div>
                </div>
              ) : (
                summary.followingCases.map((item) => (
                  <article
                    key={item._id}
                    className="group flex flex-col gap-4 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-card"
                  >
                    <div className="flex items-start gap-4">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <UserGroupIcon className="h-6 w-6" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary/70">Case {item.caseNumber}</p>
                        <h3 className="text-lg font-semibold text-primary">{item.title}</h3>
                      </div>
                    </div>
                    <p className="text-sm text-text/70">{item.description || 'No narrative supplied yet.'}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-text/60">
                      <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                        Status: {item.status?.replace('_', ' ') || 'open'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <BookmarkIcon className="h-4 w-4" /> {item.stakeholderCount ?? '0'} stakeholders
                      </span>
                      {item.assignedInvestigatorEmail && (
                        <span>Investigator: {item.assignedInvestigatorEmail}</span>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-xs text-text/50">Updated {formatDate(item.updatedAt)}</span>
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(caseActionBusy[item._id])}
                        onClick={() => handleFollowToggle(item, true)}
                        type="button"
                      >
                        {caseActionBusy[item._id] ? 'Updating…' : 'Unfollow'}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="mt-16 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                  Discover
                </span>
                <h2 className="mt-3 text-3xl font-bold text-primary">Cases available to follow</h2>
                <p className="text-sm text-text/70">Tap into emerging investigations shared with your role.</p>
              </div>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {summary.availableCases.length === 0 && !status.loading ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <div className="rounded-3xl border border-dashed border-primary/20 bg-white/80 p-8 text-sm text-text/60">
                    No new investigations to follow right now. Command will surface additional dossiers as they become
                    available.
                  </div>
                </div>
              ) : (
                summary.availableCases.map((item) => (
                  <article
                    key={item._id}
                    className="group flex flex-col gap-4 rounded-3xl border border-primary/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-card"
                  >
                    <div className="flex items-start gap-4">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent1/10 text-accent1">
                        <UserGroupIcon className="h-6 w-6" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary/70">Case {item.caseNumber}</p>
                        <h3 className="text-lg font-semibold text-primary">{item.title}</h3>
                      </div>
                    </div>
                    <p className="text-sm text-text/70">{item.description || 'Command has not published a summary yet.'}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-text/60">
                      <span className="rounded-full bg-accent1/10 px-3 py-1 font-semibold text-accent1">
                        Status: {item.status?.replace('_', ' ') || 'open'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <BookmarkIcon className="h-4 w-4" /> {item.stakeholderCount ?? '0'} stakeholders
                      </span>
                      {item.assignedInvestigatorEmail && <span>Investigator: {item.assignedInvestigatorEmail}</span>}
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-xs text-text/50">Updated {formatDate(item.updatedAt)}</span>
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(caseActionBusy[item._id])}
                        onClick={() => handleFollowToggle(item, false)}
                        type="button"
                      >
                        {caseActionBusy[item._id] ? 'Adding…' : 'Follow case'}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section id="requests" className="mx-auto max-w-6xl px-6 pb-16">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                  Requests
                </span>
                <h2 className="mt-3 text-3xl font-bold text-primary">Your case requests</h2>
                <p className="text-sm text-text/70">Track submissions routed to command for new investigations.</p>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                onClick={() => setRequestModalOpen(true)}
                type="button"
              >
                <PlusCircleIcon className="h-4 w-4" /> New request
              </button>
            </div>

            <div className="mt-8 space-y-4">
              {summary.caseRequests.length === 0 && !status.loading ? (
                <div className="rounded-3xl border border-dashed border-primary/20 bg-white/80 p-8 text-sm text-text/60">
                  You haven’t submitted any case requests yet. Outline mission context and command will respond here.
                </div>
              ) : (
                summary.caseRequests.map((item) => (
                  <article
                    key={item._id}
                    className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/70">
                          {item.urgency || 'standard'} urgency
                        </p>
                        <h3 className="text-lg font-semibold text-primary">{item.subject}</h3>
                      </div>
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {item.status || 'pending'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-text/70">{item.details}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-text/60">
                      <span>Submitted {formatDate(item.createdAt)}</span>
                      <span>Last update {formatDate(item.updatedAt)}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section id="activity" className="mx-auto max-w-6xl px-6 pb-20">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                Activity feed
              </span>
              <h2 className="text-3xl font-bold text-primary sm:text-4xl">Latest moves across your workspace</h2>
              <p className="max-w-3xl text-base text-text/70 sm:text-lg">
                Recent case joins, evidence shares, and request submissions appear below for quick situational awareness.
              </p>
            </div>

            <div className="mt-10 space-y-4">
              {status.loading ? (
                <p className="text-sm text-text/60">Loading activity…</p>
              ) : summary.recentActivity.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-primary/20 bg-white/80 p-8 text-sm text-text/60">
                  No activity recorded yet. Once you follow cases or submit requests, a timeline will appear here.
                </div>
              ) : (
                summary.recentActivity.map((item, index) => (
                  <div
                    key={`${item.timestamp || index}`}
                    className="flex items-start justify-between gap-4 rounded-3xl border border-primary/10 bg-white/80 p-5 shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-semibold text-primary">{item.description}</p>
                      <p className="text-xs text-text/60">{item.actor || 'system'}</p>
                    </div>
                    <span className="text-xs text-text/50">{item.timestamp || '—'}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>

        <footer className="relative z-10 border-t border-white/30 bg-white/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 text-sm text-text/70 md:flex-row md:items-center md:justify-between">
            <p>© 2025 BXAI Collaboration Hub. Designed for explainable, trustworthy evidence sharing.</p>
            <div className="flex flex_wrap items-center gap-4">
              <a className="transition hover:text-primary" href="#privacy">
                Privacy
              </a>
              <a className="transition hover:text-primary" href="#terms">
                Terms
              </a>
            </div>
          </div>
        </footer>
      </div>

      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-10">
          <div className="flex w-full max-w-2xl flex-col gap-6 rounded-3xl bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-primary">Submit a case request</h2>
                <p className="text-xs text-text/60">
                  Outline the scenario and urgency. Command reviews every submission in real time.
                </p>
              </div>
              <button
                className="rounded-full border border-primary/10 p-2 text-primary transition hover:bg-primary/10"
                onClick={() => setRequestModalOpen(false)}
                type="button"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-6" onSubmit={handleRequestSubmit}>
              <div>
                <label className="block text-sm font-semibold text-primary" htmlFor="request-subject">
                  Subject
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text shadow-inner transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                  id="request-subject"
                  name="subject"
                  onChange={(event) => setRequestForm((previous) => ({ ...previous, subject: event.target.value }))}
                  placeholder="e.g., Digital fraud escalation in APAC"
                  type="text"
                  value={requestForm.subject}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-primary" htmlFor="request-details">
                  Context & objectives
                </label>
                <textarea
                  className="mt-2 h-32 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text shadow-inner transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                  id="request-details"
                  name="details"
                  onChange={(event) => setRequestForm((previous) => ({ ...previous, details: event.target.value }))}
                  placeholder="Include known indicators, affected teams, or desired investigator support"
                  value={requestForm.details}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-primary" htmlFor="request-urgency">
                    Urgency
                  </label>
                  <select
                    className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text shadow-inner transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                    id="request-urgency"
                    name="urgency"
                    onChange={(event) => setRequestForm((previous) => ({ ...previous, urgency: event.target.value }))}
                    value={requestForm.urgency}
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {requestStatus.error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {requestStatus.error}
                </div>
              )}
              {requestStatus.message && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
                  {requestStatus.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  className="rounded-full border border-primary/20 px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
                  onClick={() => setRequestModalOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={requestStatus.submitting}
                  type="submit"
                >
                  {requestStatus.submitting ? 'Sending…' : (
                    <>
                      <PaperAirplaneIcon className="h-4 w-4" /> Send request
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard;
