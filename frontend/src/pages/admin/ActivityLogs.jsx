import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BoltIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  UserGroupIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useOutletContext } from "react-router-dom";
import { adminApi } from "../../api/admin";
import { logsApi } from "../../api/logs";

// --- HELPERS ---

const severityBadgeClass = (isCritical) =>
  isCritical
    ? "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200"
    : "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200";

const blockchainBadgeClass = (hasTx) =>
  hasTx
    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
    : "bg-slate-100 text-slate-500";

const formatDate = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return String(value);
  }
};

const durationLabel = (seconds) => {
  if (seconds == null) return "—";
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)} ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toFixed(0)}s`;
};

const ActionBadge = ({ log, onView }) => {
  const { actionType, isCritical, txHash } = log;
  const label = actionType ? actionType.replace(/_/g, " ") : "action";
  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold capitalize ${severityBadgeClass(
          isCritical
        )}`}
      >
        {isCritical ? (
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
        ) : (
          <ShieldCheckIcon className="h-3.5 w-3.5" />
        )}
        {label}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${blockchainBadgeClass(
          Boolean(txHash)
        )}`}
      >
        <BoltIcon className="h-3.5 w-3.5" />
        {txHash ? "Anchored" : "Not anchored"}
      </span>
      <button
        className="ml-auto rounded-full border border-primary/10 bg-white px-4 py-1 text-xs font-semibold text-primary transition hover:border-primary/30 hover:bg-primary/5"
        onClick={() => onView(log)}
        type="button"
      >
        View
      </button>
    </div>
  );
};

const ActivityLogs = () => {
  const { admin } = useOutletContext();

  // --- VIEW MODE STATE (New) ---
  const [viewMode, setViewMode] = useState("user"); // 'user' or 'system'

  // --- USER ACTIVITY STATE (Existing) ---
  const [filters, setFilters] = useState({
    q: "",
    userRole: "all",
    actionType: "all",
    isCritical: "all",
    hasTxHash: "all",
  });
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [stats, setStats] = useState({ total: 0, limit: 25, skip: 0 });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [anchoring, setAnchoring] = useState(false);
  const [downloading, setDownloading] = useState({ csv: false, pdf: false });

  // --- SYSTEM LOGS STATE (New) ---
  const [sysLogs, setSysLogs] = useState([]);
  const [sysLoading, setSysLoading] = useState(false);
  const [sysUploading, setSysUploading] = useState(false);
  const fileInputRef = useRef(null);

  // --- USER ACTIVITY LOGIC ---

  const computedParams = useMemo(() => {
    const params = {};
    if (filters.q) params.q = filters.q.trim();
    if (filters.userRole !== "all") params.userRole = filters.userRole;
    if (filters.actionType !== "all") params.actionType = filters.actionType;
    if (filters.isCritical !== "all") params.isCritical = filters.isCritical;
    if (filters.hasTxHash !== "all") params.hasTxHash = filters.hasTxHash;
    if (dateRange.from) params.dateFrom = dateRange.from;
    if (dateRange.to) params.dateTo = dateRange.to;
    params.limit = stats.limit;
    params.skip = stats.skip;
    return params;
  }, [filters, dateRange, stats.limit, stats.skip]);

  const loadLogs = useCallback(async () => {
    if (viewMode !== "user") return; // Only load if looking at user logs
    try {
      setLoading(true);
      setError("");
      const response = await adminApi.listActivityLogs(computedParams);
      setLogs(response.logs || []);
      setStats((prev) => ({ ...prev, total: response.total || 0 }));
    } catch (err) {
      setError(err.message || "Unable to load activity logs");
    } finally {
      setLoading(false);
    }
  }, [computedParams, viewMode]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setStats((prev) => ({ ...prev, skip: 0 }));
  };

  const handleDateChange = (event) => {
    const { name, value } = event.target;
    setDateRange((prev) => ({ ...prev, [name]: value }));
    setStats((prev) => ({ ...prev, skip: 0 }));
  };

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((stats.total || 0) / stats.limit)),
    [stats.total, stats.limit]
  );
  const currentPage = useMemo(
    () => Math.floor((stats.skip || 0) / stats.limit) + 1,
    [stats.skip, stats.limit]
  );

  const changePage = (direction) => {
    setStats((prev) => {
      const nextSkip = Math.max(0, prev.skip + direction * prev.limit);
      return { ...prev, skip: nextSkip };
    });
  };

  const handleExport = async (type) => {
    try {
      setDownloading((prev) => ({ ...prev, [type]: true }));
      const params = { ...computedParams };
      delete params.limit;
      delete params.skip;
      const blob =
        type === "csv"
          ? await adminApi.exportActivityLogsCsv(params)
          : await adminApi.exportActivityLogsPdf(params);

      if (!blob) return;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `activity-logs.${type === "csv" ? "csv" : "pdf"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err.message || `Unable to download ${type.toUpperCase()} export`
      );
    } finally {
      setDownloading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const handleAnchor = async (log) => {
    try {
      setAnchoring(true);
      await adminApi.anchorActivityLog(log._id);
      setSelected(null);
      await loadLogs();
    } catch (err) {
      setError(err.message || "Unable to anchor activity log");
    } finally {
      setAnchoring(false);
    }
  };

  // --- SYSTEM LOG LOGIC (New) ---

  const fetchSystemLogs = async () => {
    if (viewMode !== "system") return;
    setSysLoading(true);
    try {
      const data = await logsApi.getAlerts();
      setSysLogs(data);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setSysLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemLogs();
  }, [viewMode]);

  const handleLogUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSysUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      // Simple split by newline
      const logLines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

      try {
        await logsApi.ingestLogs(logLines);
        // Poll to update UI as logs get processed
        setTimeout(fetchSystemLogs, 1000);
        setTimeout(fetchSystemLogs, 3000);
      } catch (error) {
        alert("Failed to upload logs: " + error.message);
      } finally {
        setSysUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  // --- LOG DETAIL MODAL (User Activity) ---
  const LogDetails = useMemo(() => {
    if (!selected) return null;
    const { actionDetails = {}, blockchain = {} } = selected;
    const rows = Object.entries(selected).filter(
      ([key]) => !["actionDetails", "blockchain"].includes(key)
    );
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/40">
        <aside className="h-full w-full max-w-xl overflow-y-auto bg-white px-6 py-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary">Log detail</h2>
              <p className="text-xs text-text/50">
                Full telemetry for a single activity event.
              </p>
            </div>
            <button
              className="rounded-full border border-primary/10 bg-background px-3 py-1 text-xs font-semibold text-text/60 transition hover:border-primary/30 hover:text-primary"
              onClick={() => setSelected(null)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="mt-6 space-y-4">
            {rows.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-primary/10 bg-background px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-text/40">
                  {key}
                </p>
                <p className="mt-1 text-sm text-text/80">
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value ?? "—")}
                </p>
              </div>
            ))}
            <section className="space-y-4">
              <div className="rounded-2xl border border-primary/10 bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text/40">
                  Action details
                </p>
                <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-text/70">
                  {JSON.stringify(actionDetails, null, 2)}
                </pre>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-background px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text/40">
                  Blockchain
                </p>
                {blockchain && Object.keys(blockchain).length > 0 ? (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-text/70">
                    {JSON.stringify(blockchain, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-2 text-xs text-text/60">Not anchored yet</p>
                )}
              </div>
            </section>
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button
              className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary/30 hover:bg-primary/5"
              disabled={anchoring || selected.txHash}
              onClick={() => handleAnchor(selected)}
              type="button"
            >
              <BoltIcon
                className={`h-4 w-4 ${anchoring ? "animate-pulse" : ""}`}
              />
              {selected.txHash
                ? "Anchored"
                : anchoring
                ? "Anchoring…"
                : "Anchor log"}
            </button>
            <span className="text-xs text-text/50">
              TX Hash: {selected.txHash || "—"}
            </span>
          </div>
        </aside>
      </div>
    );
  }, [anchoring, selected]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-primary">
            System & Audit Logs
          </h1>
          <p className="text-sm text-text/60">
            Comprehensive feed of user activity and system health anomalies.
          </p>
        </div>

        {/* --- VIEW TOGGLE --- */}
        <div className="flex rounded-full border border-primary/10 bg-white p-1">
          <button
            onClick={() => setViewMode("user")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              viewMode === "user"
                ? "bg-primary text-white shadow-sm"
                : "text-text/60 hover:text-primary"
            }`}
          >
            <UserGroupIcon className="h-4 w-4" />
            User Activity
          </button>
          <button
            onClick={() => setViewMode("system")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              viewMode === "system"
                ? "bg-primary text-white shadow-sm"
                : "text-text/60 hover:text-primary"
            }`}
          >
            <CommandLineIcon className="h-4 w-4" />
            System Anomalies
          </button>
        </div>

        {/* Actions based on View Mode */}
        {viewMode === "user" && (
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white px-5 py-2 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/30 hover:bg-primary/5"
              disabled={downloading.csv}
              onClick={() => handleExport("csv")}
              type="button"
            >
              <ArrowDownTrayIcon
                className={`h-5 w-5 ${downloading.csv ? "animate-pulse" : ""}`}
              />
              {downloading.csv ? "Preparing CSV…" : "Export CSV"}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white px-5 py-2 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/30 hover:bg-primary/5"
              disabled={downloading.pdf}
              onClick={() => handleExport("pdf")}
              type="button"
            >
              <DocumentArrowDownIcon
                className={`h-5 w-5 ${downloading.pdf ? "animate-pulse" : ""}`}
              />
              {downloading.pdf ? "Preparing PDF…" : "Export PDF"}
            </button>
          </div>
        )}

        {viewMode === "system" && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchSystemLogs}
              className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white px-5 py-2 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/30 hover:bg-primary/5"
            >
              <ArrowPathIcon
                className={`h-5 w-5 ${sysLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 ${
                sysUploading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              <ArrowUpTrayIcon className="h-5 w-5" />
              {sysUploading ? "Analyzing..." : "Ingest Server Logs"}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".log,.txt"
                onChange={handleLogUpload}
                disabled={sysUploading}
              />
            </label>
          </div>
        )}
      </header>

      {/* --- USER ACTIVITY TABLE --- */}
      {viewMode === "user" && (
        <>
          <section className="rounded-3xl border border-primary/10 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <label className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-text/40" />
                <input
                  className="w-full rounded-2xl border border-primary/10 bg-background px-10 py-3 text-sm text-text transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  name="q"
                  onChange={handleFilterChange}
                  placeholder="Search events or users…"
                  type="search"
                  value={filters.q}
                />
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-primary/10 bg-background px-3 py-2 text-sm text-text">
                <FunnelIcon className="h-5 w-5 text-text/40" />
                <select
                  className="flex-1 bg-transparent focus:outline-none"
                  name="userRole"
                  onChange={handleFilterChange}
                  value={filters.userRole}
                >
                  <option value="all">Any role</option>
                  <option value="admin">Admin</option>
                  <option value="investigator">Investigator</option>
                  <option value="user">User</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-primary/10 bg-background px-3 py-2 text-sm text-text">
                <GlobeAltIcon className="h-5 w-5 text-text/40" />
                <select
                  className="flex-1 bg-transparent focus:outline-none"
                  name="actionType"
                  onChange={handleFilterChange}
                  value={filters.actionType}
                >
                  <option value="all">Any action</option>
                  <option value="login">Login</option>
                  <option value="logout">Logout</option>
                  <option value="session_expired">Session expired</option>
                  <option value="session_timeout">Session timeout</option>
                  <option value="admin_login">Admin login</option>
                  <option value="create_account">Create account</option>
                  <option value="create_case">Create case</option>
                  <option value="create_evidence">Create evidence</option>
                </select>
              </label>
              <select
                className="rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                name="isCritical"
                onChange={handleFilterChange}
                value={filters.isCritical}
              >
                <option value="all">Any severity</option>
                <option value="true">Critical only</option>
                <option value="false">Non-critical</option>
              </select>
              <select
                className="rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                name="hasTxHash"
                onChange={handleFilterChange}
                value={filters.hasTxHash}
              >
                <option value="all">Any blockchain status</option>
                <option value="true">Anchored only</option>
                <option value="false">Not anchored</option>
              </select>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-text/50">
                From
                <input
                  className="mt-1 w-full rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                  name="from"
                  onChange={handleDateChange}
                  type="datetime-local"
                  value={dateRange.from}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-text/50">
                To
                <input
                  className="mt-1 w-full rounded-2xl border border-primary/10 bg-background px-4 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                  name="to"
                  onChange={handleDateChange}
                  type="datetime-local"
                  value={dateRange.to}
                />
              </label>
            </div>
          </section>

          {error && (
            <p className="text-sm font-semibold text-rose-500">{error}</p>
          )}

          <section className="rounded-3xl border border-primary/10 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-primary/10">
                <thead className="bg-primary/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text/50">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text/50">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text/50">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text/50">
                      Request
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text/50">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/10">
                  {loading ? (
                    <tr>
                      <td
                        className="px-6 py-10 text-center text-sm text-text/60"
                        colSpan={5}
                      >
                        Loading activity logs…
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td
                        className="px-6 py-10 text-center text-sm text-text/60"
                        colSpan={5}
                      >
                        No activity logs found for selected filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const primaryIdentifier =
                        log.userEmail ||
                        log.actionDetails?.email ||
                        log.userId ||
                        "system";
                      const secondaryIdentifier =
                        log.userId && log.userId !== primaryIdentifier
                          ? log.userId
                          : null;
                      const roleLabel = log.userRole ? log.userRole : "unknown";

                      return (
                        <tr key={log._id} className="hover:bg-primary/5">
                          <td className="px-6 py-4 text-sm text-text/70">
                            <div className="space-y-1">
                              <p className="font-semibold text-primary">
                                {formatDate(log.timestampStart)}
                              </p>
                              <p className="text-xs text-text/50">
                                {formatDate(log.timestampEnd)}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-text/70">
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {primaryIdentifier}
                              </p>
                              {secondaryIdentifier && (
                                <p className="text-xs text-text/50">
                                  ID: {secondaryIdentifier}
                                </p>
                              )}
                              <p className="text-xs font-semibold text-text/60">
                                Role - {roleLabel}
                              </p>
                              <p className="text-xs text-text/50">
                                IP: {log.ipAddress || "—"}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-text/70">
                            <ActionBadge log={log} onView={setSelected} />
                          </td>
                          <td className="px-6 py-4 text-sm text-text/70">
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {log.requestMethod || "—"}{" "}
                                {log.requestPath || ""}
                              </p>
                              <p className="text-xs text-text/50">
                                Status: {log.statusCode ?? "—"}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-text/70">
                            <p>{durationLabel(log.durationSeconds)}</p>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <footer className="flex flex-col items-center justify-between gap-4 border-t border-primary/10 px-6 py-4 text-sm text-text/60 md:flex-row">
              <p>
                Showing{" "}
                <span className="font-semibold text-primary">
                  {logs.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-primary">
                  {stats.total}
                </span>{" "}
                events
              </p>
              <div className="flex items-center gap-3">
                <button
                  className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-white px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50"
                  disabled={currentPage <= 1}
                  onClick={() => changePage(-1)}
                  type="button"
                >
                  <ArrowPathIcon className="h-4 w-4 rotate-180" /> Previous
                </button>
                <span className="text-xs text-text/50">
                  Page{" "}
                  <span className="font-semibold text-primary">
                    {currentPage}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-primary">
                    {totalPages}
                  </span>
                </span>
                <button
                  className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-white px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50"
                  disabled={currentPage >= totalPages}
                  onClick={() => changePage(1)}
                  type="button"
                >
                  Next <ArrowPathIcon className="h-4 w-4" />
                </button>
              </div>
            </footer>
          </section>
          {LogDetails}
        </>
      )}

      {/* --- SYSTEM LOGS TABLE (New) --- */}
      {viewMode === "system" && (
        <section className="rounded-3xl border border-primary/10 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Distance
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
                      colSpan="4"
                      className="px-6 py-10 text-center text-sm text-slate-500"
                    >
                      Loading analysis results...
                    </td>
                  </tr>
                ) : sysLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan="4"
                      className="px-6 py-10 text-center text-sm text-slate-500"
                    >
                      No suspicious system logs found. Upload a log file to
                      begin analysis.
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
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            log.anomaly_status === "Anomaly"
                              ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20"
                              : log.anomaly_status === "Normal"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                              : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
                          }`}
                        >
                          {log.anomaly_status === "Anomaly" ? (
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                          )}
                          {log.anomaly_status || "Processing"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-600">
                        {typeof log.distance === "number"
                          ? log.distance.toFixed(4)
                          : "—"}
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
                            <DocumentTextIcon className="h-4 w-4" />
                            Report
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
      )}
    </div>
  );
};

export default ActivityLogs;
