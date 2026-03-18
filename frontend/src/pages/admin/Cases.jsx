import React, { useEffect, useMemo, useState } from 'react';
import { PlusIcon, MagnifyingGlassIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../api/admin';

const statusChip = (status) => {
  switch (status) {
    case 'open':
      return 'bg-sky-100 text-sky-600';
    case 'closed':
      return 'bg-emerald-100 text-emerald-600';
    default:
      return 'bg-amber-100 text-amber-600';
  }
};

const Cases = () => {
  const [search, setSearch] = useState('');
  const [cases, setCases] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    caseNumber: '',
    status: 'open',
    description: '',
    assignedInvestigatorEmail: '',
  });

  useEffect(() => {
    const loadCases = async () => {
      try {
        setLoading(true);
        const response = await adminApi.listCases();
        setCases(response.cases || []);
        setError('');
        setInfo('');
      } catch (err) {
        setError(err.message || 'Unable to load cases');
      } finally {
        setLoading(false);
      }
    };

    loadCases();
  }, []);

  const visibleCases = useMemo(() => {
    return (cases || []).filter((item) => {
      const matchesSearch = item.title?.toLowerCase().includes(search.toLowerCase().trim());
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [cases, search, statusFilter]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateCase = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      const payload = {
        title: form.title,
        caseNumber: form.caseNumber,
        status: form.status,
        description: form.description,
        assignedInvestigatorEmail: form.assignedInvestigatorEmail,
      };
      const response = await adminApi.createCase(payload);
      setCases((prev) => [response.case, ...prev]);
      setForm({
        title: '',
        caseNumber: '',
        status: 'open',
        description: '',
        assignedInvestigatorEmail: '',
      });
      setShowModal(false);
    } catch (err) {
      setError(err.message || 'Unable to create case');
    } finally {
      setCreating(false);
    }
  };

  const triggerDownload = (blob, filename) => {
    if (!blob || typeof window === 'undefined') {
      return;
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadCasesReport = async () => {
    try {
      setDownloadingReport(true);
      setError('');
      setInfo('');
      const blob = await adminApi.downloadCasesReport();
      triggerDownload(blob, 'cases-report.pdf');
      setInfo('Cases report downloaded');
    } catch (err) {
      setError(err.message || 'Unable to download cases report');
    } finally {
      setDownloadingReport(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Cases</h1>
          <p className="mt-2 text-sm text-text/60">Modern caseboard for investigator tasking and oversight.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-5 py-3 text-sm font-semibold text-primary shadow transition hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDownloadCasesReport}
            type="button"
            disabled={downloadingReport}
          >
            <DocumentArrowDownIcon className={`h-5 w-5 ${downloadingReport ? 'animate-pulse' : ''}`} />
            {downloadingReport ? 'Preparing report…' : 'Download cases PDF'}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-primary/90"
            onClick={() => setShowModal(true)}
            type="button"
          >
            <PlusIcon className="h-5 w-5" />
            New Case
          </button>
        </div>
      </header>

      <div className="rounded-3xl border border-primary/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-text/40" />
            <input
              className="w-full rounded-2xl border border-primary/10 bg-background px-10 py-3 text-sm text-text transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases..."
              type="search"
              value={search}
            />
          </label>
          <div className="flex gap-2">
            <select
              className="rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="under_investigation">Under investigation</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-rose-500">{error}</p>}
      {info && !error && <p className="text-sm font-semibold text-emerald-600">{info}</p>}

      {loading ? (
        <div className="rounded-3xl border border-primary/10 bg-white p-10 text-center text-sm text-text/60 shadow-sm">
          Loading cases…
        </div>
      ) : visibleCases.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary/15 bg-white p-10 text-center text-sm text-text/60 shadow-sm">
          No cases found. Create a new case to begin tracking investigations.
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleCases.map((item) => (
            <article key={item._id} className="flex h-full flex-col rounded-3xl border border-primary/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-primary capitalize">{item.title}</h2>
                  <p className="text-xs text-text/50">Case {item.caseNumber}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusChip(item.status)}`}>
                  {item.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-4 flex-1 text-sm text-text/70">{item.description || 'No description provided.'}</p>
              <div className="mt-6 text-xs text-text/50">
                <span>Created {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</span>
              </div>
            </article>
          ))}
        </section>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-10">
          <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-primary">Create case</h2>
                <p className="text-sm text-text/60">Capture a new investigation record for your team.</p>
              </div>
              <button
                className="rounded-full border border-primary/10 bg-background px-3 py-1 text-xs font-semibold text-text/60 transition hover:border-primary/30 hover:text-primary"
                onClick={() => setShowModal(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <form className="mt-6 space-y-5" onSubmit={handleCreateCase}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-primary">
                  Case title
                  <input
                    className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    name="title"
                    onChange={handleChange}
                    placeholder="Digital breach investigation"
                    required
                    type="text"
                    value={form.title}
                  />
                </label>
                <label className="text-sm font-semibold text-primary">
                  Case number
                  <input
                    className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    name="caseNumber"
                    onChange={handleChange}
                    placeholder="BX-2025-001"
                    required
                    type="text"
                    value={form.caseNumber}
                  />
                </label>
              </div>
              <label className="text-sm font-semibold text-primary">
                Assign to investigator (email)
                <input
                  className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  name="assignedInvestigatorEmail"
                  onChange={handleChange}
                  placeholder="investigator@example.com"
                  type="email"
                  value={form.assignedInvestigatorEmail}
                />
                <span className="mt-1 block text-xs font-medium text-text/50">
                  Optional. Investigator must already exist in the directory.
                </span>
              </label>
              <label className="text-sm font-semibold text-primary">
                Status
                <select
                  className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  name="status"
                  onChange={handleChange}
                  value={form.status}
                >
                  <option value="open">Open</option>
                  <option value="under_investigation">Under investigation</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-primary">
                Description
                <textarea
                  className="mt-2 w-full rounded-2xl border border-primary/10 bg-background px-4 py-3 text-sm text-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  name="description"
                  onChange={handleChange}
                  placeholder="Provide investigators with mission context..."
                  rows={4}
                  value={form.description}
                />
              </label>
              <div className="flex items-center justify-end gap-3">
                <button
                  className="rounded-full border border-primary/10 bg-white px-5 py-2 text-sm font-semibold text-text/70 transition hover:border-primary/30 hover:text-primary"
                  onClick={() => setShowModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-primary/90"
                  disabled={creating}
                  type="submit"
                >
                  {creating ? 'Saving…' : 'Save case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cases;
