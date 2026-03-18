import React from 'react';
import {
  SparklesIcon,
  ShieldCheckIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const badgeClass = (type) => {
  switch (type) {
    case 'critical':
      return 'bg-rose-100 text-rose-600';
    case 'warning':
      return 'bg-amber-100 text-amber-600';
    case 'success':
      return 'bg-emerald-100 text-emerald-600';
    default:
      return 'bg-indigo-100 text-indigo-600';
  }
};

const XAIResultCard = ({ title, result, actions }) => {
  if (!result) {
    return null;
  }

  const {
    summary,
    score,
    findings = [],
    metadata = {},
    generated_at: generatedAt,
    anchor_summary: anchorSummary,
    flags = [],
  } = result;

  return (
    <article className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">Explainable AI analysis</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {typeof score === 'number' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
              <SparklesIcon className="h-4 w-4" /> Confidence {Math.round(score * 100)}%
            </span>
          )}
          {anchorSummary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-600">
              <ShieldCheckIcon className="h-4 w-4" /> {anchorSummary}
            </span>
          )}
          {flags.map((flag) => (
            <span key={flag} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${badgeClass(flag.type)}`}>
              <ExclamationTriangleIcon className="h-4 w-4" /> {flag.label || flag.type}
            </span>
          ))}
        </div>
      </header>

      {summary && <p className="text-sm text-slate-600">{summary}</p>}

      {findings.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Key findings</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            {findings.map((item, index) => (
              <li key={item.id || index} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{item.title || `Finding ${index + 1}`}</p>
                  {item.url && (
                    <a
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      href={item.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View detail <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {item.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}
                {item.score != null && (
                  <p className="mt-2 text-xs font-semibold text-slate-500">Score: {Math.round(item.score * 100)}%</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {Object.keys(metadata).length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Metadata</h3>
          <dl className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
            {Object.entries(metadata).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-600">{label}</dt>
                <dd className="mt-1 text-slate-500">{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div>
          {generatedAt && (
            <p>Generated {new Date(generatedAt).toLocaleString()}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      </footer>
    </article>
  );
};

export default XAIResultCard;
