import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/admin';
import XAIPredictionCard from '../../components/xai/XAIPredictionCard.jsx';
import SHAPViewer from '../../components/xai/SHAPViewer.jsx';
import LIMEViewer from '../../components/xai/LIMEViewer.jsx';
import GradCAMOverlay from '../../components/xai/GradCAMOverlay.jsx';
import SimilarEvidencePanel from '../../components/xai/SimilarEvidencePanel.jsx';
import ExplanationSummary from '../../components/xai/ExplanationSummary.jsx';
import BlockchainStatusBadge from '../../components/xai/BlockchainStatusBadge.jsx';
import XAIReportViewer from '../../components/xai/XAIReportViewer.jsx';

const EvidenceXaiView = ({ caseId: caseIdProp, evidenceId: evidenceIdProp, onBack }) => {
  const navigate = useNavigate();
  const params = useParams();
  const caseId = caseIdProp ?? params.caseId;
  const evidenceId = evidenceIdProp ?? params.evidenceId;

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(-1);
  }, [navigate, onBack]);

  const [loading, setLoading] = useState(true);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const [evidence, setEvidence] = useState(null);
  const [insight, setInsight] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [shapData, setShapData] = useState(null);
  const [limeData, setLimeData] = useState(null);
  const [gradcamData, setGradcamData] = useState(null);
  const [similarityItems, setSimilarityItems] = useState([]);
  const [nemotronSummary, setNemotronSummary] = useState(null);
  const [reportPreviewUrl, setReportPreviewUrl] = useState(null);

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const revokeReportPreview = useCallback(() => {
    if (reportPreviewUrl) {
      URL.revokeObjectURL(reportPreviewUrl);
    }
  }, [reportPreviewUrl]);

  useEffect(() => revokeReportPreview, [revokeReportPreview]);

  const fetchJsonArtifact = useCallback(
    async (type) => {
      if (!evidenceId) {
        return null;
      }
      try {
        const response = await adminApi.fetchXaiArtifact(evidenceId, type, 'investigator', 'text');
        if (!response) {
          return null;
        }
        const trimmed = String(response).trim();
        if (!trimmed) {
          return null;
        }
        return JSON.parse(trimmed);
      } catch (err) {
        console.debug(`Failed to load ${type} artifact`, err);
        return null;
      }
    },
    [evidenceId]
  );

  const fetchTextArtifact = useCallback(
    async (type) => {
      try {
        const response = await adminApi.fetchXaiArtifact(evidenceId, type, 'investigator', 'text');
        return response ? String(response) : null;
      } catch (err) {
        console.debug(`Failed to load ${type} artifact`, err);
        return null;
      }
    },
    [evidenceId]
  );

  const loadArtifacts = useCallback(
    async () => {
      setArtifactsLoading(true);
      try {
        const [shapPayload, limePayload, gradcamPayload, similarityPayload, summaryText] = await Promise.all([
          fetchJsonArtifact('shap'),
          fetchJsonArtifact('lime'),
          fetchJsonArtifact('gradcam'),
          fetchJsonArtifact('similarity'),
          fetchTextArtifact('summary'),
        ]);

        setShapData(shapPayload);
        setLimeData(limePayload);
        setGradcamData(gradcamPayload);
        setSimilarityItems(Array.isArray(similarityPayload?.results) ? similarityPayload.results : []);
        if (summaryText) {
          setNemotronSummary({
            investigator_summary: summaryText,
            judge_friendly_explanation: 'Pending tailored prompt.',
            technical_explanation: 'Pending tailored prompt.',
          });
        } else {
          setNemotronSummary(null);
        }
      } finally {
        setArtifactsLoading(false);
      }
    },
    [fetchJsonArtifact, fetchTextArtifact]
  );

  const loadInsights = useCallback(async () => {
    if (!evidenceId) {
      setInsight(null);
      setPrediction(null);
      return;
    }
    try {
      const response = await adminApi.listXaiInsights({ evidenceId }, 'investigator');
      const [latest] = response?.results || [];
      setInsight(latest || null);
      setPrediction(latest?.prediction || null);

      if (latest) {
        await loadArtifacts();
      } else {
        setShapData(null);
        setLimeData(null);
        setGradcamData(null);
        setSimilarityItems([]);
        setNemotronSummary(null);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Unable to load XAI insights.');
    }
  }, [evidenceId, loadArtifacts]);

  const loadEvidence = useCallback(async () => {
    setStatusMessage('');
    if (!caseId || !evidenceId) {
      setLoading(false);
      setEvidence(null);
      setPrediction(null);
      setInsight(null);
      setErrorMessage('Select an evidence item to view XAI insights.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const listResponse = await adminApi.listEvidence(caseId);
      const items = listResponse?.evidence || [];
      const selected = items.find((item) => item._id === evidenceId);
      if (!selected) {
        throw new Error('Evidence not found');
      }
      setEvidence(selected);
      setPrediction(selected.prediction || null);
      await loadInsights();
    } catch (err) {
      setErrorMessage(err.message || 'Unable to load evidence details.');
    } finally {
      setLoading(false);
    }
  }, [caseId, evidenceId, loadInsights]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  const handleRunAnalysis = useCallback(async () => {
    if (!evidenceId) {
      setErrorMessage('Select an evidence item to run XAI analysis.');
      return;
    }
    try {
      setAnalysisRunning(true);
      setErrorMessage('');
      setStatusMessage('');
      await adminApi.runXaiAnalysis(evidenceId, 'investigator');
      setStatusMessage('XAI analysis started. Refresh will occur once results are ready.');
      await loadInsights();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to run XAI analysis.');
    } finally {
      setAnalysisRunning(false);
    }
  }, [evidenceId, loadInsights]);

  const triggerDownload = useCallback((blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadReport = useCallback(async () => {
    if (!evidenceId) {
      setErrorMessage('No evidence selected for report download.');
      return;
    }
    try {
      setDownloadingReport(true);
      setErrorMessage('');
      setStatusMessage('');
      const blob = await adminApi.fetchXaiReport(evidenceId, 'investigator');
      revokeReportPreview();
      const preview = URL.createObjectURL(blob);
      setReportPreviewUrl(preview);
      triggerDownload(blob, `xai-report-${evidenceId}.pdf`);
      setStatusMessage('XAI report downloaded successfully.');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to download XAI report.');
    } finally {
      setDownloadingReport(false);
    }
  }, [evidenceId, revokeReportPreview, triggerDownload]);

  const summaryForDisplay = useMemo(() => {
    if (nemotronSummary) {
      return nemotronSummary;
    }
    if (!insight) {
      return null;
    }
    return {
      investigator_summary: 'No Nemotron summary available yet. Run the XAI pipeline to generate one.',
      judge_friendly_explanation: 'Pending tailored prompt.',
      technical_explanation: 'Pending tailored prompt.',
    };
  }, [insight, nemotronSummary]);

  const reportAvailable = Boolean(insight?.pdfReportPath);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary/10"
          onClick={handleBack}
          type="button"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to evidence
        </button>
        <span className="text-xs text-text/60">
          Case {caseId || '—'} • Evidence {evidenceId || '—'}
        </span>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <ExclamationTriangleIcon className="h-5 w-5" /> {errorMessage}
        </div>
      )}

      {statusMessage && !errorMessage && (
        <div className="flex items-center gap-2 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <SparklesIcon className="h-5 w-5" /> {statusMessage}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-primary/10 bg-white p-10 text-center text-sm text-text/60 shadow-sm">
          Loading XAI workspace…
        </div>
      ) : !evidence ? (
        <div className="rounded-3xl border border-primary/10 bg-white p-10 text-center text-sm text-text/60 shadow-sm">
          Evidence not found.
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <XAIPredictionCard
                prediction={prediction}
                updatedAt={insight?.updatedAt}
                onRunAnalysis={handleRunAnalysis}
                running={analysisRunning}
              />
              <ExplanationSummary summary={summaryForDisplay} />
            </div>
            <BlockchainStatusBadge
              explanationHash={insight?.explanationHash}
              txHash={insight?.blockchainTxHash}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SHAPViewer data={shapData} isLoading={artifactsLoading && Boolean(insight)} />
            <LIMEViewer data={limeData} isLoading={artifactsLoading && Boolean(insight)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <GradCAMOverlay
              sourceImage={evidence?.previewUrl || evidence?.file?.previewUrl || evidence?.file?.path || null}
              heatmapPayload={gradcamData}
              isLoading={artifactsLoading && Boolean(insight)}
            />
            <SimilarEvidencePanel items={similarityItems} />
          </div>

          <XAIReportViewer
            reportUrl={reportPreviewUrl}
            onDownload={handleDownloadReport}
            downloading={downloadingReport}
            reportAvailable={reportAvailable}
          />
        </>
      )}
    </div>
  );
};

export default EvidenceXaiView;
