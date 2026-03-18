import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserGroupIcon,
  ArrowPathIcon,
  EyeIcon,
  FolderIcon,
  UsersIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/admin';

const roleBadge = (role) => {
  switch (role) {
    case 'admin':
      return 'bg-rose-100 text-rose-600';
    case 'investigator':
      return 'bg-sky-100 text-sky-600';
    default:
      return 'bg-emerald-100 text-emerald-600';
  }
};

const Users = () => {
  const [accounts, setAccounts] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setLoading(true);
        const [accountsResponse, casesResponse] = await Promise.all([
          adminApi.listAccounts(),
          adminApi.listCases(),
        ]);
        setAccounts(accountsResponse.accounts || []);
        setCases(casesResponse.cases || []);
        setError('');
      } catch (err) {
        setError(err.message || 'Unable to load users');
      } finally {
        setLoading(false);
      }
    };

    loadAccounts();
  }, []);

  const memberCount = accounts.length;

  const formatAccountName = useCallback((account) => {
    if (!account) {
      return 'Account';
    }
    const fullName = `${account.firstName || ''} ${account.lastName || ''}`.trim();
    return fullName || account.email || 'Account';
  }, []);

  const formatDate = useCallback((value) => {
    if (!value) {
      return '—';
    }
    try {
      return new Date(value).toLocaleDateString();
    } catch (err) {
      return value;
    }
  }, []);

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
    () => accounts.filter((account) => account.role === 'investigator'),
    [accounts]
  );

  const userAccounts = useMemo(
    () => accounts.filter((account) => account.role === 'user'),
    [accounts]
  );

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
    setSelectedAccount((prev) => (prev === accountId ? null : accountId));
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">User Management</h1>
          <p className="mt-2 text-sm text-text/60">Oversee roles, invitations, and access posture across BXAI.</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10"
          onClick={() => window.location.reload()}
          type="button"
        >
          <ArrowPathIcon className="h-5 w-5" />
          Sync directory
        </button>
      </header>

      <section className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserGroupIcon className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-primary">Directory</h2>
              <p className="text-sm text-text/60">Review workforce roster and enforcement schedule.</p>
            </div>
          </div>
          <div className="rounded-full bg-primary/5 px-4 py-2 text-xs font-semibold text-primary">
            {memberCount} members
          </div>
        </div>
        {error && <p className="mt-4 text-sm font-semibold text-rose-500">{error}</p>}
        {loading ? (
          <div className="mt-6 rounded-2xl border border-primary/10 bg-background/70 p-6 text-sm text-text/60">
            Loading directory…
          </div>
        ) : accounts.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6 text-sm text-text/60">
            No accounts yet. Once investigators and users sign up, they will appear here.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-text/50">Investigators</h3>
              {investigatorAccounts.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6 text-sm text-text/60">
                  No investigators enrolled yet.
                </div>
              ) : (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {investigatorAccounts.map((account) => {
                    const assignedCases = getAssignedCases(account);
                    const isExpanded = selectedAccount === account._id;
                    return (
                      <article
                        key={account._id}
                        className="flex h-full flex-col rounded-2xl border border-primary/10 bg-background/70 p-4 text-sm text-text/70 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-primary">{formatAccountName(account)}</p>
                            <p className="text-xs text-text/50">{account.email}</p>
                            <div className="mt-2 inline-flex flex-wrap items-center gap-2 text-xs">
                              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ${roleBadge(account.role)}`}>
                                {account.role}
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
                            <EyeIcon className="h-4 w-4" /> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text/60">
                          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                            <FolderIcon className="h-4 w-4" /> Cases assigned: {assignedCases.length}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                            <UsersIcon className="h-4 w-4" /> Joined {formatDate(account.createdAt)}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="mt-4 space-y-3 rounded-2xl border border-primary/10 bg-white p-4 text-xs text-text/60">
                            <div className="flex items-center gap-2 text-text/70">
                              <EnvelopeIcon className="h-4 w-4" />
                              {account.email}
                            </div>
                            {assignedCases.length === 0 ? (
                              <p>No cases currently assigned.</p>
                            ) : (
                              <div>
                                <p className="font-semibold text-primary">Assigned cases</p>
                                <ul className="mt-2 space-y-1">
                                  {assignedCases.slice(0, 3).map((caseItem) => (
                                    <li key={caseItem._id} className="rounded-xl bg-background/70 px-3 py-2">
                                      <span className="font-semibold text-primary">{caseItem.title}</span>
                                      <span className="ml-2 text-xs text-text/50">Case {caseItem.caseNumber}</span>
                                    </li>
                                  ))}
                                  {assignedCases.length > 3 && (
                                    <li className="text-xs text-text/50">+ {assignedCases.length - 3} more case(s)</li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-text/50">Users</h3>
              {userAccounts.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6 text-sm text-text/60">
                  No standard users registered yet.
                </div>
              ) : (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {userAccounts.map((account) => {
                    const isExpanded = selectedAccount === account._id;
                    return (
                      <article
                        key={account._id}
                        className="flex h-full flex-col rounded-2xl border border-primary/10 bg-background/70 p-4 text-sm text-text/70 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-primary">{formatAccountName(account)}</p>
                            <p className="text-xs text-text/50">{account.email}</p>
                            <div className="mt-2 inline-flex flex-wrap items-center gap-2 text-xs">
                              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ${roleBadge(account.role)}`}>
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
                            <EyeIcon className="h-4 w-4" /> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text/60">
                          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                            <UsersIcon className="h-4 w-4" /> Joined {formatDate(account.createdAt)}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="mt-4 space-y-3 rounded-2xl border border-primary/10 bg-white p-4 text-xs text-text/60">
                            <div className="flex items-center gap-2 text-text/70">
                              <EnvelopeIcon className="h-4 w-4" />
                              {account.email}
                            </div>
                            <p className="text-text/70">
                              Organization:{' '}
                              <span className="font-semibold text-primary">{account.organization || 'Independent'}</span>
                            </p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Users;
