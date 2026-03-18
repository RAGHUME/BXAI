import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  CubeTransparentIcon,
  ArrowUpTrayIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/admin';
import { sha256Hex } from '../../utils/hash';

const readableFileSize = (bytes) => {
  if (!bytes && bytes !== 0) {
    return '—';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const tagClass = (type) => {
  switch (type) {
    case 'document':
      return 'bg-emerald-100 text-emerald-600';
    case 'digital':
      return 'bg-sky-100 text-sky-600';
    case 'physical':
      return 'bg-amber-100 text-amber-600';
    default:
      return 'bg-primary/10 text-primary';
  }
};

const aiBadge = (state) => {
  switch (state) {
    default:
      return 'bg-slate-100 text-slate-500';
  }
};

const Evidence = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [caseFilter, setCaseFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cases, setCases] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [blockchainStatus, setBlockchainStatus] = useState({});
  const [hashingIds, setHashingIds] = useState({});
  const [verifyingIds, setVerifyingIds] = useState({});
  const [fetchingIds, setFetchingIds] = useState({});
  const [runningXaiIds, setRunningXaiIds] = useState({});
  const [form, setForm] = useState({
    title: '',
    caseId: '',
    evidenceType: 'document',
    description: '',
    collectionDate: '',
    location: '',
  });
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [casesResponse, evidenceResponse] = await Promise.all([
          adminApi.listCases(),
          adminApi.listEvidence(),
        ]);
        setCases(casesResponse.cases || []);
        setEvidence(evidenceResponse.evidence || []);
        setError('');
        setInfo('');
      } catch (err) {
        setError(err.message || 'Unable to load evidence');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const caseOptions = useMemo(() => [{ _id: 'all', title: 'All Cases' }, ...(cases || [])], [cases]);
  const typeOptions = ['all', 'document', 'digital', 'physical', 'audio', 'video'];

  const filteredEvidence = useMemo(() => {
    return (evidence || []).filter((item) => {
      const matchSearch = item.title?.toLowerCase().includes(search.toLowerCase().trim());
      const matchCase = caseFilter === 'all' || item.caseId === caseFilter;
      const matchType = typeFilter === 'all' || item.evidenceType === typeFilter;
      return matchSearch && matchCase && matchType;
    });
  }, [evidence, search, caseFilter, typeFilter]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateEvidence = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      let response;
      if (file) {
        const formData = new FormData();
        formData.append('title', form.title);
        formData.append('caseId', form.caseId);
        formData.append('evidenceType', form.evidenceType);
        formData.append('description', form.description);
        formData.append('collectionDate', form.collectionDate);
        formData.append('location', form.location);
        formData.append('file', file);
        response = await adminApi.uploadEvidence(formData);
      } else {
        const payload = {
          title: form.title,
          caseId: form.caseId,
          evidenceType: form.evidenceType,
          description: form.description,
          collectionDate: form.collectionDate,
          location: form.location,
        };
        response = await adminApi.createEvidence(payload);
      }
      setEvidence((prev) => [response.evidence, ...prev]);
      setShowModal(false);
      setForm({
        title: '',
        caseId: '',
        evidenceType: 'document',
        description: '',
        collectionDate: '',
        location: '',
      });
      setFile(null);
      setDragActive(false);
      setInfo('Evidence saved successfully. You can now anchor it to the blockchain.');
    } catch (err) {
      setError(err.message || 'Unable to upload evidence');
    } finally {
      setCreating(false);
    }
  };

  const handleFileChange = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      setFile(null);
      return;
    }
    setFile(files[0]);
    setError('');
  };

  const onDragEnter = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }, []);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer?.files?.length) {
      setFile(event.dataTransfer.files[0]);
    }
  }, []);

  const triggerDownload = (blob, filename) => {
    if (!blob || typeof window === 'undefined') {
      return;
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadEvidenceReport = async () => {
    try {
      setDownloadingReport(true);
      setError('');
      setInfo('');
      const blob = await adminApi.downloadEvidenceReport();
      triggerDownload(blob, 'evidence-report.pdf');
      setInfo('Evidence report downloaded');
    } catch (err) {
      setError(err.message || 'Unable to download evidence report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const adminRole = 'admin';
  const investigatorRole = 'investigator';
  const uploaderAddress = import.meta.env.VITE_ADMIN_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';

  const handleAnchorEvidence = useCallback(
    async (item) => {
      try {
        setHashingIds((prev) => ({ ...prev, [item._id]: true }));
        setError('');
        setInfo('');

        const payloadInput = JSON.stringify({
          id: item._id,
          title: item.title,
          caseId: item.caseId,
          description: item.description,
          collectionDate: item.collectionDate,
          location: item.location,
        });
        const hashHex = await sha256Hex(payloadInput);

        const response = await adminApi.anchorEvidence(
          {
            evidence_id: item._id,
            file_hash: hashHex,
            description: item.description || item.title,
            uploader_address: uploaderAddress,
          },
          investigatorRole
        );

        const { record, summary, verification, message, reanchored } = response || {};

        setBlockchainStatus((prev) => ({
          ...prev,
          [item._id]: {
            record,
            summary,
            verification,
            reanchored,
          },
        }));

        if (verification?.verified === false) {
          setError(`Integrity check failed for “${item.title}”. On-chain hash mismatch detected.`);
        } else {
          const txFragment = record?.transaction_hash?.slice(0, 10) || summary?.transactionHash?.slice(0, 10) || '';
          const baseMessage = message || (reanchored ? 'Evidence re-anchored successfully.' : 'Evidence anchored successfully.');
          setInfo(
            txFragment
              ? `${baseMessage} (tx ${txFragment}…)`
              : baseMessage
          );
        }
      } catch (err) {
        setError(err.message || 'Failed to anchor evidence');
      } finally {
        setHashingIds((prev) => ({ ...prev, [item._id]: false }));
      }
    },
    [investigatorRole, uploaderAddress]
  );

  const handleVerifyEvidence = useCallback(
    async (item) => {
      try {
        setVerifyingIds((prev) => ({ ...prev, [item._id]: true }));
        setError('');
        setInfo('');

        const payloadInput = JSON.stringify({
          id: item._id,
          title: item.title,
          caseId: item.caseId,
          description: item.description,
          collectionDate: item.collectionDate,
          location: item.location,
        });
        const hashHex = await sha256Hex(payloadInput);

        const response = await adminApi.verifyEvidence(item._id, hashHex, adminRole);
        setBlockchainStatus((prev) => ({ ...prev, [item._id]: { ...(prev[item._id] || {}), verification: response.verification } }));
        if (response.verification.verified) {
          setInfo(`Evidence “${item.title}” verified successfully.`);
        } else {
          setError(`Evidence “${item.title}” failed verification. Hash mismatch detected.`);
        }
      } catch (err) {
        setError(err.message || 'Failed to verify evidence');
      } finally {
        setVerifyingIds((prev) => ({ ...prev, [item._id]: false }));
      }
    },
    [adminRole]
  );

  const handleRunXaiAnalysis = useCallback(
    async (item) => {
      try {
        setRunningXaiIds((prev) => ({ ...prev, [item._id]: true }));
        setError('');
        setInfo('');

        await adminApi.runXaiAnalysis(item._id, 'investigator');
        setInfo(`XAI analysis triggered for “${item.title}”. Refresh the insights page after processing.`);
      } catch (err) {
        setError(err.message || 'Failed to run XAI analysis');
      } finally {
        setRunningXaiIds((prev) => ({ ...prev, [item._id]: false }));
      }
    },
    []
  );

  const handleFetchOnChain = useCallback(
    async (item) => {
      try {
        setFetchingIds((prev) => ({ ...prev, [item._id]: true }));
        setError('');
        setInfo('');

        const response = await adminApi.getOnChainRecord(item._id, adminRole);
        if (response?.record) {
          setBlockchainStatus((prev) => ({
            ...prev,
            [item._id]: {
              ...(prev[item._id] || {}),
              onchain: response.record,
            },
          }));
          setInfo(`Fetched on-chain record for “${item.title}”.`);
        }
      } catch (err) {
        setError(err.message || 'Unable to fetch on-chain record');
      } finally {
        setFetchingIds((prev) => ({ ...prev, [item._id]: false }));
      }
    },
    [adminRole]
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Evidence</h1>
          <p className="mt-2 text-sm text-text/60">Modern vault view for digital and physical evidence snapshots.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDownloadEvidenceReport}
            type="button"
            disabled={downloadingReport}
          >
            <DocumentArrowDownIcon className={`h-5 w-5 ${downloadingReport ? 'animate-pulse' : ''}`} />
            {downloadingReport ? 'Preparing report…' : 'Download evidence PDF'}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-primary/90"
            onClick={() => setShowModal(true)}
            type="button"
          >
            <PlusIcon className="h-5 w-5" />
            Upload Evidence
          </button>
        </div>
      </header>

      <div className="rounded-3xl border border-primary/10 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-text/40" />
            <input
              className="w-full rounded-2xl border border-primary/10 bg-background px-10 py-3 text-sm text-text transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search evidence..."
              type="search"
              value={search}
            />
          </label>
          <div className="flex items-center gap-2">
            <FunnelIcon className="hidden h-5 w-5 text-text/40 md:block" />
            <select
              className="flex-1 rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setCaseFilter(event.target.value)}
              value={caseFilter}
            >
              {caseOptions.map((option) => (
                <option key={option._id} value={option._id}>
                  {option.title}
                </option>
              ))}
            </select>
          </div>
          <select
            className="rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setTypeFilter(event.target.value)}
            value={typeFilter}
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All Types' : option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-rose-500">{error}</p>}
      {info && !error && <p className="text-sm font-semibold text-emerald-600">{info}</p>}

      {loading ? (
        <div className="rounded-3xl border border-primary/10 bg-white p-10 text-center text-sm text-text/60 shadow-sm">
          Loading evidence vault…
        </div>
      ) : filteredEvidence.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary/15 bg-white p-10 text-center text-sm text-text/60 shadow-sm">
          No evidence records yet. Upload an item to populate the vault.
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvidence.map((item) => {
            const collectedDate = item.collectionDate ? new Date(item.collectionDate).toLocaleDateString() : '—';
            const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString() : '—';

            const statusEntry = blockchainStatus[item._id] || {};
            const verificationResult = statusEntry.verification || item.blockchain?.verification;
            const anchoredSummary = statusEntry.summary || item.blockchain;

            const isAnchoring = hashingIds[item._id];
            const isVerifying = verifyingIds[item._id];
            const isFetching = fetchingIds[item._id];
            const isRunningXai = runningXaiIds[item._id];

            const anchored = Boolean(anchoredSummary?.transactionHash || anchoredSummary?.historyCount);
            const verified = anchored ? verificationResult?.verified === true || item.verified : item.verified;
            const verificationFailed = anchored ? verificationResult?.verified === false : false;

            const badgeClass = anchored
              ? verified
                ? 'bg-emerald-100 text-emerald-600'
                : verificationFailed
                ? 'bg-rose-100 text-rose-600'
                : 'bg-amber-100 text-amber-600'
              : 'bg-slate-100 text-slate-500';

            const badgeLabel = anchored
              ? verified
                ? 'Verified'
                : verificationFailed
                ? 'Tamper suspected'
                : 'Pending verification'
              : 'Not anchored';

            return (
              <article
                key={item._id}
                className="flex h-full flex-col rounded-3xl border border-primary/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-primary">{item.title}</h2>
                    <p className="text-xs text-text/50">{item.caseTitle || 'Unassigned case'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${tagClass(item.evidenceType)}`}>
                    {item.evidenceType.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-4 text-sm text-text/70">{item.description || 'No description provided.'}</p>
                <div className="mt-6 grid grid-cols-2 gap-4 text-xs text-text/50">
                  <div className="rounded-2xl border border-primary/10 bg-background/70 p-3">
                    <p className="font-semibold text-primary">Collected</p>
                    <p className="mt-1 text-sm text-text/70">{collectedDate}</p>
                  </div>
                  <div className="rounded-2xl border border-primary/10 bg-background/70 p-3">
                    <p className="font-semibold text-primary">Location</p>
                    <p className="mt-1 text-sm text-text/70">{item.location || 'Not specified'}</p>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between text-xs text-text/50">
                  <span>Created {createdAt}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>{badgeLabel}</span>
                </div>

                <div className="mt-6 space-y-3 rounded-3xl border border-primary/10 bg-background/60 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-text/50">
                    <CubeTransparentIcon className="h-4 w-4" /> Blockchain controls
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-primary/10 disabled:text-primary/40"
                      onClick={() =>
                        navigate(`/admin/xai?caseId=${encodeURIComponent(item.caseId)}&evidenceId=${encodeURIComponent(item._id)}`)
                      }
                      type="button"
                    >
                      View XAI insights
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
                      disabled={isAnchoring}
                      onClick={() => handleAnchorEvidence(item)}
                      type="button"
                    >
                      {isAnchoring ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" /> Anchoring…
                        </>
                      ) : (
                        <>
                          <CubeTransparentIcon className="h-4 w-4" /> Anchor evidence
                        </>
                      )}
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-primary/10 disabled:text-primary/40"
                      disabled={isRunningXai}
                      onClick={() => handleRunXaiAnalysis(item)}
                      type="button"
                    >
                      {isRunningXai ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" /> Running XAI…
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="h-4 w-4" /> Run XAI analysis
                        </>
                      )}
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-primary/20 disabled:text-primary/40"
                      disabled={isVerifying || !anchored}
                      onClick={() => handleVerifyEvidence(item)}
                      type="button"
                    >
                      {isVerifying ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" /> Verifying…
                        </>
                      ) : (
                        <>
                          <ShieldCheckIcon className="h-4 w-4" /> Verify integrity
                        </>
                      )}
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-text/70 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:border-primary/10 disabled:text-text/30"
                      disabled={isFetching || !anchored}
                      onClick={() => handleFetchOnChain(item)}
                      type="button"
                    >
                      {isFetching ? (
                        <>
                          <ArrowPathIcon className="h-4 w-4 animate-spin" /> Syncing…
                        </>
                      ) : (
                        <>
                          <ArrowPathIcon className="h-4 w-4" /> Fetch on-chain
                        </>
                      )}
                    </button>
                  </div>

                  {anchoredSummary && (
                    <div className="rounded-2xl border border-primary/10 bg-white p-3 text-xs text-text/60">
                      <p className="font-semibold text-primary">Ledger summary</p>
                      <p className="mt-1 break-all">Ledger ID: {anchoredSummary.ledgerId || item.ledgerId || '—'}</p>
                      <p className="break-all">Tx: {anchoredSummary.transactionHash || '—'}</p>
                      <p>Network: {anchoredSummary.network || '—'}</p>
                      <p>Last update: {anchoredSummary.timestamp || '—'}</p>
                    </div>
                  )}

                  {verificationResult && (
                    <div
                      className={`rounded-2xl border p-3 text-xs ${
                        verificationResult.verified
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-600'
                      }`}
                    >
                      <p className="font-semibold">Verification result</p>
                      <p className="mt-1">Verified: {verificationResult.verified ? 'Yes' : 'No'}</p>
                      <p className="break-all">On-chain hash: {verificationResult.onchain_hash}</p>
                      <p className="break-all">Local hash: {verificationResult.local_hash}</p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-10">
          <div className="flex w-full max-w-3xl flex-col rounded-3xl bg-white p-8 shadow-2xl max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-primary">Upload evidence</h2>
              </div>
              <button
                className="rounded-full border border-primary/10 bg-background px-3 py-1 text-xs font-semibold text-text/60 transition hover:border-primary/30 hover:text-primary"
                onClick={() => setShowModal(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <form className="mt-6 flex h-full flex-col gap-6" onSubmit={handleCreateEvidence}>
              <div className="grid flex-1 gap-6 overflow-y-auto pr-1 lg:grid-cols-2">
                <div className="space-y-5">
                  <label className="text-sm font-semibold text-primary">
                    Title
                    <input
                      className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      name="title"
                      onChange={handleChange}
                      placeholder="Case artifact name"
                      required
                      type="text"
                      value={form.title}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-primary">
                      Case
                      <select
                        className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        name="caseId"
                        onChange={handleChange}
                        required
                        value={form.caseId}
                      >
                        <option value="" disabled>
                          Select case
                        </option>
                        {cases.map((item) => (
                          <option key={item._id} value={item._id}>
                            {item.title} ({item.caseNumber})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-primary">
                      Evidence type
                      <select
                        className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        name="evidenceType"
                        onChange={handleChange}
                        value={form.evidenceType}
                      >
                        <option value="document">Document</option>
                        <option value="digital">Digital</option>
                        <option value="physical">Physical</option>
                        <option value="audio">Audio</option>
                        <option value="video">Video</option>
                      </select>
                    </label>
                  </div>
                  <label className="text-sm font-semibold text-primary">
                    Description
                    <textarea
                      className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      name="description"
                      onChange={handleChange}
                      placeholder="Summarize the artifact and relevant context"
                      rows={4}
                      value={form.description}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-primary">
                      Collection date
                      <input
                        className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        max={todayIso}
                        name="collectionDate"
                        onChange={handleChange}
                        type="date"
                        value={form.collectionDate}
                      />
                    </label>
                    <label className="text-sm font-semibold text-primary">
                      Location
                      <input
                        className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        name="location"
                        onChange={handleChange}
                        placeholder="Forensics lab, locker, etc."
                        type="text"
                        value={form.location}
                      />
                    </label>
                  </div>
                </div>
                <div className="space-y-5">
                  <div
                    className={`relative flex min-h-[220px] flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
                      dragActive
                        ? 'border-primary bg-primary/5'
                        : 'border-primary/20 bg-background hover:border-primary/40'
                    }`}
                    onDragEnter={onDragEnter}
                    onDragLeave={onDragLeave}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                  >
                    <input
                      accept="*/*"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={handleFileChange}
                      type="file"
                    />
                    {file ? (
                      <div className="flex flex-col items-center gap-3 text-sm text-text/70">
                        <PhotoIcon className="h-12 w-12 text-primary" />
                        <div>
                          <p className="font-semibold text-primary">{file.name}</p>
                          <p className="text-xs text-text/50">Size: {readableFileSize(file.size)}</p>
                        </div>
                        <button
                          className="text-xs font-semibold text-rose-500 transition hover:text-rose-600"
                          onClick={() => setFile(null)}
                          type="button"
                        >
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-sm text-text/60">
                        <ArrowUpTrayIcon className="h-12 w-12 text-primary" />
                        <div>
                          <p className="font-semibold text-primary">Drag & drop evidence file</p>
                          <p className="text-xs text-text/40">or click to browse your device</p>
                        </div>
                        <p className="text-xs text-text/40">Documents, images, archives and more</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-primary/10 bg-white p-4 text-left text-xs text-text/60 shadow-sm">
                    <p className="text-sm font-semibold text-primary">Tips</p>
                    <ul className="space-y-2">
                      <li>• Large files may take a moment to hash before anchoring.</li>
                      <li>• You can still create evidence without a file; attach it later if needed.</li>
                      <li>• The SHA-256 hash is computed server-side for tamper proofing.</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-primary/10 pt-4">
                <button
                  className="rounded-full border border-primary/10 bg-white px-5 py-2 text-sm font-semibold text-text/70 transition hover:border-primary/30 hover:text-primary"
                  onClick={() => {
                    setShowModal(false);
                    setFile(null);
                    setDragActive(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-primary/90"
                  disabled={creating}
                  type="submit"
                >
                  {creating ? 'Uploading…' : 'Upload evidence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Evidence;
