import React, { useMemo, useState } from 'react';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';

const buildImageUrl = (imageData) => {
  if (!imageData) {
    return null;
  }
  if (typeof imageData === 'string' && imageData.startsWith('data:')) {
    return imageData;
  }
  if (typeof imageData === 'string') {
    return imageData;
  }
  if (imageData instanceof Blob) {
    return URL.createObjectURL(imageData);
  }
  return null;
};

const GradCAMOverlay = ({ sourceImage, heatmapPayload, isLoading }) => {
  const [opacity, setOpacity] = useState(0.6);

  const baseImageUrl = useMemo(() => buildImageUrl(sourceImage), [sourceImage]);
  const heatmapUrl = useMemo(() => buildImageUrl(heatmapPayload?.heatmap || heatmapPayload?.image), [heatmapPayload]);

  if (isLoading) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-primary/10 bg-white p-6 text-sm text-text/60 shadow-sm">
        <AdjustmentsHorizontalIcon className="h-6 w-6 animate-pulse text-primary" />
        <p className="mt-2">Generating Grad-CAM heatmap…</p>
      </div>
    );
  }

  if (!baseImageUrl || !heatmapUrl) {
    return (
      <div className="rounded-3xl border border-dashed border-primary/20 bg-white p-6 text-sm text-text/60 shadow-sm">
        Grad-CAM visualization unavailable. Ensure image evidence has been analyzed.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-primary/10 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-primary">Grad-CAM heatmap</h3>
          <p className="text-xs text-text/50">Drag the slider to adjust overlay intensity.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-text/60">
          <span>Opacity {Math.round(opacity * 100)}%</span>
          <input
            className="w-32"
            max={1}
            min={0}
            onChange={(event) => setOpacity(Number(event.target.value))}
            step={0.05}
            type="range"
            value={opacity}
          />
        </label>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-2xl">
        <img alt="Evidence" className="w-full object-contain" src={baseImageUrl} />
        <img
          alt="Grad-CAM heatmap"
          className="absolute inset-0 w-full object-contain"
          src={heatmapUrl}
          style={{ opacity }}
        />
      </div>
    </div>
  );
};

export default GradCAMOverlay;
