import React from 'react';
import Plot from 'react-plotly.js';
import { BoltIcon } from '@heroicons/react/24/outline';

const extractBarSeries = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const values = payload.values || payload.shap_values || payload.attributions;
  const featureNames = payload.features || payload.feature_names || payload.keys;

  if (!Array.isArray(values) || !Array.isArray(featureNames) || values.length === 0) {
    return null;
  }

  const trimmedFeatures = featureNames.slice(0, values.length);
  const trimmedValues = values.slice(0, trimmedFeatures.length);
  return {
    features: trimmedFeatures,
    values: trimmedValues,
  };
};

const SHAPViewer = ({ data, isLoading }) => {
  const barSeries = extractBarSeries(data);

  if (isLoading) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-primary/10 bg-white p-6 text-sm text-text/60 shadow-sm">
        <BoltIcon className="h-6 w-6 animate-pulse text-primary" />
        <p className="mt-2">Preparing SHAP explanation…</p>
      </div>
    );
  }

  if (!barSeries) {
    return (
      <div className="rounded-3xl border border-dashed border-primary/20 bg-white p-6 text-sm text-text/60 shadow-sm">
        SHAP values unavailable. Trigger a fresh analysis to generate attributions.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-primary/10 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-primary">Top feature impact</h3>
      <p className="text-xs text-text/50">SHAP explains the contribution of each feature towards the prediction.</p>
      <div className="mt-4">
        <Plot
          data={[
            {
              type: 'bar',
              orientation: 'h',
              x: barSeries.values,
              y: barSeries.features.map((feature) => String(feature)),
              marker: {
                color: barSeries.values.map((value) => (value >= 0 ? '#2563eb' : '#f43f5e')),
              },
              hovertemplate: '%{y}: %{x:.3f}<extra></extra>',
            },
          ]}
          layout={{
            autosize: true,
            margin: { l: 120, r: 20, t: 20, b: 30 },
            bargap: 0.4,
            plot_bgcolor: 'transparent',
            paper_bgcolor: 'transparent',
            font: { family: 'Inter, sans-serif', size: 12, color: '#475569' },
          }}
          style={{ width: '100%', height: 320 }}
          config={{ displayModeBar: false, responsive: true }}
          useResizeHandler
        />
      </div>
    </div>
  );
};

export default SHAPViewer;
