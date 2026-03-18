const BASE_PATH = '/api/xai';

const buildRequest = async (path, options = {}) => {
  const response = await fetch(`${BASE_PATH}${path}`, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Unable to process XAI request');
    throw new Error(message || 'Unable to process XAI request');
  }

  return response;
};

export const fetchXAIResults = async (evidenceId, { role } = {}) => {
  if (!evidenceId) {
    throw new Error('Evidence id is required to fetch XAI results');
  }

  const headers = {};
  if (role) {
    headers['X-Account-Role'] = role;
  }

  const response = await buildRequest(`/results/${evidenceId}`, { headers });
  return response.json();
};

export const analyzeEvidence = async (evidenceId, filePath, { role, anchor } = {}) => {
  if (!evidenceId) {
    throw new Error('Evidence id is required for analysis');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (role) {
    headers['X-Account-Role'] = role;
  }

  const body = JSON.stringify({ evidenceId, filePath, anchor: Boolean(anchor) });

  const response = await buildRequest('/analyze', {
    method: 'POST',
    headers,
    body,
  });

  return response.json();
};

export const downloadAnalysisReport = async (evidenceId, { role } = {}) => {
  if (!evidenceId) {
    throw new Error('Evidence id is required to download the report');
  }

  const headers = {};
  if (role) {
    headers['X-Account-Role'] = role;
  }

  const response = await buildRequest(`/report/${evidenceId}`, {
    headers,
  });

  return response.blob();
};
