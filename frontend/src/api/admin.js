import { apiClient } from './client';

const withRoleHeader = (options = {}, role = 'admin') => {
  const headers = { ...(options.headers || {}) };
  if (!headers['X-Account-Role']) {
    headers['X-Account-Role'] = role;
  }
  return { ...options, headers };
};

export const adminApi = {
  login(credentials) {
    return apiClient.post('/api/admin/login', credentials);
  },
  fetchSummary(role = 'admin') {
    return apiClient.get('/api/admin/summary', withRoleHeader({}, role));
  },
  fetchWeeklyMetrics(role = 'admin') {
    return apiClient.get('/api/admin/metrics/weekly', withRoleHeader({}, role));
  },
  getChainOfCustody(params = {}, role = 'admin') {
    const { caseId, evidenceId } = params || {};
    const query = new URLSearchParams();
    if (caseId) {
      query.append('caseId', caseId);
    }
    if (evidenceId) {
      query.append('evidenceId', evidenceId);
    }
    const queryString = query.toString();
    const path = `/api/admin/chain-of-custody${queryString ? `?${queryString}` : ''}`;
    return apiClient.get(path, withRoleHeader({}, role));
  },
  listCases(role = 'admin') {
    return apiClient.get('/api/admin/cases', withRoleHeader({}, role));
  },
  listCaseRequests(role = 'admin') {
    return apiClient.get('/api/admin/case-requests', withRoleHeader({}, role));
  },
  updateCaseRequestStatus(requestId, status, role = 'admin') {
    return apiClient.post(
      `/api/admin/case-requests/${requestId}/status`,
      { status },
      withRoleHeader({}, role),
    );
  },
  createCase(payload, role = 'admin') {
    return apiClient.post('/api/admin/cases', payload, withRoleHeader({}, role));
  },
  listEvidence(caseId, role = 'admin') {
    const query = caseId ? `?caseId=${encodeURIComponent(caseId)}` : '';
    return apiClient.get(`/api/admin/evidence${query}`, withRoleHeader({}, role));
  },
  createEvidence(payload, role = 'admin') {
    return apiClient.post('/api/admin/evidence', payload, withRoleHeader({}, role));
  },
  uploadEvidence(formData, role = 'admin') {
    return apiClient.post('/api/admin/evidence', formData, withRoleHeader({}, role));
  },
  listAccounts(role = 'admin') {
    return apiClient.get('/api/admin/accounts', withRoleHeader({}, role));
  },
  getBlockchainStatus(role = 'admin') {
    return apiClient.get('/api/blockchain/status', withRoleHeader({}, role));
  },
  anchorEvidence(payload, role = 'investigator') {
    return apiClient.post('/api/blockchain/anchor', payload, withRoleHeader({}, role));
  },
  getOnChainRecord(evidenceId, role = 'admin') {
    return apiClient.get(`/api/blockchain/get/${evidenceId}`, withRoleHeader({}, role));
  },
  verifyEvidence(evidenceId, localHash, role = 'admin') {
    const query = localHash ? `?local_hash=${encodeURIComponent(localHash)}` : '';
    return apiClient.get(`/api/blockchain/verify/${evidenceId}${query}`, withRoleHeader({}, role));
  },
  downloadBlockchainSummary(role = 'admin') {
    return apiClient.get('/api/blockchain/report/summary.pdf', withRoleHeader({ responseType: 'blob' }, role));
  },
  downloadChainOfCustody(evidenceId, role = 'admin') {
    return apiClient.get(
      `/api/blockchain/report/chain-of-custody/${evidenceId}.pdf`,
      withRoleHeader({ responseType: 'blob' }, role),
    );
  },
  downloadCasesReport(role = 'admin') {
    return apiClient.get('/api/admin/report/cases.pdf', withRoleHeader({ responseType: 'blob' }, role));
  },
  downloadEvidenceReport(role = 'admin') {
    return apiClient.get('/api/admin/report/evidence.pdf', withRoleHeader({ responseType: 'blob' }, role));
  },
  runXaiAnalysis(evidenceId, role = 'investigator') {
    return apiClient.post(
      '/api/xai/analyze',
      { evidenceId },
      withRoleHeader({}, role),
    );
  },
  listXaiInsights(params = {}, role = 'investigator') {
    const query = new URLSearchParams(params).toString();
    const path = `/api/xai/insights${query ? `?${query}` : ''}`;
    return apiClient.get(path, withRoleHeader({}, role));
  },
  fetchXaiArtifact(evidenceId, type, role = 'investigator', responseType = 'text') {
    return apiClient.get(
      `/api/xai/artifact/${evidenceId}/${type}`,
      withRoleHeader({ responseType }, role),
    );
  },
  fetchXaiReport(evidenceId, role = 'investigator') {
    return apiClient.get(
      `/api/xai/report/${evidenceId}`,
      withRoleHeader({ responseType: 'blob' }, role),
    );
  },
  listActivityLogs(params = {}, role = 'admin') {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
        return;
      }
      query.append(key, value);
    });
    const queryString = query.toString();
    return apiClient.get(
      `/api/admin/activity-logs${queryString ? `?${queryString}` : ''}`,
      withRoleHeader({}, role),
    );
  },
  getActivityLog(logId, role = 'admin') {
    return apiClient.get(`/api/admin/activity-logs/${logId}`, withRoleHeader({}, role));
  },
  deleteActivityLogs(payload, role = 'admin', privilege = 'superadmin') {
    return apiClient.delete(
      '/api/admin/activity-logs',
      payload,
      withRoleHeader({ headers: { 'X-Admin-Privilege': privilege } }, role),
    );
  },
  anchorActivityLog(logId, role = 'admin') {
    return apiClient.post(
      `/api/admin/activity-logs/${logId}/anchor`,
      {},
      withRoleHeader({}, role),
    );
  },
  exportActivityLogsCsv(params = {}, role = 'admin') {
    const query = new URLSearchParams(params).toString();
    const path = `/api/admin/activity-logs/export.csv${query ? `?${query}` : ''}`;
    return apiClient.get(path, withRoleHeader({ responseType: 'blob' }, role));
  },
  exportActivityLogsPdf(params = {}, role = 'admin') {
    const query = new URLSearchParams(params).toString();
    const path = `/api/admin/activity-logs/export.pdf${query ? `?${query}` : ''}`;
    return apiClient.get(path, withRoleHeader({ responseType: 'blob' }, role));
  },
};
