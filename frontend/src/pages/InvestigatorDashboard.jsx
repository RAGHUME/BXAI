import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { adminApi } from '../api/admin';
import { analyzeEvidence, downloadAnalysisReport, fetchXAIResults } from '../services/xaiService';
import XAIResultCard from '../components/xai/XAIResultCard';
import logo from '../assets/bxai-logo.svg';
import {
  BriefcaseIcon,
  ClipboardDocumentListIcon,
  BellAlertIcon,
  DocumentTextIcon,
  ArrowLeftOnRectangleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const DEFAULT_METRICS = {
  totalEvidence: 0,
  anchoredEvidence: 0,
  anchorPending: 0,
  verifiedEvidence: 0,
  verificationPending: 0,
};

const InvestigatorDashboard = () => {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [summary, setSummary] = useState({
    assignedCases: 0,
    evidenceQueue: 0,
    openAlerts: 0,
    recentActivity: [],
    assignedCasesList: [],
  });
  const [status, setStatus] = useState({ loading: true, error: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCaseId, setSelectedCaseId] = useState('all');
  const [evidenceByCase, setEvidenceByCase] = useState({});
  const [evidenceState, setEvidenceState] = useState({ loading: false, error: '' });
  const [navOpen, setNavOpen] = useState(false);
  const [newEvidence, setNewEvidence] = useState({
    title: '',
    evidenceType: 'digital',
    description: '',
    collectionDate: '',
    location: '',
  });
  const [newEvidenceFile, setNewEvidenceFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState({ submitting: false, message: '', error: '' });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [metrics, setMetrics] = useState(DEFAULT_METRICS);
  const [blockchainFeed, setBlockchainFeed] = useState([]);
  const [chainStatus, setChainStatus] = useState({});
  const [xaiResults, setXaiResults] = useState({});
  const [xaiStatus, setXaiStatus] = useState({ message: '', error: '' });
  const [xaiLoadingIds, setXaiLoadingIds] = useState({});
  const [xaiFetchingIds, setXaiFetchingIds] = useState({});
  const [xaiSyncing, setXaiSyncing] = useState(false);
  const [xaiSelectedCaseId, setXaiSelectedCaseId] = useState('all');
  const [xaiAnchorNext, setXaiAnchorNext] = useState(false);
  const [xaiInitialized, setXaiInitialized] = useState(false);
  const fileInputRef = useRef(null);

  const firstName = useMemo(() => {
    if (!account?.name) {
      return 'Investigator';
    }
    const [first] = account.name.split(' ');
    return first || 'Investigator';
  }, [account]);

  useEffect(() => {
    const stored = localStorage.getItem('bxaiAccount') || sessionStorage.getItem('bxaiAccount');
    if (!stored) {
      navigate('/signin');
      return;
    }

    const parsed = JSON.parse(stored);
    if (parsed.role !== 'investigator' || parsed._id !== accountId) {
      navigate('/signin');
      return;
    }

    setAccount(parsed);

    const fetchSummary = async () => {
      try {
        const data = await authApi.fetchInvestigatorDashboard(accountId);
        setSummary({
          assignedCases: data.assignedCases || 0,
          evidenceQueue: data.evidenceQueue || 0,
          openAlerts: data.openAlerts || 0,
          recentActivity: data.recentActivity || [],
          assignedCasesList: data.assignedCasesList || [],
        });
        setMetrics({ ...DEFAULT_METRICS, ...(data.metrics || {}) });
        setEvidenceByCase(data.evidenceByCase || {});
        setBlockchainFeed(data.blockchainFeed || []);
        setSelectedCaseId('all');
        setStatus({ loading: false, error: '' });

        try {
          const statusResponse = await adminApi.getBlockchainStatus('investigator');
          setChainStatus(statusResponse);
        } catch (err) {
          console.warn('Unable to load blockchain status', err);
        }
      } catch (error) {
        setStatus({ loading: false, error: error.message || 'Unable to load dashboard data' });
      }
    };

    fetchSummary();
  }, [accountId, navigate]);

  const refreshEvidenceForCase = useCallback(
    async (caseId) => {
      if (!caseId || caseId === 'all') {
        return;
      }

      try {
        setEvidenceState({ loading: true, error: '' });
        const response = await adminApi.listEvidence(caseId);
        setEvidenceByCase((prev) => ({ ...prev, [caseId]: response.evidence || [] }));
        setEvidenceState({ loading: false, error: '' });
      } catch (error) {
        setEvidenceState({ loading: false, error: error.message || 'Unable to load evidence for case' });
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedCaseId || selectedCaseId === 'all' || (evidenceByCase[selectedCaseId] || []).length > 0) {
      return;
    }
    refreshEvidenceForCase(selectedCaseId);
  }, [selectedCaseId, evidenceByCase, refreshEvidenceForCase]);

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview', icon: BriefcaseIcon },
      { id: 'cases', label: 'Cases', icon: ClipboardDocumentListIcon },
      { id: 'evidence', label: 'Evidence', icon: ShieldCheckIcon },
      { id: 'blockchain', label: 'Blockchain', icon: DocumentTextIcon },
      { id: 'xai', label: 'XAI Insights', icon: SparklesIcon },
    ],
    []
  );

  const assignedCases = summary.assignedCasesList || [];
  const allEvidenceRecords = useMemo(() => Object.values(evidenceByCase || {}).flat(), [evidenceByCase]);
  const selectedEvidence =
    selectedCaseId === 'all'
      ? allEvidenceRecords
      : selectedCaseId
      ? evidenceByCase[selectedCaseId] || []
      : [];

  const availableForXai = useMemo(() => {
    if (xaiSelectedCaseId === 'all') {
      return allEvidenceRecords;
    }
    return evidenceByCase[xaiSelectedCaseId] || [];
  }, [allEvidenceRecords, evidenceByCase, xaiSelectedCaseId]);

  const handleAnchor = async (evidenceItem) => {
    if (!evidenceItem?._id) {
      return;
    }
    try {
      setEvidenceState((prev) => ({ ...prev, loading: true }));
      await adminApi.anchorEvidence(
        {
          evidence_id: evidenceItem._id,
          uploaderAddress: account?.walletAddress,
        },
        'investigator'
      );
      const targetCaseId = evidenceItem.caseId || selectedCaseId;
      if (targetCaseId && targetCaseId !== 'all') {
        await refreshEvidenceForCase(targetCaseId);
      }
      const statusResponse = await adminApi.getBlockchainStatus('investigator');
      setChainStatus(statusResponse);
      setUploadStatus({ submitting: false, message: 'Evidence anchored to blockchain.', error: '' });
    } catch (error) {
      setUploadStatus({ submitting: false, message: '', error: error.message || 'Anchoring failed.' });
    } finally {
      setEvidenceState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleVerify = async (evidenceItem) => {
    if (!evidenceItem?._id) {
      return;
    }
    try {
      setEvidenceState((prev) => ({ ...prev, loading: true }));
      const response = await adminApi.verifyEvidence(evidenceItem._id, undefined, 'investigator');
      await refreshEvidenceForCase(selectedCaseId);
      setUploadStatus({ submitting: false, message: response.message || 'Verification completed.', error: '' });
    } catch (error) {
      setUploadStatus({ submitting: false, message: '', error: error.message || 'Verification failed.' });
    } finally {
      setEvidenceState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleFetchXai = useCallback(
    async (evidenceId) => {
      if (!evidenceId) {
        return;
      }

      setXaiFetchingIds((prev) => ({ ...prev, [evidenceId]: true }));
      setXaiStatus({ message: '', error: '' });
      try {
        const response = await fetchXAIResults(evidenceId, { role: 'investigator' });
        setXaiResults((prev) => ({ ...prev, [evidenceId]: response }));
        setXaiStatus({ message: 'XAI results refreshed.', error: '' });
      } catch (error) {
        setXaiStatus({ message: '', error: error.message || 'Unable to fetch XAI results.' });
      } finally {
        setXaiFetchingIds((prev) => ({ ...prev, [evidenceId]: false }));
      }
    },
    []
  );

  const handleAnalyzeEvidence = useCallback(
    async (item) => {
      if (!item?._id) {
        return;
      }
      setXaiLoadingIds((prev) => ({ ...prev, [item._id]: true }));
      setXaiStatus({ message: '', error: '' });
      try {
        const response = await analyzeEvidence(item._id, item.file?.path, {
          anchor: xaiAnchorNext,
          role: 'investigator',
        });
        setXaiResults((prev) => ({ ...prev, [item._id]: response }));
        setXaiStatus({ message: 'Analysis completed successfully.', error: '' });
      } catch (error) {
        setXaiStatus({ message: '', error: error.message || 'Analysis request failed.' });
      } finally {
        setXaiLoadingIds((prev) => ({ ...prev, [item._id]: false }));
      }
    },
    [xaiAnchorNext]
  );

  const handleSyncAllXai = useCallback(async () => {
    if (availableForXai.length === 0) {
      return;
    }
    setXaiSyncing(true);
    setXaiStatus({ message: '', error: '' });
    try {
      const results = await Promise.all(
        availableForXai.map(async (item) => {
          try {
            const response = await fetchXAIResults(item._id, { role: 'investigator' });
            return [item._id, response];
          } catch (error) {
            return [item._id, null, error];
          }
        })
      );
      const nextState = {};
      let failed = 0;
      results.forEach(([id, payload, err]) => {
        if (payload) {
          nextState[id] = payload;
        }
        if (err) {
          failed += 1;
        }
      });
      setXaiResults((prev) => ({ ...prev, ...nextState }));
      if (failed > 0) {
        setXaiStatus({ message: '', error: `${failed} analyses could not be retrieved.` });
      } else {
        setXaiStatus({ message: 'All XAI results are up to date.', error: '' });
      }
    } catch (error) {
      setXaiStatus({ message: '', error: error.message || 'Failed to refresh XAI results.' });
    } finally {
      setXaiSyncing(false);
    }
  }, [availableForXai]);

  const handleDownloadReport = useCallback(async (item) => {
    if (!item?._id) {
      return;
    }
    setXaiFetchingIds((prev) => ({ ...prev, [item._id]: true }));
    try {
      const blob = await downloadAnalysisReport(item._id, { role: 'investigator' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `xai-report-${item._id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setXaiStatus({ message: 'Report downloaded successfully.', error: '' });
    } catch (error) {
      setXaiStatus({ message: '', error: error.message || 'Unable to download report.' });
    } finally {
      setXaiFetchingIds((prev) => ({ ...prev, [item._id]: false }));
    }
  }, []);

  useEffect(() => {
    if (!xaiInitialized && availableForXai.length > 0) {
      handleSyncAllXai().finally(() => setXaiInitialized(true));
    }
  }, [availableForXai, handleSyncAllXai, xaiInitialized]);

  const handleEvidenceSubmit = async (event) => {
    event.preventDefault();
    if (!selectedCaseId || selectedCaseId === 'all') {
      setUploadStatus({ submitting: false, message: '', error: 'Select a case before uploading evidence.' });
      return;
    }

    try {
      setUploadStatus({ submitting: true, message: '', error: '' });
      const payload = {
        title: newEvidence.title.trim(),
        caseId: selectedCaseId,
        evidenceType: newEvidence.evidenceType.trim(),
        description: newEvidence.description.trim(),
        collectionDate: newEvidence.collectionDate || undefined,
        location: newEvidence.location.trim(),
      };

      if (!payload.title) {
        setUploadStatus({ submitting: false, message: '', error: 'Provide a title for the evidence item.' });
        return;
      }

      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, value);
        }
      });
      if (newEvidenceFile) {
        formData.append('file', newEvidenceFile);
      }
      if (account?._id) {
        formData.append('ownerId', account._id);
      }

      const response = await adminApi.uploadEvidence(formData);
      const created = response.evidence;
      setEvidenceByCase((prev) => ({
        ...prev,
        [selectedCaseId]: [created, ...(prev[selectedCaseId] || [])],
      }));
      setUploadStatus({ submitting: false, message: 'Evidence uploaded successfully.', error: '' });
      setNewEvidence({ title: '', evidenceType: 'digital', description: '', collectionDate: '', location: '' });
      setNewEvidenceFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setShowUploadModal(false);
    } catch (error) {
      setUploadStatus({ submitting: false, message: '', error: error.message || 'Unable to upload evidence.' });
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setNavOpen(false);
  };

  const handleSignOut = () => {
    localStorage.removeItem('bxaiAccount');
    sessionStorage.removeItem('bxaiAccount');
    navigate('/signin');
  };

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text">
        <p className="text-sm font-semibold text-primary">Preparing investigator console…</p>
      </div>
    );
  }

  const overviewCards = [
    {
      label: 'Assigned cases',
      value: summary.assignedCases,
      description: 'Live queue configured by command',
      icon: BriefcaseIcon,
      accent: 'bg-indigo-100 text-indigo-600',
    },
    {
      label: 'Evidence queue',
      value: summary.evidenceQueue,
      description: 'Artifacts awaiting validation',
      icon: ClipboardDocumentListIcon,
      accent: 'bg-sky-100 text-sky-600',
    },
    {
      label: 'Open alerts',
      value: summary.openAlerts,
      description: 'Explainable AI tasks assigned to you',
      icon: BellAlertIcon,
      accent: 'bg-rose-100 text-rose-600',
    },
    {
      label: 'Verified evidence',
      value: metrics.verifiedEvidence,
      description: 'Successfully notarized and validated',
      icon: ShieldCheckIcon,
      accent: 'bg-emerald-100 text-emerald-600',
    },
  ];
  const activityItems = (summary.recentActivity || []).slice(0, 5);
  const recentCases = assignedCases.slice(0, 5);

  const renderOverview = () => (
    <div className="space-y-8">
      <section className="rounded-3xl bg-white p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Welcome</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Welcome back, {firstName}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Review live case metrics, evidence throughput, and recent activity from your BXAI mission control center.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map(({ label, value, description, icon: Icon, accent }) => (
          <article key={label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">{label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
              </div>
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>
                <Icon className="h-6 w-6" />
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500">{description}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Weekly activity</h3>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Last 7 days</span>
          </div>
          <div className="mt-6 space-y-3">
            {activityItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                No activity recorded this week.
              </div>
            ) : (
              activityItems.map((item, index) => (
                <div
                  key={`${item.timestamp || index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{item.description}</p>
                    <p className="text-xs text-slate-500">{item.actor || 'System'}</p>
                  </div>
                  <span className="text-xs text-slate-400">{item.timestamp || '—'}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent cases</h3>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Live queue</span>
          </div>
          <div className="mt-4 space-y-3">
            {recentCases.length === 0 ? (
              <p className="text-sm text-slate-500">No cases have been assigned yet.</p>
            ) : (
              recentCases.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">Case {item.caseNumber}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {item.status?.replace('_', ' ') || 'Open'}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );

  const renderCases = () => (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Assigned cases</h2>
          <p className="text-sm text-slate-500">You can only view and act on cases assigned by command.</p>
        </div>
        <span className="rounded-full bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
          {assignedCases.length} in queue
        </span>
      </header>
      <div className="space-y-4">
        {assignedCases.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            Command hasn’t assigned any cases yet. New taskings will appear here instantly.
          </div>
        ) : (
          assignedCases.map((item) => (
            <article
              key={item._id}
              className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow"
            >
              <div className="flex flex-wrap items-center justify_between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">Case {item.caseNumber}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                  {item.status?.replace('_', ' ')}
                </span>
              </div>
              {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span>Assigned: {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—'}</span>
                <span>Command contact: {item.assignedInvestigatorEmail || '—'}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );

  const renderEvidence = () => (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Evidence vault</h2>
          <p className="text-sm text-slate-500">Browse artifacts across every assigned case or filter by a specific dossier.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(event) => {
              const value = event.target.value;
              setEvidenceState((prev) => ({ ...prev, error: '' }));
              setSelectedCaseId(value);
              setUploadStatus({ submitting: false, message: '', error: '' });
              if (value !== 'all') {
                refreshEvidenceForCase(value);
              }
            }}
            value={selectedCaseId}
          >
            <option value="all">All evidence</option>
            {assignedCases.map((item) => (
              <option key={item._id} value={item._id}>
                {item.title} • {item.caseNumber}
              </option>
            ))}
            {assignedCases.length === 0 && <option value="">No cases assigned</option>}
          </select>
          {selectedCaseId && selectedCaseId !== 'all' && (
            <button
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-primary/30 hover:text-primary"
              onClick={() => refreshEvidenceForCase(selectedCaseId)}
              type="button"
            >
              <ArrowPathIcon className="h-4 w-4" /> Refresh
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-600 shadow">
        <h3 className="text-base font-semibold text-slate-900">Upload new evidence</h3>
        <p className="mt-2 text-xs">Only evidence for cases assigned to you may be uploaded.</p>
        <button
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary/90"
          onClick={() => setShowUploadModal(true)}
          type="button"
        >
          <ArrowUpTrayIcon className="h-4 w-4" /> Add new evidence
        </button>
      </div>

      {assignedCases.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          No cases assigned, so there is no evidence to review.
        </div>
      ) : evidenceState.loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading evidence…</div>
      ) : evidenceState.error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-500">
          {evidenceState.error}
        </div>
      ) : selectedEvidence.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          No artifacts uploaded for this case yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {selectedEvidence.map((item) => {
            const blockchainStatus = item.blockchain || {};
            const ledgerId = blockchainStatus.ledgerId || item.ledgerId;
            const verified = item.verified || (blockchainStatus.verification || {}).verified;
            const hasAnchor = Boolean(ledgerId);
            return (
              <article key={item._id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.evidenceType?.replace('_', ' ')}</p>
                  </div>
                  {verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600">
                      <ShieldCheckIcon className="h-4 w-4" /> Verified
                    </span>
                  ) : hasAnchor ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-600">
                      <CheckCircleIcon className="h-4 w-4" /> Anchored
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-600">
                      <ExclamationTriangleIcon className="h-4 w-4" /> Pending
                    </span>
                  )}
                </div>
                {item.description && <p className="mt-3 text-sm text-slate-600">{item.description}</p>}
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div>
                    <p className="font-semibold text-slate-700">Collected</p>
                    <p>{item.collectionDate ? new Date(item.collectionDate).toLocaleDateString() : '—'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">Location</p>
                    <p>{item.location || '—'}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-xs text-slate-500">
                  <p className="text-slate-400">
                    Created {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed"
                      disabled={evidenceState.loading}
                      onClick={() => handleAnchor(item)}
                      type="button"
                    >
                      <CloudArrowUpIcon className="h-4 w-4" /> Anchor evidence
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 disabled:cursor-not-allowed"
                      disabled={evidenceState.loading}
                      onClick={() => handleVerify(item)}
                      type="button"
                    >
                      <ShieldCheckIcon className="h-4 w-4" /> Verify hash
                    </button>
                    {hasAnchor && ledgerId && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                        <DocumentTextIcon className="h-4 w-4" /> {ledgerId.slice(0, 10)}…
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderBlockchain = () => {
    const connected = chainStatus.connected !== false;
    return (
      <section className="space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Blockchain anchoring</h2>
            <p className="text-sm text-slate-500">Monitor chain connectivity and recent ledger events for your cases.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${
                connected ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {connected ? 'Connected to chain' : 'Offline'}
            </span>
            <button
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-primary/30 hover:text-primary"
              onClick={async () => {
                try {
                  const statusResponse = await adminApi.getBlockchainStatus('investigator');
                  setChainStatus(statusResponse);
                  setUploadStatus({ submitting: false, message: 'Blockchain status refreshed.', error: '' });
                } catch (error) {
                  setUploadStatus({ submitting: false, message: '', error: error.message || 'Unable to refresh status.' });
                }
              }}
              type="button"
            >
              <ArrowPathIcon className="h-4 w-4" /> Refresh status
            </button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Network</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{chainStatus.network || '—'}</p>
            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <p>
                Latest block:
                <span className="ml-1 font-semibold text-slate-900">{chainStatus.latestBlock ?? '—'}</span>
              </p>
              <p>
                Contract:
                <span className="ml-1 font-semibold text-slate-900">
                  {chainStatus.contractAddress ? `${chainStatus.contractAddress.slice(0, 10)}…` : '—'}
                </span>
              </p>
              <p>
                Operator:
                <span className="ml-1 font-semibold text-slate-900">
                  {chainStatus.accountAddress ? `${chainStatus.accountAddress.slice(0, 10)}…` : '—'}
                </span>
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Ledger activity</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{chainStatus.totalAnchored ?? 0}</p>
            <p className="text-xs text-slate-500">Total anchors recorded for your workspace</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow">
          <h3 className="text-base font-semibold text-slate-900">Recent blockchain feed</h3>
          <p className="mt-1 text-xs text-slate-500">Last 10 notarization events associated with your evidence.</p>
          <div className="mt-4 space-y-3">
            {blockchainFeed.length === 0 ? (
              <p className="text-sm text-white/60">No blockchain activity recorded yet.</p>
            ) : (
              blockchainFeed.map((entry, index) => (
                <div
                  key={`${entry.transaction_hash || entry.ledger_id || index}`}
                  className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {entry.action || entry.verification_status || 'Event'}
                    </span>
                    <span className="text-slate-400">
                      {entry.timestamp ? new Date(entry.timestamp * 1000).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <span className="truncate text-slate-500">
                      Ledger ID: {entry.ledger_id ? `${entry.ledger_id.slice(0, 14)}…` : '—'}
                    </span>
                    <span className="truncate text-slate-500">
                      Tx: {entry.transaction_hash ? `${entry.transaction_hash.slice(0, 14)}…` : '—'}
                    </span>
                    <span className="text-slate-500">Block: {entry.block_number ?? '—'}</span>
                    <span className="text-slate-500">Network: {entry.network || chainStatus.network || '—'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderXai = () => {
    const evidenceList = availableForXai;

    return (
      <section className="space-y-6">
        <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Explainable AI insights</h2>
            <p className="text-sm text-slate-500">
              Run explainability on any artifact assigned to you and review SHAP, LIME, and anomaly findings in real time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm">
              <input
                checked={xaiAnchorNext}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                onChange={(event) => setXaiAnchorNext(event.target.checked)}
                type="checkbox"
              />
              Auto-anchor new runs
            </label>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm">
              Case filter
              <select
                className="rounded-full border border-slate-200 bg-background px-3 py-1 text-xs text-slate-700 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setXaiSelectedCaseId(event.target.value)}
                value={xaiSelectedCaseId}
              >
                <option value="all">All evidence</option>
                {assignedCases.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.title} • {item.caseNumber}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed"
              disabled={xaiSyncing || evidenceList.length === 0}
              onClick={handleSyncAllXai}
              type="button"
            >
              {xaiSyncing ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 animate-spin" /> Syncing…
                </>
              ) : (
                <>
                  <ArrowPathIcon className="h-4 w-4" /> Refresh all results
                </>
              )}
            </button>
          </div>
        </header>

        {xaiStatus.message && (
          <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4 text-sm font-semibold text-primary">
            {xaiStatus.message}
          </div>
        )}
        {xaiStatus.error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-600">
            {xaiStatus.error}
          </div>
        )}

        {assignedCases.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            Command hasn’t assigned any cases yet. XAI tooling unlocks as soon as evidence is in your queue.
          </div>
        ) : evidenceList.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            No evidence items match this filter. Select another case to run explainability.
          </div>
        ) : (
          <div className="space-y-6">
            {evidenceList.map((item, index) => {
              const result = xaiResults[item._id];
              const loading = Boolean(xaiLoadingIds[item._id]);
              const fetching = Boolean(xaiFetchingIds[item._id]);
              const actions = (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
                    disabled={loading}
                    onClick={() => handleAnalyzeEvidence(item)}
                    type="button"
                  >
                    {loading ? (
                      <>
                        <SparklesIcon className="h-4 w-4 animate-spin" /> Running…
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-4 w-4" /> Run analysis
                      </>
                    )}
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:border-primary/10 disabled:text-primary/30"
                    disabled={fetching}
                    onClick={() => handleFetchXai(item._id)}
                    type="button"
                  >
                    {fetching ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" /> Refreshing…
                      </>
                    ) : (
                      <>
                        <ArrowPathIcon className="h-4 w-4" /> Refresh result
                      </>
                    )}
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                    disabled={fetching || !result}
                    onClick={() => handleDownloadReport(item)}
                    type="button"
                  >
                    {fetching ? (
                      <>
                        <ArrowDownTrayIcon className="h-4 w-4 animate-spin" /> Preparing…
                      </>
                    ) : (
                      <>
                        <ArrowDownTrayIcon className="h-4 w-4" /> Download report
                      </>
                    )}
                  </button>
                </div>
              );

              if (result) {
                const resultKey = result.xai_id || `${item._id}-result`;
                return (
                  <XAIResultCard
                    key={resultKey}
                    actions={actions}
                    result={result}
                    title={item.title || `Evidence ${item._id}`}
                  />
                );
              }

              return (
                <article
                  key={`${item._id || index}-pending`}
                  className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow"
                >
                  <header className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.title || `Evidence ${item._id}`}</p>
                      <p className="text-xs text-slate-500">{item.evidenceType?.replace('_', ' ') || 'Artifact'}</p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-600">
                      <SparklesIcon className="h-4 w-4" /> Awaiting analysis
                    </span>
                  </header>
                  {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
                  <div className="text-xs text-slate-500">
                    <p>Collected: {item.collectionDate ? new Date(item.collectionDate).toLocaleDateString() : '—'}</p>
                    <p>Location: {item.location || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-4">
                    <div className="text-xs font-semibold text-primary">
                      Run explainable analysis to unlock SHAP and LIME summaries for this artifact.
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {actions}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'cases':
        return renderCases();
      case 'evidence':
        return renderEvidence();
      case 'blockchain':
        return renderBlockchain();
      case 'xai':
        return renderXai();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-900/20 bg-slate-950 text-slate-200 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <img alt="BXAI logo" className="h-10 w-10" src={logo} />
            <div>
              <p className="text-sm font-semibold text-white">BXAI Command</p>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Forensics ops center</p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === id
                    ? 'bg-white text-slate-900 shadow'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
                onClick={() => handleTabChange(id)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <div className="text-right text-xs">
              <p className="font-semibold text-white">{account.name}</p>
              <p className="text-slate-400">{account.email}</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
              onClick={handleSignOut}
              type="button"
            >
              <ArrowLeftOnRectangleIcon className="h-4 w-4" /> Sign out
            </button>
          </div>

          <button
            className="inline-flex items-center justify-center rounded-full border border-white/20 p-2 text-white md:hidden"
            onClick={() => setNavOpen((previous) => !previous)}
            type="button"
          >
            {navOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
          </button>
        </div>

        <div
          className={`border-t border-white/10 bg-slate-900/95 px-4 py-4 md:hidden ${
            navOpen ? 'block' : 'hidden'
          }`}
        >
          <div className="flex flex-col gap-3">
            <nav className="grid gap-2">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    activeTab === id
                      ? 'bg-white text-slate-900 shadow'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                  onClick={() => {
                    handleTabChange(id);
                    setNavOpen(false);
                  }}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </nav>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
              <p className="font-semibold text-white">{account.name}</p>
              <p className="text-slate-400">{account.email}</p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
              onClick={handleSignOut}
              type="button"
            >
              <ArrowLeftOnRectangleIcon className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-white/0 bg-transparent sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">BXAI Forensics Console</p>
            <h2 className="text-xl font-semibold text-slate-900">Secure mission control surface</h2>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-500 shadow">
            <p className="font-semibold text-slate-600">Mission tip</p>
            <p>Keep anchoring validated evidence to surface ledger receipts and investigator-grade provenance.</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          {renderContent()}
        </div>
      </main>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-10">
          <div className="flex w-full max-w-3xl flex-col rounded-3xl bg-white p-8 shadow-2xl max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-primary">Upload evidence</h2>
                <p className="text-xs text-text/60">Only items tied to your assigned cases can be submitted.</p>
              </div>
              <button
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/10"
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadStatus({ submitting: false, message: '', error: '' });
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-[1.25fr,1fr]">
              <form className="space-y-4" onSubmit={handleEvidenceSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-semibold text-text/60">
                    Title
                    <input
                      className="rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(event) => setNewEvidence((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Case artifact name"
                      value={newEvidence.title}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold text-text/60">
                    Case
                    <select
                      className="rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(event) => setSelectedCaseId(event.target.value)}
                      value={selectedCaseId}
                    >
                      <option value="">Select case</option>
                      {assignedCases.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.title} • {item.caseNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold text-text/60">
                    Evidence type
                    <select
                      className="rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(event) => setNewEvidence((prev) => ({ ...prev, evidenceType: event.target.value }))}
                      value={newEvidence.evidenceType}
                    >
                      <option value="digital">Digital</option>
                      <option value="physical">Physical</option>
                      <option value="audio">Audio</option>
                      <option value="video">Video</option>
                      <option value="documentary">Documentary</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold text-text/60">
                    Collection date
                    <input
                      className="rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(event) => setNewEvidence((prev) => ({ ...prev, collectionDate: event.target.value }))}
                      placeholder="dd-mm-yyyy"
                      type="date"
                      value={newEvidence.collectionDate}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold text-text/60 md:col-span-2">
                    Description
                    <textarea
                      className="min-h-[110px] rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(event) => setNewEvidence((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Summarize the artifact and relevant context"
                      value={newEvidence.description}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold text-text/60 md:col-span-2">
                    Location
                    <input
                      className="rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      onChange={(event) => setNewEvidence((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Forensics lab, locker, etc."
                      value={newEvidence.location}
                    />
                  </label>
                </div>

                {uploadStatus.error && (
                  <p className="text-xs font-semibold text-rose-500">{uploadStatus.error}</p>
                )}
                {uploadStatus.message && (
                  <p className="text-xs font-semibold text-emerald-600">{uploadStatus.message}</p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/10"
                    onClick={() => setShowUploadModal(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50"
                    disabled={uploadStatus.submitting || !selectedCaseId || !newEvidence.title.trim()}
                    type="submit"
                  >
                    {uploadStatus.submitting ? 'Uploading…' : 'Upload evidence'}
                  </button>
                </div>
              </form>

              <div className="flex flex-col justify-between rounded-3xl border border-primary/10 bg-background p-6">
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-white p-6 text-center">
                  <ArrowUpTrayIcon className="h-10 w-10 text-primary/70" />
                  <p className="mt-3 text-sm font-semibold text-primary">Drag & drop evidence file</p>
                  <p className="mt-1 text-xs text-text/60">Documents, images, archives and more</p>
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary/90">
                    Browse device
                    <input
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        setNewEvidenceFile(file || null);
                      }}
                      ref={fileInputRef}
                      type="file"
                    />
                  </label>
                  {newEvidenceFile && (
                    <p className="mt-3 text-xs font-semibold text-primary">
                      Selected: {newEvidenceFile.name}
                    </p>
                  )}
                </div>

                <div className="mt-6 rounded-2xl bg-white/60 p-4 text-xs text-text/60">
                  <p className="font-semibold text-primary">Tips</p>
                  <ul className="mt-2 space-y-2">
                    <li>Large files may take a moment to hash before anchoring.</li>
                    <li>You can still create evidence without a file; attach it later if needed.</li>
                    <li>The SHA-256 hash is computed server-side for tamper proofing.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvestigatorDashboard;
