import React from 'react';
import { ArrowTopRightOnSquareIcon, Squares2X2Icon } from '@heroicons/react/24/outline';

const SimilarEvidencePanel = ({ items }) => {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-primary/20 bg-white p-6 text-sm text-text/60 shadow-sm">
        No similar evidence found yet. Run the XAI analysis to populate this list.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-primary/10 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">Top similar evidence</h3>
        <Squares2X2Icon className="h-5 w-5 text-primary" />
      </div>
      <ul className="mt-4 space-y-3 text-sm text-text/70">
        {items.map((item) => (
          <li key={item.evidenceId} className="rounded-2xl border border-primary/10 bg-background/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-primary">{item.metadata?.title || 'Unknown evidence'}</p>
                <p className="mt-1 text-xs text-text/50">Score {Math.round((item.score ?? 0) * 100)}%</p>
                {item.metadata?.description && (
                  <p className="mt-2 text-xs text-text/60">{item.metadata.description}</p>
                )}
              </div>
              <a
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                href={`#/cases/${item.metadata?.caseId || ''}/evidence/${item.evidenceId}`}
              >
                View <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SimilarEvidencePanel;
