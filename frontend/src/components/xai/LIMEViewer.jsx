import React from 'react';
import { BeakerIcon } from '@heroicons/react/24/outline';

const tokenize = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (Array.isArray(payload.tokens)) {
    return payload.tokens.map((token, index) => ({
      text: token,
      weight: Array.isArray(payload.weights) ? payload.weights[index] ?? 0 : 0,
    }));
  }
  if (Array.isArray(payload.features)) {
    return payload.features.map((feature, index) => ({
      text: String(feature),
      weight: Array.isArray(payload.scores) ? payload.scores[index] ?? 0 : 0,
    }));
  }
  return null;
};

const limeColor = (weight) => {
  if (typeof weight !== 'number' || Number.isNaN(weight)) {
    return 'bg-slate-200 text-slate-600';
  }
  if (weight > 0) {
    const intensity = Math.min(90, Math.round(weight * 100));
    return `bg-emerald-${Math.max(20, intensity)} text-emerald-900/90`;
  }
  const intensity = Math.min(90, Math.round(Math.abs(weight) * 100));
  return `bg-rose-${Math.max(20, intensity)} text-rose-900/90`;
};

const LIMEViewer = ({ data, isLoading }) => {
  const tokens = tokenize(data);

  if (isLoading) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-primary/10 bg-white p-6 text-sm text-text/60 shadow-sm">
        <BeakerIcon className="h-6 w-6 animate-pulse text-primary" />
        <p className="mt-2">Computing LIME tokens…</p>
      </div>
    );
  }

  if (!tokens || tokens.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-primary/20 bg-white p-6 text-sm text-text/60 shadow-sm">
        LIME explanation not available yet.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-primary/10 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-primary">Token importance (LIME)</h3>
      <p className="text-xs text-text/50">Positive weights support the prediction, negative weights oppose it.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tokens.map((token, index) => (
          <span
            key={`${token.text}-${index}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${limeColor(token.weight)}`}
            title={`Weight ${token.weight?.toFixed?.(3) ?? token.weight}`}
          >
            {token.text}
          </span>
        ))}
      </div>
    </div>
  );
};

export default LIMEViewer;
