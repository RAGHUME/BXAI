import { apiClient } from './client';

export const authApi = {
  signup(payload) {
    return apiClient.post('/api/auth/signup', payload);
  },
  login(credentials) {
    return apiClient.post('/api/auth/login', credentials);
  },
  fetchInvestigatorDashboard(accountId) {
    return apiClient.get(`/api/dashboard/investigator/${accountId}`);
  },
  fetchUserDashboard(accountId) {
    return apiClient.get(`/api/dashboard/user/${accountId}`);
  },
  followCase(payload) {
    return apiClient.post('/api/dashboard/user/follow', payload);
  },
  createCaseRequest(payload) {
    return apiClient.post('/api/dashboard/user/request', payload);
  },
};
