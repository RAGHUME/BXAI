import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  HomeModernIcon,
  FolderOpenIcon,
  DocumentDuplicateIcon,
  CubeTransparentIcon,
  CpuChipIcon,
  ShieldCheckIcon,
  UsersIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  MagnifyingGlassIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import logo from '../../assets/bxai-logo.svg';

const primaryNav = [
  { label: 'Dashboard', to: '/admin/dashboard', icon: HomeModernIcon, description: 'Command overview and live metrics' },
  { label: 'Cases', to: '/admin/cases', icon: FolderOpenIcon, description: 'Manage active and archived investigations' },
  { label: 'Evidence', to: '/admin/evidence', icon: DocumentDuplicateIcon, description: 'Review uploaded digital artifacts' },
  { label: 'Blockchain', to: '/admin/blockchain', icon: CubeTransparentIcon, description: 'Verify ledger status and custody reports' },
  { label: 'XAI', to: '/admin/xai', icon: CpuChipIcon, description: 'Inspect explainable AI reports' },
  { label: 'Chain of custody', to: '/admin/chain-of-custody', icon: ShieldCheckIcon, description: 'Track evidence provenance timelines and exports' },
  { label: 'Activity logs', to: '/admin/activity-logs', icon: BoltIcon, description: 'Audit trail of every console action and blockchain anchors' },
  { label: 'Users', to: '/admin/users', icon: UsersIcon, description: 'Administer admin and investigator accounts' },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    const storedAdmin = localStorage.getItem('bxaiAdmin') || sessionStorage.getItem('bxaiAdmin');
    if (!storedAdmin) {
      navigate('/signin');
      return;
    }

    setAdmin(JSON.parse(storedAdmin));
  }, [navigate]);

  const query = searchTerm.trim().toLowerCase();
  const searchResults = !query
    ? primaryNav.slice(0, 5)
    : primaryNav.filter(({ label, description }) => {
        const haystack = `${label} ${description || ''}`.toLowerCase();
        return haystack.includes(query);
      });

  const handleSignOut = () => {
    localStorage.removeItem('bxaiAdmin');
    sessionStorage.removeItem('bxaiAdmin');
    navigate('/signin');
  };

  const handleResultSelect = (item) => {
    navigate(item.to);
    setSearchTerm('');
    setSearchOpen(false);
    setHighlightIndex(0);
  };

  const handleSearchKeyDown = (event) => {
    if (!searchOpen || searchResults.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((previous) => (previous + 1) % searchResults.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((previous) => (previous - 1 + searchResults.length) % searchResults.length);
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      handleResultSelect(searchResults[highlightIndex]);
    }

    if (event.key === 'Escape') {
      setSearchOpen(false);
      setHighlightIndex(0);
    }
  };

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text">
        <p className="text-sm font-semibold text-primary">Loading admin workspace…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-text">
      <aside className="relative hidden w-72 flex-col justify-between bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 px-6 py-8 text-slate-100 shadow-2xl lg:flex">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
              <img alt="BXAI logo" className="h-8 w-8" src={logo} />
            </div>
            <div>
              <p className="text-lg font-semibold">BXAI Command</p>
              <p className="text-xs text-white/60">Forensics ops center</p>
            </div>
          </div>
          <nav className="space-y-1">
            {primaryNav.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-lg'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`
                }
                to={to}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-2xl transition ${
                        isActive ? 'bg-primary/10 text-primary' : 'bg-white/10 text-white'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="space-y-3 border-t border-white/10 pt-4">
          <button
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            type="button"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
              <Cog6ToothIcon className="h-5 w-5" />
            </span>
            Settings
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/10 hover:text-white"
            onClick={handleSignOut}
            type="button"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-rose-500/20 text-rose-200">
              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
            </span>
            Log out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-primary/10 bg-white/90 px-4 py-5 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="lg:hidden">
                <img alt="BXAI logo" className="h-10 w-10" src={logo} />
              </div>
              <div>
                <p className="text-base font-semibold text-primary">BXAI Forensics Console</p>
                <p className="text-xs text-text/60">Secure mission control surface</p>
              </div>
            </div>
            <div className="relative flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              <label className="relative flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text/40" />
                <input
                  autoComplete="off"
                  className="w-full rounded-2xl border border-primary/10 bg-background px-12 py-3 text-sm text-text transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSearchOpen(true);
                    setHighlightIndex(0);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search console..."
                  type="search"
                  value={searchTerm}
                />
              </label>
              {searchOpen && (
                <div className="absolute top-[72px] z-40 w-full rounded-2xl border border-primary/10 bg-white p-2 shadow-xl lg:top-full lg:mt-2 lg:w-[360px] lg:right-0">
                  {searchResults.length === 0 ? (
                    <p className="px-3 py-2 text-xs font-semibold text-text/50">No matches found. Try another keyword.</p>
                  ) : (
                    <ul className="space-y-1">
                      {searchResults.map((item, index) => {
                        const ResultIcon = item.icon;
                        return (
                          <li key={item.to}>
                            <button
                              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition ${
                                index === highlightIndex
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-text/70 hover:bg-primary/5 hover:text-primary'
                              }`}
                              onMouseEnter={() => setHighlightIndex(index)}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleResultSelect(item)}
                              type="button"
                            >
                              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                                <ResultIcon className="h-5 w-5" />
                              </span>
                              <span>
                                <span className="block text-sm font-semibold">{item.label}</span>
                                {item.description && (
                                  <span className="mt-1 block text-xs text-text/50">{item.description}</span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 rounded-2xl border border-primary/10 bg-white px-4 py-3 text-sm shadow-sm">
                <div>
                  <p className="font-semibold text-primary">{admin.name || 'BXAI Admin'}</p>
                  <p className="text-xs text-text/60">{admin.email}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 px-4 py-10">
          <div className="mx-auto max-w-7xl">
            <Outlet context={{ admin }} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
