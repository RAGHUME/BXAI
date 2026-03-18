import React, { useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  DocumentChartBarIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { logsApi } from "../../api/logs";

const Xai = () => {
  const [sysLogs, setSysLogs] = useState([]);
  const [sysLoading, setSysLoading] = useState(false);

  const fetchSystemLogs = async () => {
    setSysLoading(true);
    try {
      const data = await logsApi.getAlerts(7);
      setSysLogs(data);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setSysLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemLogs();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Live X-LAD Monitor
          </h1>
          <p className="text-sm text-slate-500">
            Real-time anomaly detection for system activity (Last 7 Days).
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={logsApi.getFullReportUrl(7)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 border rounded-full text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <DocumentChartBarIcon className="h-4 w-4" /> Full PDF Report
          </a>
          <button
            onClick={fetchSystemLogs}
            className="flex items-center gap-2 px-4 py-2 border rounded-full text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${sysLoading ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Log Content
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sysLoading && sysLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan="3"
                    className="px-6 py-10 text-center text-sm text-slate-500"
                  >
                    Loading...
                  </td>
                </tr>
              ) : sysLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan="3"
                    className="px-6 py-10 text-center text-sm text-slate-500"
                  >
                    No logs found.
                  </td>
                </tr>
              ) : (
                sysLogs.map((log) => (
                  <tr
                    key={log._id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${
                          log.anomaly_status === "Anomaly"
                            ? "bg-rose-50 text-rose-700"
                            : log.anomaly_status === "Normal"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {log.anomaly_status === "Anomaly" ? (
                          <ExclamationTriangleIcon className="h-3 w-3" />
                        ) : log.anomaly_status === "Normal" ? (
                          <CheckCircleIcon className="h-3 w-3" />
                        ) : (
                          <ClockIcon className="h-3 w-3" />
                        )}
                        {log.anomaly_status || "Processing"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xl">
                        <div
                          className="truncate font-mono text-xs text-slate-600"
                          title={log.message}
                        >
                          {log.message}
                        </div>
                        {log.ai_explanation && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                            <span className="font-semibold text-primary/70">
                              AI Insight:
                            </span>{" "}
                            {log.ai_explanation}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {log.anomaly_status === "Anomaly" && (
                        <a
                          href={logsApi.getReportUrl(log._id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-primary shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                        >
                          <DocumentTextIcon className="h-4 w-4" /> Report
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Xai;
