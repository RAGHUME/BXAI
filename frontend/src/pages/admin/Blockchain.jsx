import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CubeTransparentIcon,
  LockClosedIcon,
  CircleStackIcon,
  ArrowPathIcon,
  CpuChipIcon,
  DocumentArrowDownIcon,
  DocumentDuplicateIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/admin';

const statusChip = (status = '') => {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case 'verified':
      return 'bg-emerald-100 text-emerald-600';
    case 'failed':
      return 'bg-rose-100 text-rose-600';
    case 'transfer':
      return 'bg-sky-100 text-sky-600';
    case 'remove':
    case 'removed':
      return 'bg-slate-200 text-slate-600';
    case 'pending':
      return 'bg-amber-100 text-amber-600';
    default:
      return 'bg-indigo-100 text-indigo-600';
  }
};

const statusLabel = (status = '') => {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case 'verified':
      return 'Verified';
    case 'failed':
      return 'Verification failed';
    case 'transfer':
      return 'Transferred';
    case 'remove':
    case 'removed':
      return 'Removed';
    case 'pending':
      return 'Pending verification';
    default:
      return 'Anchored';
  }
};

const parseTimestamp = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'number') {
    const milliseconds = value > 10 ** 12 ? value : value * 1000;
    const fromNumber = new Date(milliseconds);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  const fromString = new Date(value);
  return Number.isNaN(fromString.getTime()) ? null : fromString;
};

const displayTimestamp = (value) => {
  const date = parseTimestamp(value);
  if (!date) {
    return '—';
  }

  return date.toLocaleString();
};

const summarizeRecord = (record) => {
  if (!record) {
    return 'Evidence record';
  }

  if (record.title) {
    return record.title;
  }

  if (record.description) {
    return record.description;
  }

  return `Evidence ${record.evidenceId || record.id || 'record'}`;
};

const deriveStatus = (summary = {}) => {
  if (summary.verification?.verified === false) {
    return 'failed';
  }

  if (summary.verification?.verified) {
    return 'verified';
  }

  if (summary.status) {
    return summary.status.toLowerCase();
  }

  if (summary.verification_status) {
    return summary.verification_status.toLowerCase();
  }

  return 'anchored';
};

const triggerDownload = (blob, filename) => {
  if (!blob) {
    return;
  }

  if (typeof window === 'undefined') {
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

const Blockchain = () => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  const [downloadingEvidence, setDownloadingEvidence] = useState('');
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const fetchAnchoredRecords = useCallback(
    async ({ initial = false } = {}) => {
      try {
        if (initial) {
          setLoading(true);
        }

        setRefreshing(true);
        setError('');
        if (!initial) {
          setInfo('');
        }

        const response = await adminApi.listEvidence();
        const evidenceList = response.evidence || [];

        const anchored = evidenceList
          .map((item) => {
            const summary = item.blockchain;
            if (!summary || summary.historyCount === 0) {
              return null;
            }

            const status = deriveStatus(summary);

            return {
              id: item._id,
              title: item.title,
              caseTitle: item.caseTitle,
              caseId: item.caseId,
              status,
              summary,
              transaction: summary.transactionHash,
              network: summary.network,
              historyCount: summary.historyCount || 0,
              timestamp: summary.timestamp || item.updatedAt || item.createdAt,
              hash: summary.hash,
              verification: summary.verification,
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            const timeA = parseTimestamp(a.timestamp)?.getTime() || 0;
            const timeB = parseTimestamp(b.timestamp)?.getTime() || 0;
            return timeB - timeA;
          });

        setRecords(anchored);
        if (!initial) {
          setInfo('Ledger state refreshed');
        }
      } catch (err) {
        setError(err.message || 'Unable to load blockchain records');
      } finally {
        if (initial) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchAnchoredRecords({ initial: true });
  }, [fetchAnchoredRecords]);

  const fetchStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      const response = await adminApi.getBlockchainStatus();
      setStatus(response);
    } catch (err) {
      setStatus({
        connected: false,
        error: err.message || 'Unable to reach blockchain status endpoint',
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const metrics = useMemo(() => {
    const total = records.length;
    const verified = records.filter((item) => item.status === 'verified').length;
    const pending = records.filter((item) => item.status === 'pending').length;
    const failed = records.filter((item) => item.status === 'failed').length;

    return {
      total,
      verified,
      pending,
      failed,
      attention: pending + failed,
      latest: records[0] || null,
    };
  }, [records]);

  const anyAnchored = metrics.total > 0;
  const latestTimestamp = metrics.latest ? displayTimestamp(metrics.latest.timestamp) : '—';
  const latestTransaction = metrics.latest?.transaction
    ? `${metrics.latest.transaction.slice(0, 12)}…`
    : 'N/A';
  const latestNetwork = metrics.latest?.network || '—';
  const latestStatus = metrics.latest ? statusLabel(metrics.latest.status) : 'No entries yet';
  const statusBadgeClass = status?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600';
  const statusLabelText = status?.connected ? 'Connected' : 'Disconnected';

  const handleDownloadSummary = useCallback(async () => {
    try {
      setDownloadingSummary(true);
      setError('');
      setInfo('');
      const blob = await adminApi.downloadBlockchainSummary();
      triggerDownload(blob, 'blockchain-summary.pdf');
      setInfo('Blockchain summary report downloaded');
    } catch (err) {
      setError(err.message || 'Unable to download summary report');
    } finally {
      setDownloadingSummary(false);
    }
  }, []);

  const handleDownloadChainOfCustody = useCallback(async (record) => {
    try {
      setDownloadingEvidence(record.id);
      setError('');
      setInfo('');
      const blob = await adminApi.downloadChainOfCustody(record.id);
      const safeCaseTitle = record.caseTitle
        ? record.caseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        : '';
      const filename = safeCaseTitle
        ? `chain-of-custody-${safeCaseTitle}.pdf`
        : `chain-of-custody-${record.id}.pdf`;
      triggerDownload(blob, filename);
      setInfo('Chain of custody report downloaded');
    } catch (err) {
      setError(err.message || 'Unable to download chain of custody report');
    } finally {
      setDownloadingEvidence('');
    }
  }, []);

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Ledger intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold text-primary">Blockchain command center</h1>
          <p className="mt-3 max-w-2xl text-sm text-text/60">
            Monitor anchoring, verification, and custody activity across your digital evidence ledger. Export compliance-ready
            reports with a single click.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDownloadSummary}
            type="button"
            disabled={downloadingSummary}
          >
            <DocumentArrowDownIcon className={`h-5 w-5 ${downloadingSummary ? 'animate-pulse' : ''}`} />
            {downloadingSummary ? 'Preparing summary…' : 'Download summary PDF'}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => fetchAnchoredRecords({ initial: false })}
            type="button"
            disabled={refreshing}
          >
            <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh ledger'}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => fetchStatus()}
            type="button"
            disabled={statusLoading}
          >
            <ArrowPathIcon className={`h-5 w-5 ${statusLoading ? 'animate-spin' : ''}`} />
            {statusLoading ? 'Checking node…' : 'Check node'}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          {error}
        </div>
      )}

      {info && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">
          {info}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <CubeTransparentIcon className="h-8 w-8 text-indigo-500" />
          <h2 className="mt-4 text-base font-semibold text-primary">Blockchain status</h2>
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}>
              {statusLoading ? 'Checking…' : statusLabelText}
            </span>
            {status?.network && <span className="text-xs text-text/50">{status.network}</span>}
          </div>
          <dl className="mt-4 space-y-2 text-xs text-text/60">
            <div className="flex justify-between">
              <dt>Latest block</dt>
              <dd className="text-primary font-semibold">{status?.latestBlock ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Contract</dt>
              <dd className="truncate text-primary/80">
                {status?.contractAddress ? `${status.contractAddress.slice(0, 8)}…${status.contractAddress.slice(-4)}` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Operator</dt>
              <dd className="truncate text-primary/80">
                {status?.accountAddress ? `${status.accountAddress.slice(0, 8)}…${status.accountAddress.slice(-4)}` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Anchors</dt>
              <dd className="text-primary font-semibold">{status?.totalAnchored ?? 0}</dd>
            </div>
          </dl>
          {status?.error && (
            <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
              {status.error}
            </p>
          )}
        </div>
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <CircleStackIcon className="h-8 w-8 text-primary" />
          <h2 className="mt-4 text-base font-semibold text-primary">Anchored evidence</h2>
          <p className="mt-2 text-2xl font-semibold text-primary">{loading ? '—' : metrics.total}</p>
          <p className="mt-2 text-sm text-text/60">Records captured on chain</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-text/40">
            Ledger • {anyAnchored ? 'Active' : 'Awaiting anchors'}
          </p>
        </div>
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <ShieldCheckIcon className="h-8 w-8 text-emerald-500" />
          <h2 className="mt-4 text-base font-semibold text-primary">Integrity verified</h2>
          <p className="mt-2 text-2xl font-semibold text-primary">{loading ? '—' : metrics.verified}</p>
          <p className="mt-2 text-sm text-text/60">Hashes matching on-chain reference</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-text/40">
            Verification • {metrics.verified > 0 ? 'In progress' : 'Pending'}
          </p>
        </div>
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
          <h2 className="mt-4 text-base font-semibold text-primary">Requires attention</h2>
          <p className="mt-2 text-2xl font-semibold text-primary">{loading ? '—' : metrics.attention}</p>
          <p className="mt-2 text-sm text-text/60">
            {metrics.attention === 0
              ? 'All anchors healthy'
              : `${metrics.pending} pending • ${metrics.failed} failed verifications`}
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-text/40">
            Alerts • {metrics.attention === 0 ? 'Clear' : 'Action needed'}
          </p>
        </div>
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <CpuChipIcon className="h-8 w-8 text-sky-500" />
          <h2 className="mt-4 text-base font-semibold text-primary">Latest sync</h2>
          <p className="mt-2 text-sm text-text/60">
            {metrics.latest
              ? (
                  <>
                    <span className="font-semibold text-primary">{latestStatus}</span>
                    <br />
                    {latestTimestamp}
                  </>
                )
              : 'No transactions yet.'}
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-text/40">
            {metrics.latest ? `${latestNetwork} • Tx ${latestTransaction}` : 'Sync • idle'}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary">Ledger history</h2>
            <p className="text-sm text-text/60">Chronological view of anchored evidence and custody operations.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-text/50">
            <CubeTransparentIcon className="h-4 w-4" />
            <span>{refreshing ? 'Syncing…' : `${metrics.total} entries`}</span>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          {loading ? (
            <div className="rounded-2xl border border-primary/10 bg-background/70 p-6 text-sm text-text/60">
              Loading ledger entries…
            </div>
          ) : !anyAnchored ? (
            <div className="rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6 text-sm text-text/60">
              No anchored evidence yet. Anchor items from the Evidence page to populate this view.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-primary/10 text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-text/40">
                <tr>
                  <th className="py-3 pr-4">Evidence</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Network / Tx</th>
                  <th className="py-3 pr-4">Ledger updates</th>
                  <th className="py-3 pr-4">Last event</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/10 text-sm text-text/70">
                {records.map((record) => (
                  <tr key={record.id} className="align-top">
                    <td className="py-4 pr-4">
                      <p className="text-sm font-semibold text-primary">{summarizeRecord(record)}</p>
                      <p className="mt-1 text-xs text-text/50">
                        {record.caseTitle ? `${record.caseTitle} • ` : ''}
                        {record.id}
                      </p>
                      {record.hash && (
                        <p className="mt-1 break-all text-xs text-text/40">Hash: {record.hash}</p>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusChip(record.status)}`}>
                        {statusLabel(record.status)}
                      </span>
                      {record.verification && (
                        <p className="mt-2 text-xs text-text/50">
                          {record.verification.verified ? 'Hashes match' : 'Hash mismatch detected'}
                        </p>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-primary/80">{record.network || '—'}</p>
                      <p className="mt-1 text-xs text-text/50">
                        {record.transaction ? `Tx ${record.transaction.slice(0, 14)}…` : 'No transaction hash'}
                      </p>
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-primary/80">{record.historyCount}</p>
                      <p className="mt-1 text-xs text-text/50">On-chain events</p>
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-primary/80">{displayTimestamp(record.timestamp)}</p>
                    </td>
                    <td className="py-4">
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleDownloadChainOfCustody(record)}
                        type="button"
                        disabled={downloadingEvidence === record.id}
                      >
                        <DocumentDuplicateIcon className="h-4 w-4" />
                        {downloadingEvidence === record.id ? 'Preparing…' : 'Chain of custody'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-primary">Anchor checklist</h3>
          <p className="mt-2 text-sm text-text/60">
            Ensure evidence is collected, hashed, and anchored promptly to maintain an auditable timeline.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-text/60">
            <li>• Capture evidence metadata from the Evidence workspace.</li>
            <li>• Generate and verify SHA-256 hashes before anchoring.</li>
            <li>• Use investigator credentials to call the anchor endpoint.</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-primary">Verification & custody tips</h3>
          <p className="mt-2 text-sm text-text/60">
            Keep the ledger healthy by verifying hashes regularly and exporting custody records for compliance audits.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-text/60">
            <li>• Run hash verification after every evidence update.</li>
            <li>• Export the summary PDF for weekly governance reviews.</li>
            <li>• Download chain-of-custody PDFs ahead of court filings.</li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default Blockchain;

