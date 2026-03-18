import React from 'react';
import { ShieldCheckIcon, LockClosedIcon, LinkIcon } from '@heroicons/react/24/outline';

const shorten = (value, length = 10) => {
  if (!value || typeof value !== 'string') {
    return '—';
  }
  if (value.length <= length * 2) {
    return value;
  }
  return `${value.slice(0, length)}…${value.slice(-length)}`;
};

const BlockchainStatusBadge = ({ explanationHash, txHash }) => {
  const anchored = Boolean(txHash || explanationHash);

  return (
    <section className="rounded-3xl border border-primary/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-slate-100 shadow">
      <header className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/20 text-primary">
          <ShieldCheckIcon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Blockchain provenance</h2>
          <p className="text-xs text-slate-300">Anchored explanation hash stored on the evidence ledger.</p>
        </div>
      </header>

      <dl className="mt-6 space-y-4 text-xs">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <dt className="flex items-center gap-2 text-slate-200">
            <LockClosedIcon className="h-4 w-4" /> Explanation hash
          </dt>
          <dd className="mt-2 font-mono text-sm text-white">{shorten(explanationHash) || 'Not available'}</dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <dt className="flex items-center gap-2 text-slate-200">
            <LinkIcon className="h-4 w-4" /> Transaction hash
          </dt>
          <dd className="mt-2 font-mono text-sm text-white">{shorten(txHash) || 'Pending anchor'}</dd>
        </div>
      </dl>

      <footer className="mt-4 text-xs text-slate-300">
        {anchored
          ? 'Blockchain entry recorded. Re-run the pipeline if artifacts change to refresh the anchor.'
          : 'Run the XAI analysis to generate artifacts and anchor them on-chain.'}
      </footer>
    </section>
  );
};

export default BlockchainStatusBadge;
