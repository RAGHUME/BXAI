import React from 'react';
import {
  SparklesIcon,
  ArrowPathIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const confidenceDisplay = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
};

const XAIPredictionCard = ({ prediction, updatedAt, onRunAnalysis, running }) => {
  const label = prediction?.label ?? 'Unknown';
  const confidence = confidenceDisplay(prediction?.confidence);
  const rawNotes = prediction?.raw && typeof prediction.raw === 'object' ? prediction.raw.note : null;

  return (
    <section className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Model verdict</p>
          <h2 className="mt-2 text-2xl font-semibold text-primary">{label}</h2>
          <p className="mt-1 text-sm text-text/60">Confidence {confidence}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
          onClick={onRunAnalysis}
          type="button"
          disabled={running}
        >
          {running ? (
            <>
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Running XAI…
            </>
          ) : (
            <>
              <SparklesIcon className="h-4 w-4" />
              Run XAI analysis
            </>
          )}
        </button>
      </header>

      {rawNotes && <p className="mt-4 text-xs text-text/50">{rawNotes}</p>}

      <footer className="mt-6 flex items-center gap-2 text-xs text-text/50">
        <ClockIcon className="h-4 w-4" />
        {updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : 'No previous analysis'}
      </footer>
    </section>
  );
};

export default XAIPredictionCard;
