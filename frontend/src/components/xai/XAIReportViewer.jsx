import React from 'react';
import { DocumentArrowDownIcon, EyeIcon } from '@heroicons/react/24/outline';

const XAIReportViewer = ({ reportUrl, onDownload, downloading, reportAvailable }) => (
  <section className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm">
    <header className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-primary">Court-ready PDF report</h2>
        <p className="text-xs text-text/50">Download or preview the explainability packet generated for this evidence.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
          disabled={downloading}
          onClick={onDownload}
          type="button"
        >
          {downloading ? (
            <>
              <DocumentArrowDownIcon className="h-4 w-4 animate-spin" /> Preparing…
            </>
          ) : (
            <>
              <DocumentArrowDownIcon className="h-4 w-4" /> Download PDF
            </>
          )}
        </button>
        {reportUrl && (
          <a
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/40 hover:text-primary/80"
            href={reportUrl}
            rel="noreferrer"
            target="_blank"
          >
            <EyeIcon className="h-4 w-4" /> Preview
          </a>
        )}
      </div>
    </header>

    <div className="mt-6 min-h-[160px] rounded-2xl border border-dashed border-primary/15 bg-background/60 p-6">
      {reportAvailable ? (
        <p className="text-sm text-text/60">
          {reportUrl
            ? 'PDF preview ready. You can also download the report for sharing with the court or other stakeholders.'
            : 'Report generated. Click download to retrieve the latest anchored version.'}
        </p>
      ) : (
        <p className="text-sm text-text/60">
          Run the XAI pipeline to produce a PDF bundle containing SHAP, LIME, Grad-CAM, similarity insights, and blockchain attestations.
        </p>
      )}
    </div>
  </section>
);

export default XAIReportViewer;
