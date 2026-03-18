import { apiClient } from "./client";

export const logsApi = {
  ingestLogs: (logs) => apiClient.post("/api/logs/ingest", { logs }),
  getAlerts: (days = 7) => apiClient.get(`/api/logs/alerts?days=${days}`),
  getReportUrl: (id) => {
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
    return `${baseUrl}/api/logs/report/${id}`;
  },
  getFullReportUrl: (days = 7) => {
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
    return `${baseUrl}/api/logs/report/full?days=${days}`;
  },
};
