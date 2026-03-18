import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  FolderIcon,
  FolderOpenIcon,
  DocumentIcon,
  UsersIcon,
  ShieldCheckIcon,
  EyeIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/admin';

const badgeClass = (status) => {
  switch (status) {
    case 'open':
      return 'bg-sky-100 text-sky-600';
    case 'closed':
      return 'bg-emerald-100 text-emerald-600';
    case 'under_investigation':
      return 'bg-amber-100 text-amber-600';
    default:
      return 'bg-slate-100 text-slate-500';
  }
};

const roleAccent = {
  admin: 'bg-rose-100 text-rose-600',
  investigator: 'bg-sky-100 text-sky-600',
  user: 'bg-emerald-100 text-emerald-600',
};

const requestStatusAccent = {
  accepted: 'bg-emerald-100 text-emerald-600',
  rejected: 'bg-rose-100 text-rose-600',
  pending: 'bg-amber-100 text-amber-600',
};

const Dashboard = () => {
  const { admin } = useOutletContext();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [weeklyActivity, setWeeklyActivity] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [cases, setCases] = useState([]);
  const [caseRequests, setCaseRequests] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [status, setStatus] = useState({ loading: true, error: '' });
  const [caseModal, setCaseModal] = useState({ open: false, activity: null, caseRecord: null, caseRequest: null });

  const formatAccountName = useCallback((account) => {
    if (!account) {
      return 'Account';
    }
    const fullName = `${account.firstName || ''} ${account.lastName || ''}`.trim();
    return fullName || account.email || 'Account';
  }, []);

  useEffect(() => {
    const loadTelemetry = async () => {
      try {
        setStatus({ loading: true, error: '' });
        const [summaryData, metricsData, accountsData, casesData, caseRequestsData] = await Promise.all([
          adminApi.fetchSummary(),
          adminApi.fetchWeeklyMetrics(),
          adminApi.listAccounts(),
          adminApi.listCases(),
          adminApi.listCaseRequests(),
        ]);
        setSummary(summaryData);
        setWeeklyActivity(metricsData.metrics || []);
        setAccounts(accountsData.accounts || []);
        setCases(casesData.cases || []);
        setCaseRequests(caseRequestsData.caseRequests || []);
        setStatus({ loading: false, error: '' });
      } catch (error) {
        setStatus({ loading: false, error: error.message || 'Unable to load dashboard analytics' });
      }
    };

    loadTelemetry();
  }, []);

  const stats = useMemo(() => {
    const totals = summary || {};
    return [
      { label: 'Total Cases', value: totals.cases || 0, icon: FolderIcon, accent: 'bg-blue-100 text-blue-600' },
      { label: 'Open Cases', value: totals.openCases || 0, icon: FolderOpenIcon, accent: 'bg-amber-100 text-amber-600' },
      { label: 'Evidence Items', value: totals.evidenceItems || 0, icon: DocumentIcon, accent: 'bg-emerald-100 text-emerald-600' },
      { label: 'Investigators', value: totals.totalInvestigators || 0, icon: UsersIcon, accent: 'bg-indigo-100 text-indigo-600' },
    ];
  }, [summary]);

  const investigatorCaseMap = useMemo(() => {
    const map = {};
    (cases || []).forEach((item) => {
      const email = (item.assignedInvestigatorEmail || '').toLowerCase();
      if (!email) {
        return;
      }
      if (!map[email]) {
        map[email] = [];
      }
      map[email].push(item);
    });
    return map;
  }, [cases]);

  const investigatorAccounts = useMemo(
    () => (accounts || []).filter((account) => account.role === 'investigator'),
    [accounts]
  );

  const userAccounts = useMemo(() => (accounts || []).filter((account) => account.role === 'user'), [accounts]);

  const getAssignedCases = useCallback(
    (account) => {
      if (!account) {
        return [];
      }
      const email = (account.email || '').toLowerCase();
      return investigatorCaseMap[email] || [];
    },
    [investigatorCaseMap]
  );

  const handleToggleAccount = useCallback((accountId) => {
    setSelectedAccount((previous) => (previous === accountId ? null : accountId));
  }, []);

  const formatCreatedAt = useCallback((value) => {
    if (!value) {
      return '—';
    }
    try {
      return new Date(value).toLocaleDateString();
    } catch (error) {
      return value;
    }
  }, []);

  const recentCases = summary?.recentCases || [];
  const recentEvidence = summary?.recentEvidence || [];
  const latestActivity = summary?.latestActivity || [];
  const formattedWeeklyMetrics = useMemo(
    () =>
      (weeklyActivity || []).map((item) => ({
        ...item,
        label: new Date(item.date).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
      })),
    [weeklyActivity]
  );

  const findCaseForActivity = useCallback(
    (activity) => {
      if (!activity) {
        return null;
      }

      const description = (activity.description || '').toLowerCase();
      if (!description) {
        return null;
      }

      let query = description;
      const colonIndex = description.indexOf(':');
      if (colonIndex >= 0) {
        query = description.slice(colonIndex + 1);
      }

      query = query
        .replace(/requested new case/gi, '')
        .replace(/new case request/gi, '')
        .replace(/case number/gi, '')
        .trim();

      if (!query) {
        return null;
      }

      const normalizedQuery = query.toLowerCase();
      const catalog = cases || [];

      return (
        catalog.find((item) => (item.title || '').toLowerCase() === normalizedQuery) ||
        catalog.find((item) => (item.caseNumber || '').toLowerCase() === normalizedQuery) ||
        catalog.find((item) => (item.title || '').toLowerCase().includes(normalizedQuery)) ||
        null
      );
    },
    [cases]
  );

  const findCaseRequestForActivity = useCallback(
    (activity) => {
      if (!activity) {
        return null;
      }

      const description = activity.description || '';
      if (!description) {
        return null;
      }

      const subjectFromRequest = description.match(/requested new case:\s*(.+)$/i);
      const subjectFromStatus = description.match(/case request ['"](.+?)['"]:/i);
      const subject = (subjectFromRequest?.[1] || subjectFromStatus?.[1] || '').trim();
      if (!subject) {
        return null;
      }

      const normalized = subject.toLowerCase();
      return caseRequests.find((item) => (item.subject || '').trim().toLowerCase() === normalized) || null;
    },
    [caseRequests]
  );

  const handleViewCaseFromActivity = useCallback(
    (activity) => {
      const caseRecord = findCaseForActivity(activity);
      const caseRequest = findCaseRequestForActivity(activity);
      setCaseModal({ open: true, activity, caseRecord, caseRequest });
    },
    [findCaseForActivity, findCaseRequestForActivity]
  );

  const handleCloseCaseModal = useCallback(() => {
    setCaseModal({ open: false, activity: null, caseRecord: null, caseRequest: null });
  }, []);

  const handleAssignFromActivity = useCallback(
    (activity) => {
      const caseRecord = findCaseForActivity(activity);
      if (caseRecord?._id) {
        navigate('/admin/cases', { state: { focusCaseId: caseRecord._id } });
      } else {
        navigate('/admin/cases');
      }
    },
    [findCaseForActivity, navigate]
  );

  const handleDownloadCaseDetails = useCallback((caseRecord) => {
    if (!caseRecord) {
      return;
    }

    const payload = {
      title: caseRecord.title,
      caseNumber: caseRecord.caseNumber,
      status: caseRecord.status,
      description: caseRecord.description,
      assignedInvestigatorEmail: caseRecord.assignedInvestigatorEmail,
      assignedInvestigatorName: caseRecord.assignedInvestigatorName,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${caseRecord.caseNumber || caseRecord.title || 'case'}-details.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }, []);

  const refreshCaseRequests = useCallback(async () => {
    try {
      const response = await adminApi.listCaseRequests();
      setCaseRequests(response.caseRequests || []);
    } catch (error) {
      setStatus((previous) => ({ ...previous, error: error.message || 'Unable to refresh case requests' }));
    }
  }, []);

  const handleUpdateCaseRequestStatus = useCallback(
    async (requestId, nextStatus) => {
      try {
        await adminApi.updateCaseRequestStatus(requestId, nextStatus);
        await Promise.all([
          refreshCaseRequests(),
          adminApi.fetchSummary().then((data) => setSummary(data)),
        ]);
        setStatus((previous) => ({ ...previous, error: '' }));
      } catch (error) {
        setStatus((previous) => ({ ...previous, error: error.message || 'Unable to update case request status' }));
      }
    },
    [refreshCaseRequests]
  );

  useEffect(() => {
    setCaseModal((previous) => {
      if (!previous.caseRequest) {
        return previous;
      }
      const nextRequest = caseRequests.find((item) => item._id === previous.caseRequest._id);
      if (!nextRequest) {
        if (!previous.caseRequest) {
          return previous;
        }
        return { ...previous, caseRequest: null };
      }
      if (
        nextRequest.status === previous.caseRequest.status &&
        nextRequest.updatedAt === previous.caseRequest.updatedAt
      ) {
        return previous;
      }
      return { ...previous, caseRequest: nextRequest };
    });
  }, [caseRequests]);

  const activeCaseRequest = caseModal.caseRequest;
  const activeCaseRequestStatus = activeCaseRequest?.status || 'pending';
  const activeCaseRequestBadge = requestStatusAccent[activeCaseRequestStatus] || 'bg-slate-100 text-slate-500';
  const activeCaseRequestUrgency = activeCaseRequest?.urgency || 'standard';

  if (status.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text">
        <p className="text-sm font-semibold text-primary">Loading command telemetry…</p>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-primary/10 bg-rose-50 p-6 text-sm font-semibold text-rose-600 shadow-sm">
          {status.error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-primary/10 bg-white p-10 shadow-card">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold text-primary sm:text-4xl">
            Welcome back, {admin?.name?.split(' ')[0] || 'Admin'}
          </h1>
          <p className="max-w-2xl text-sm text-text/70">
            Review live case metrics, evidence throughput, and recent activity from your BXAI command center.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="rounded-2xl border border-primary/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text/50">{label}</p>
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${accent}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-4 text-3xl font-bold text-primary">{value}</p>
            <p className="mt-2 text-xs text-text/60">Auto-synced from BXAI data plane</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Investigators</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/50">
              {investigatorAccounts.length} active
            </span>
          </div>
          {investigatorAccounts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6 text-sm text-text/60">
              No investigators enrolled yet.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {investigatorAccounts.map((account) => {
                const accountCases = getAssignedCases(account);
                const isExpanded = selectedAccount === account._id;
                return (
                  <div
                    key={account._id}
                    className="rounded-2xl border border-primary/10 bg-background/70 p-4 text-sm text-text/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-primary">{formatAccountName(account)}</p>
                        <p className="text-xs text-text/50">{account.email}</p>
                        <div className="mt-2 inline-flex items-center gap-2 text-xs">
                          <span className={
                            `inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                              roleAccent[account.role] || 'bg-indigo-100 text-indigo-600'
                            }`
                          }>
                            Investigator
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary">
                            <BuildingOfficeIcon className="h-4 w-4" />
                            {account.organization || 'Not specified'}
                          </span>
                        </div>
                      </div>
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
                        onClick={() => handleToggleAccount(account._id)}
                        type="button"
                      >
                        <EyeIcon className="h-4 w-4" /> {isExpanded ? 'Hide info' : 'View'}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text/60">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                        <FolderIcon className="h-4 w-4" /> Cases assigned: {accountCases.length}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                        <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />
                        Joined {formatCreatedAt(account.createdAt)}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="mt-4 space-y-3 rounded-2xl border border-primary/10 bg-white p-4 text-xs text-text/60">
                        <div className="flex items-center gap-2 text-text/70">
                          <EnvelopeIcon className="h-4 w-4" />
                          {account.email}
                        </div>
                        {accountCases.length === 0 ? (
                          <p>No cases currently assigned.</p>
                        ) : (
                          <div>
                            <p className="font-semibold text-primary">Assigned cases</p>
                            <ul className="mt-2 space-y-1">
                              {accountCases.slice(0, 3).map((caseItem) => (
                                <li key={caseItem._id} className="rounded-xl bg-background/70 px-3 py-2">
                                  <span className="font-semibold text-primary">{caseItem.title}</span>
                                  <span className="ml-2 text-xs text-text/50">Case {caseItem.caseNumber}</span>
                                </li>
                              ))}
                              {accountCases.length > 3 && (
                                <li className="text-xs text-text/50">
                                  + {accountCases.length - 3} more case(s) in queue
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Users</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/50">
              {userAccounts.length} active
            </span>
          </div>
          {userAccounts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6 text-sm text-text/60">
              No user accounts found yet.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {userAccounts.map((account) => {
                const isExpanded = selectedAccount === account._id;
                return (
                  <div
                    key={account._id}
                    className="rounded-2xl border border-primary/10 bg-background/70 p-4 text-sm text-text/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-primary">{formatAccountName(account)}</p>
                        <p className="text-xs text-text/50">{account.email}</p>
                        <div className="mt-2 inline-flex items-center gap-2 text-xs">
                          <span className={
                            `inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                              roleAccent[account.role] || 'bg-emerald-100 text-emerald-600'
                            }`
                          }>
                            {account.role}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary">
                            <BuildingOfficeIcon className="h-4 w-4" />
                            {account.organization || 'Independent'}
                          </span>
                        </div>
                      </div>
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
                        onClick={() => handleToggleAccount(account._id)}
                        type="button"
                      >
                        <EyeIcon className="h-4 w-4" /> {isExpanded ? 'Hide info' : 'View'}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text/60">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                        <UsersIcon className="h-4 w-4" /> Joined {formatCreatedAt(account.createdAt)}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="mt-4 space-y-3 rounded-2xl border border-primary/10 bg-white p-4 text-xs text-text/60">
                        <div className="flex items-center gap-2 text-text/70">
                          <EnvelopeIcon className="h-4 w-4" />
                          {account.email}
                        </div>
                        <p className="text-text/70">
                          Organization: <span className="font-semibold text-primary">{account.organization || 'Independent'}</span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Weekly activity</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/50">Last 7 days</span>
          </div>
          <div className="mt-6 space-y-3">
            {formattedWeeklyMetrics.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-primary/20 bg-background/60 p-6 text-sm text-text/60">
                No activity recorded this week.
              </div>
            ) : (
              formattedWeeklyMetrics.map((item) => (
                <div
                  key={item.date}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-background/70 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-primary">{item.label}</p>
                    <p className="text-xs text-text/60">Daily capture window</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text/60">
                    <span className="inline-flex gap-2">
                      <span className="font-semibold text-primary">Cases</span>
                      {item.cases}
                    </span>
                    <span className="inline-flex gap-2">
                      <span className="font-semibold text-primary">Evidence</span>
                      {item.evidence}
                    </span>
                    <span className="inline-flex gap-2">
                      <span className="font-semibold text-primary">Verified</span>
                      {item.verifiedEvidence}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Recent cases</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/50">Live queue</span>
          </div>
          <div className="mt-4 space-y-4">
            {recentCases.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-primary/20 bg-background/60 p-6 text-sm text-text/60">
                No cases recorded yet.
              </div>
            ) : (
              recentCases.map((item) => (
                <div
                  key={item.caseNumber}
                  className="flex items-center justify-between rounded-2xl border border-primary/10 bg-background/70 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-primary">{item.title}</p>
                    <p className="text-xs text-text/60">Case {item.caseNumber}</p>
                    {item.assignedInvestigatorEmail && (
                      <p className="mt-1 text-xs text-text/50">Assigned to {item.assignedInvestigatorEmail}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${badgeClass(item.status)}`}>
                    {item.status?.replace('_', ' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Recent evidence</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/50">Latest ingest</span>
          </div>
          <div className="mt-4 space-y-4">
            {recentEvidence.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-primary/20 bg-background/60 p-6 text-sm text-text/60">
                No evidence uploaded yet.
              </div>
            ) : (
              recentEvidence.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center justify-between rounded-2xl border border-primary/10 bg-background/70 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-primary">{item.title}</p>
                    <p className="text-xs text-text/60">Case {item.caseTitle || '—'}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-text/60">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                      {item.evidenceType?.replace('_', ' ')}
                    </span>
                    {item.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600">
                        <ShieldCheckIcon className="h-4 w-4" />
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-600">
                        Pending
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Command activity</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/50">Latest 5</span>
          </div>
          <div className="mt-4 space-y-4">
            {latestActivity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-primary/20 bg-background/60 p-6 text-sm text-text/60">
                No activity logged yet.
              </div>
            ) : (
              latestActivity.map((item, index) => {
                const caseRecord = findCaseForActivity(item);
                const hasCase = Boolean(caseRecord);
                const relatedRequest = findCaseRequestForActivity(item);
                const requestStatus = relatedRequest?.status || 'pending';

                return (
                  <div
                    key={`${item.timestamp || 'activity'}-${item.description || index}-${index}`}
                    className="rounded-2xl border border-primary/10 bg-background/70 p-4"
                  >
                    <p className="text-sm font-semibold text-primary">{item.description}</p>
                    <p className="mt-1 text-xs text-text/60">{item.actor || 'system'}</p>
                    <p className="mt-1 text-xs text-text/50">{item.timestamp || '—'}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-2 font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
                        onClick={() => handleViewCaseFromActivity(item)}
                        type="button"
                      >
                        View case
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-2 font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!hasCase}
                        onClick={() => handleAssignFromActivity(item)}
                        type="button"
                      >
                        Assign investigator
                      </button>
                      {relatedRequest && (
                        <>
                          <button
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 px-3 py-2 font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={requestStatus === 'accepted'}
                            onClick={() => handleUpdateCaseRequestStatus(relatedRequest._id, 'accepted')}
                            type="button"
                          >
                            Accept request
                          </button>
                          <button
                            className="inline-flex items-center gap-2 rounded-full border border-rose-300 px-3 py-2 font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={requestStatus === 'rejected'}
                            onClick={() => handleUpdateCaseRequestStatus(relatedRequest._id, 'rejected')}
                            type="button"
                          >
                            Reject request
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {caseModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-10">
          <div className="w-full max-w-2xl rounded-3xl border border-primary/10 bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-primary">Case details</h3>
                <p className="text-xs text-text/60">Insights sourced from recent command activity.</p>
              </div>
              <button
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/10"
                onClick={handleCloseCaseModal}
                type="button"
              >
                Close
              </button>
            </div>

            {caseModal.caseRecord ? (
              <div className="mt-6 space-y-6 text-sm text-text/70">
                <div className="rounded-2xl border border-primary/10 bg-background/70 p-4">
                  <p className="text-sm font-semibold text-primary">{caseModal.caseRecord.title}</p>
                  <p className="text-xs text-text/60">Case {caseModal.caseRecord.caseNumber || '—'}</p>
                </div>
                {caseModal.caseRecord.description && (
                  <p className="text-sm text-text/70">{caseModal.caseRecord.description}</p>
                )}
                <dl className="grid gap-4 text-xs text-text/60 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-primary">Status</dt>
                    <dd className="mt-1 capitalize">{caseModal.caseRecord.status?.replace('_', ' ') || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-primary">Assigned investigator</dt>
                    <dd className="mt-1">
                      {caseModal.caseRecord.assignedInvestigatorName || caseModal.caseRecord.assignedInvestigatorEmail || 'Unassigned'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-primary">Created</dt>
                    <dd className="mt-1">{caseModal.caseRecord.createdAt || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-primary">Last updated</dt>
                    <dd className="mt-1">{caseModal.caseRecord.updatedAt || '—'}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
                    onClick={() => handleDownloadCaseDetails(caseModal.caseRecord)}
                    type="button"
                  >
                    Download case (.json)
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
                    onClick={() => {
                      handleAssignFromActivity(caseModal.activity);
                      handleCloseCaseModal();
                    }}
                    type="button"
                  >
                    Assign investigator
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-primary/20 bg-background/60 p-6 text-sm text-text/60">
                No linked case was found for this activity yet. Review the activity feed for additional context.
              </div>
            )}
            {activeCaseRequest && (
              <div className="mt-6 space-y-3 rounded-2xl border border-primary/10 bg-background/70 p-4 text-sm text-text/70">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text/60">
                  <div>
                    <p className="text-sm font-semibold text-primary">Case request</p>
                    <p className="text-xs text-text/50">{activeCaseRequest.subject}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${activeCaseRequestBadge}`}>
                    {activeCaseRequestStatus}
                  </span>
                </div>
                <p className="text-xs text-text/60">
                  Urgency:&nbsp;
                  <span className="font-semibold capitalize text-primary">{activeCaseRequestUrgency}</span>
                </p>
                <p className="rounded-2xl bg-white p-3 text-sm text-text/70 whitespace-pre-line">
                  {activeCaseRequest.details}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-text/50">
                  <span>Submitted {activeCaseRequest.createdAt || '—'}</span>
                  <span>Last update {activeCaseRequest.updatedAt || '—'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300 px-4 py-2 font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={activeCaseRequestStatus === 'accepted'}
                    onClick={() => handleUpdateCaseRequestStatus(activeCaseRequest._id, 'accepted')}
                    type="button"
                  >
                    Accept request
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-rose-300 px-4 py-2 font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={activeCaseRequestStatus === 'rejected'}
                    onClick={() => handleUpdateCaseRequestStatus(activeCaseRequest._id, 'rejected')}
                    type="button"
                  >
                    Reject request
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
