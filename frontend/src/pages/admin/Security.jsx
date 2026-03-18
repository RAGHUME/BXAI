import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/admin';

const formatTimestamp = (value) => {
  if (!value) {
    return '—';
  }

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  } catch (error) {
    return value;
  }
};

const actionBadge = (action = '') => {
  const normalized = action.toLowerCase();

  if (normalized.includes('verify') || normalized === 'anchored') {
    return 'bg-emerald-100 text-emerald-600';
  }
  if (normalized.includes('transfer')) {
    return 'bg-sky-100 text-sky-600';
  }
  if (normalized.includes('remove')) {
    return 'bg-rose-100 text-rose-600';
  }
  return 'bg-indigo-100 text-indigo-600';
};

const ChainOfCustody = () => {
  const [payload, setPayload] = useState({ case: null, evidence: [], timeline: [], filters: {}, count: 0 });
  const [status, setStatus] = useState({ loading: true, error: '' });
  const [activeCase, setActiveCase] = useState('');
  const [activeEvidence, setActiveEvidence] = useState('');
  const [downloading, setDownloading] = useState('');

  const fetchChain = useCallback(
    async ({ caseId, evidenceId } = {}) => {
      try {
        setStatus({ loading: true, error: '' });
        const response = await adminApi.getChainOfCustody({ caseId, evidenceId });
        setPayload(response);
        setActiveCase(response.filters?.caseId || '');
        setActiveEvidence(response.filters?.evidenceId || '');
        setStatus({ loading: false, error: '' });
      } catch (error) {
        setStatus({ loading: false, error: error.message || 'Unable to load chain of custody timeline' });
      }
    },
    []
  );

  useEffect(() => {
    fetchChain();
  }, [fetchChain]);

  const caseOptions = useMemo(() => {
    const map = new Map();
    (payload.evidence || []).forEach((item) => {
      if (!item.caseId) {
        return;
      }
      const label = item.caseTitle || `Case ${item.caseId.slice(0, 6)}…`;
      if (!map.has(item.caseId)) {
        map.set(item.caseId, { id: item.caseId, label });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [payload.evidence]);

  const evidenceOptions = useMemo(() => {
    let list = payload.evidence || [];
    if (activeCase) {
      list = list.filter((item) => item.caseId === activeCase);
    }
    return list;
  }, [payload.evidence, activeCase]);

  const timelineItems = useMemo(() => payload.timeline || [], [payload.timeline]);

  const handleRefresh = useCallback(() => {
    fetchChain({ caseId: activeCase || undefined, evidenceId: activeEvidence || undefined });
  }, [fetchChain, activeCase, activeEvidence]);

  const handleCaseChange = useCallback(
    (event) => {
      const value = event.target.value;
      setActiveCase(value);
      setActiveEvidence('');
      fetchChain(value ? { caseId: value } : {});
    },
    [fetchChain]
  );

  const handleEvidenceChange = useCallback(
    (event) => {
      const value = event.target.value;
      setActiveEvidence(value);
      if (!value) {
        fetchChain({ caseId: activeCase || undefined });
        return;
      }

      const selected = (payload.evidence || []).find((item) => item._id === value);
      const nextCaseId = selected?.caseId || activeCase;
      setActiveCase(nextCaseId || '');
      fetchChain({ caseId: nextCaseId || undefined, evidenceId: value });
    },
    [fetchChain, activeCase, payload.evidence]
  );

  const triggerDownload = (blob, filename) => {
    if (!blob) {
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

  const handleDownload = useCallback(
    async (evidenceId, filenameHint) => {
      if (!evidenceId) {
        return;
      }

      try {
        setDownloading(evidenceId);
        const blob = await adminApi.downloadChainOfCustody(evidenceId);
        const safeName = filenameHint ? filenameHint.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
        const filename = safeName ? `chain-of-custody-${safeName}.pdf` : `chain-of-custody-${evidenceId}.pdf`;
        triggerDownload(blob, filename);
      } catch (error) {
        setStatus((previous) => ({ ...previous, error: error.message || 'Unable to download chain of custody report' }));
      } finally {
        setDownloading('');
      }
    },
    []
  );

  const activeCaseSummary = payload.case;
  const selectedEvidence = (payload.evidence || []).find((item) => item._id === activeEvidence);
  const initialLoading = status.loading && timelineItems.length === 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Evidence provenance</p>
          <h1 className="mt-2 text-3xl font-semibold text-primary">Chain of custody timeline</h1>
          <p className="mt-3 max-w-2xl text-sm text-text/60">
            Inspect every custody event recorded for your digital evidence. Filter by case or evidence item, monitor
            transfers, and export notarised PDF reports for compliance reviews.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleRefresh}
            type="button"
            disabled={status.loading}
          >
            <ArrowPathIcon className={`h-5 w-5 ${status.loading ? 'animate-spin' : ''}`} />
            Refresh timeline
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => handleDownload(selectedEvidence?._id, selectedEvidence?.title || selectedEvidence?.caseTitle)}
            type="button"
            disabled={!selectedEvidence || downloading === selectedEvidence._id}
          >
            <DocumentArrowDownIcon className={`h-5 w-5 ${downloading && selectedEvidence ? 'animate-pulse' : ''}`} />
            {downloading && selectedEvidence ? 'Preparing PDF…' : 'Download chain PDF'}
          </button>
        </div>
      </header>

      <section className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-semibold text-primary">
              <AdjustmentsHorizontalIcon className="h-5 w-5" />
              Filters
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-text/60">
                <span className="font-semibold text-text/80">Case</span>
                <select
                  className="w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={handleCaseChange}
                  value={activeCase}
                >
                  <option value="">All cases</option>
                  {caseOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-text/60">
                <span className="font-semibold text-text/80">Evidence</span>
                <select
                  className="w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={handleEvidenceChange}
                  value={activeEvidence}
                  disabled={initialLoading || evidenceOptions.length === 0}
                >
                  <option value="">{activeCase ? 'All evidence in case' : 'All evidence'}</option>
                  {evidenceOptions.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title || 'Untitled evidence'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/10 bg-background/60 px-4 py-3 text-xs text-text/60">
            <div>
              <p className="text-2xl font-semibold text-primary">{payload.count || 0}</p>
              <p>Timeline events</p>
            </div>
            <div className="hidden h-10 w-px bg-primary/10 sm:block" />
            <div>
              <p className="text-2xl font-semibold text-primary">{payload.evidence?.length || 0}</p>
              <p>Evidence items</p>
            </div>
          </div>
        </div>
        {status.error && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {status.error}
          </div>
        )}
      </section>

      {initialLoading ? (
        <div className="rounded-3xl border border-primary/10 bg-white p-10 text-center text-sm text-text/60 shadow-sm">
          Loading custody timeline…
        </div>
      ) : (
        <div className="space-y-8">
          {activeCaseSummary && (
            <section className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-primary">Case summary</h2>
                  <p className="text-sm text-text/60">Details for the case associated with the current timeline.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
                  <ClockIcon className="h-4 w-4" /> Last updated {formatTimestamp(activeCaseSummary.updatedAt) || '—'}
                </span>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-primary/10 bg-background/60 p-4 text-sm text-text/70">
                  <p className="text-xs font-semibold text-text/50">Title</p>
                  <p className="mt-1 font-semibold text-primary">{activeCaseSummary.title || 'Untitled case'}</p>
                </div>
                <div className="rounded-2xl border border-primary/10 bg-background/60 p-4 text-sm text-text/70">
                  <p className="text-xs font-semibold text-text/50">Case number</p>
                  <p className="mt-1 font-semibold text-primary">{activeCaseSummary.caseNumber || '—'}</p>
                </div>
                <div className="rounded-2xl border border-primary/10 bg-background/60 p-4 text-sm text-text/70">
                  <p className="text-xs font-semibold text-text/50">Status</p>
                  <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-primary">
                    <ShieldCheckIcon className="h-4 w-4" />
                    {(activeCaseSummary.status || 'unknown').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="rounded-2xl border border-primary/10 bg-background/60 p-4 text-sm text-text/70">
                  <p className="text-xs font-semibold text-text/50">Stakeholders</p>
                  <p className="mt-1 font-semibold text-primary">{activeCaseSummary.stakeholderCount ?? 0}</p>
                </div>
              </div>
              {activeCaseSummary.description && (
                <div className="mt-6 rounded-2xl border border-primary/10 bg-background/70 p-4 text-sm text-text/70">
                  {activeCaseSummary.description}
                </div>
              )}
            </section>
          )}

          <section className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-primary">Timeline</h2>
                <p className="text-sm text-text/60">Ordered ledger events with provenance metadata.</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-text/40">
                {timelineItems.length} event{timelineItems.length === 1 ? '' : 's'}
              </span>
            </div>

            {timelineItems.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6 text-sm text-text/60">
                No chain of custody records found for the current filters.
              </div>
            ) : (
              <ol className="mt-6 space-y-6">
                {timelineItems.map((item) => {
                  const evidenceLabel = item.evidence?.title || 'Evidence record';
                  const caseLabel = item.case?.title || item.case?.caseNumber || 'Unknown case';
                  const isDownloading = downloading === item.evidence?._id;

                  return (
                    <li key={item._id} className="relative rounded-2xl border border-primary/10 bg-background/70 p-5">
                      <span className="absolute -left-3 top-6 h-6 w-6 rounded-full border-4 border-white bg-primary/80" />
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-primary">{evidenceLabel}</p>
                          <p className="text-xs text-text/60">Case: {caseLabel}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${actionBadge(item.action)}`}>
                              {item.action ? item.action.replace(/_/g, ' ') : 'event'}
                            </span>
                            {typeof item.verified === 'boolean' && (
                              <span
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${
                                  item.verified ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                                }`}
                              >
                                Verification: {item.verified ? 'match' : 'mismatch'}
                              </span>
                            )}
                          </div>
                          <dl className="mt-4 grid gap-2 text-xs text-text/60 sm:grid-cols-2">
                            <div className="flex items-center gap-2">
                              <ClockIcon className="h-4 w-4" />
                              <span>{formatTimestamp(item.timestamp)}</span>
                            </div>
                            {item.transactionHash && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-primary">Tx</span>
                                <span className="truncate">{item.transactionHash}</span>
                              </div>
                            )}
                            {item.blockNumber !== undefined && item.blockNumber !== null && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-primary">Block</span>
                                <span>{item.blockNumber}</span>
                              </div>
                            )}
                            {item.network && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-primary">Network</span>
                                <span>{item.network}</span>
                              </div>
                            )}
                            {item.fileHash && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-primary">Hash</span>
                                <span className="truncate">{item.fileHash}</span>
                              </div>
                            )}
                            {item.details?.uploader_address && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-primary">Uploader</span>
                                <span className="truncate">{item.details.uploader_address}</span>
                              </div>
                            )}
                          </dl>
                        </div>
                        <div className="flex flex-col items-start gap-3 text-xs lg:items-end">
                          <span className="rounded-full bg-white px-3 py-1 font-semibold text-text/60">
                            Ledger ref: {item.evidence?.ledgerId || '—'}
                          </span>
                          {item.evidence?._id && (
                            <button
                              className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleDownload(item.evidence?._id, item.evidence?.title || item.case?.title)}
                              type="button"
                              disabled={isDownloading}
                            >
                              <DocumentArrowDownIcon className={`h-5 w-5 ${isDownloading ? 'animate-pulse' : ''}`} />
                              {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ChainOfCustody;
