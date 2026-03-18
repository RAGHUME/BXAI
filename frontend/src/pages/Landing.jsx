import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SparklesIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import logo from '../assets/bxai-logo.svg';
import heroImage from '../assets/hero-xai.svg';
import { apiClient } from '../api/client';

const features = [
  {
    title: 'Blockchain-Powered Chain of Custody',
    description:
      'Immutable ledgers trace every evidence handoff with unbreakable signatures and real-time auditability.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'Explainable AI Insights',
    description:
      'Narrative-driven intelligence makes complex model decisions transparent for every investigator.',
    icon: SparklesIcon,
  },
  {
    title: 'Secure Evidence Storage',
    description:
      'Zero-trust encryption, geo-resilient shards, and compliance-aware policies protect every artifact.',
    icon: CpuChipIcon,
  },
  {
    title: 'Real-Time Investigation Dashboard',
    description:
      'Pulse charts and anomaly beacons surface critical evidence health in a single command center.',
    icon: ChartBarIcon,
  },
];

const team = [
  {
    name: 'Prithviraj Patil',
    role: 'Frontend Developer',
    avatar: '',
  },
  {
    name: 'Raghavendra Mellennavar',
    role: 'Blockchain Architect',
    avatar: '',
  },
  {
    name: 'Siddharth Reddi',
    role: 'AI Explainability Developer',
    avatar: '',
  },
  {
    name: 'Rakesh Awati',
    role: 'Backend Developer',
    avatar: '',
  },
];

const aboutPoints = [
  {
    title: 'Ledger-grade authenticity',
    description: 'Every artifact is fingerprinted with SHA-256 and notarized on-chain for immutable traceability.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'Explainable intelligence',
    description: 'SHAP/LIME storytelling distills complex model outcomes into analyst-ready narratives.',
    icon: SparklesIcon,
  },
  {
    title: 'Secure collaboration fabric',
    description: 'Granular roles, custody receipts, and encrypted sharing keep joint investigations in sync.',
    icon: CpuChipIcon,
  },
];

const teamHighlights = [
  {
    name: 'Mrs.H.N. Ingaleshwar',
    role: 'Project Guide',
    avatar: '',
    summary:
      'Department of computer science and engineering.',
  },
  {
    name: 'Mrs.Gayatri Bajantri',
    role: 'Project Guide',
    avatar: '',
    summary:
      'Department of computer science and engineering.',
  },
];

const Landing = () => {
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [contactStatus, setContactStatus] = useState({ submitting: false, success: '', error: '' });

  const handleContactChange = useCallback((event) => {
    const { name, value } = event.target;
    setContactForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleContactSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (contactStatus.submitting) {
        return;
      }

      const name = contactForm.name.trim();
      const email = contactForm.email.trim();
      const message = contactForm.message.trim();

      if (!name || !email || !message) {
        setContactStatus({ submitting: false, success: '', error: 'Please complete all fields before submitting.' });
        return;
      }

      try {
        setContactStatus({ submitting: true, success: '', error: '' });
        await apiClient.post('/api/contact', { name, email, message });
        setContactForm({ name: '', email: '', message: '' });
        setContactStatus({ submitting: false, success: 'Thanks! Our team will reach out shortly.', error: '' });
      } catch (error) {
        setContactStatus({
          submitting: false,
          success: '',
          error: error.message || 'Unable to send your message right now. Please try again later.',
        });
      }
    },
    [contactForm, contactStatus.submitting]
  );

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-80" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <img alt="BXAI logo" className="h-12 w-12" src={logo} />
          <div>
            <p className="text-lg font-semibold text-primary">BXAI</p>
            <p className="text-sm text-text/70">Explainable Forensics Platform</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-text/80 lg:justify-end">
          <a className="transition hover:text-primary" href="#home">
            Home
          </a>
          <a className="transition hover:text-primary" href="#about">
            About
          </a>
          <a className="transition hover:text-primary" href="#features">
            Features
          </a>
          <a className="transition hover:text-primary" href="#team">
            Team
          </a>
          <a className="transition hover:text-primary" href="#contact">
            Contact Us
          </a>
          <Link
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
            to="/signin"
          >
            Login
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        <section id="home" className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 lg:flex-row lg:items-center">
          <div className="max-w-xl space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/65 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Digital Forensics Reinvented
            </span>
            <h1 className="text-4xl font-bold leading-tight text-primary sm:text-5xl lg:text-6xl">
              Explainable AI with Ledger-Level Trust
            </h1>
            <p className="text-base text-text/80 sm:text-lg">
              BXAI helps teams track evidence, surface insights, and collaborate with complete transparency.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                className="inline-flex items-center justify-center rounded-full bg-accent1 px-7 py-3 text-sm font-semibold text-white transition hover:bg-accent1/90"
                to="/signup"
              >
                Get Started
              </Link>
              <Link className="text-sm font-semibold text-primary transition hover:text-accent1" to="/signin">
                Existing users sign in
              </Link>
            </div>
          </div>
          <div className="relative mt-10 flex-1 lg:mt-0">
            <div className="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-card backdrop-blur">
              <img
                alt="Explainable AI illustration"
                className="w-full rounded-2xl object-cover"
                src={heroImage}
              />
            </div>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 rounded-[40px] border border-primary/10 bg-white/80 p-10 shadow-card backdrop-blur lg:grid-cols-[1.25fr_1fr] lg:p-12">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                Mission Brief
              </span>
              <h2 className="text-3xl font-bold text-primary sm:text-4xl">Where explainable AI meets tamper-proof custody</h2>
              <p className="text-base text-text/70 sm:text-lg">
                BXAI unifies evidence management, blockchain notarization, and interpretable AI so every decision is
                defensible. Operations teams orchestrate complex investigations while leadership gains instant assurance
                that every artifact, model output, and handoff is verified.
              </p>
              <div className="space-y-4">
                {aboutPoints.map(({ title, description, icon: Icon }) => (
                  <div key={title} className="flex gap-4 rounded-2xl border border-primary/10 bg-white/70 p-4 shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent1/10 text-accent1">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-primary">{title}</p>
                      <p className="mt-1 text-sm text-text/70">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-accent1/70 p-8 text-white shadow-2xl">
              <div className="space-y-3">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/90">
                  Operational posture
                </span>
                <h3 className="text-2xl font-semibold leading-snug">Human-guided evidence automation</h3>
                <p className="text-sm text-white/80">
                  BXAI blends analyst expertise with automation so teams can notarize, audit, and explain every artifact in
                  minutes—not days. Every workflow is auditable, every insight defensible.
                </p>
              </div>
              <ul className="space-y-3 text-sm text-white/85">
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-white" />
                  Instant SHA-256 hashing, blockchain anchoring, and custody receipts in one command console.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-white/80" />
                  Explainable AI overlays translate probabilistic model output into courtroom-ready language.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-white/70" />
                  Role-based collaboration keeps investigators, admins, and auditors aligned without sacrificing security.
                </li>
              </ul>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-xs font-semibold uppercase tracking-[0.35em] text-white/80">
                Trusted across digital forensics labs and compliance bureaus
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Capabilities
            </span>
            <h2 className="text-3xl font-bold text-primary sm:text-4xl">Built for confident collaboration</h2>
            <p className="max-w-3xl text-base text-text/70 sm:text-lg">
              Focused tools that help analysts secure, interpret, and share evidence without friction.
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {features.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="group relative overflow-hidden rounded-3xl border border-primary/10 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-card"
              >
                <div className="relative flex flex-col gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent1/10 text-accent1">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold text-primary">{title}</h3>
                  <p className="text-sm text-text/70">{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="team" className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Core Team
            </span>
            <h2 className="text-3xl font-bold text-primary sm:text-4xl">Researchers & Strategists</h2>
            <p className="max-w-3xl text-base text-text/70 sm:text-lg">
              The BXAI collective blends forensic, blockchain, and explainable AI expertise to support every case.
            </p>
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            {teamHighlights.map(({ name, role, avatar, summary }) => (
              <article
                key={name}
                className="group relative flex h-full flex-col gap-6 overflow-hidden rounded-3xl border border-primary/10 bg-white p-8 text-left shadow-md transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex items-center gap-5">
                  <img
                    alt={name}
                    className="h-20 w-20 rounded-3xl border-4 border-white object-cover shadow-lg"
                    src={avatar}
                  />
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">Leadership</p>
                    <h3 className="mt-1 text-2xl font-semibold text-primary">{name}</h3>
                    <p className="text-sm text-text/70">{role}</p>
                  </div>
                </div>
                <p className="text-sm text-text/70">{summary}</p>
                <div className="pointer-events-none absolute -right-12 top-1/4 h-44 w-44 rounded-full bg-primary/5 blur-3xl transition duration-300 group-hover:bg-accent1/10" />
              </article>
            ))}
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {team.map(({ name, role, avatar }) => (
              <article
                key={name}
                className="rounded-3xl border border-primary/10 bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-card"
              >
                <img
                  alt={name}
                  className="mx-auto h-24 w-24 rounded-full border-4 border-white object-cover shadow-lg"
                  src={avatar}
                />
                <h3 className="mt-6 text-lg font-semibold text-primary">{name}</h3>
                <p className="text-sm text-text/70">{role}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="mx-auto max-w-5xl px-6 pb-20">
          <div className="overflow-hidden rounded-3xl border border-primary/10 bg-white/80 shadow-card backdrop-blur">
            <div className="grid gap-12 p-8 lg:grid-cols-2 lg:gap-16">
              <div className="space-y-6">
                <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                  Contact
                </span>
                <h2 className="text-3xl font-bold text-primary">Partner with the XAI Evidence Lab</h2>
                <p className="text-base text-text/70">
                  Align with research leaders to co-design secure, transparent, and scalable digital forensics frameworks.
                  Reach out for pilot deployments, knowledge exchange, or to explore collaborative innovation tracks.
                </p>
                <div className="rounded-2xl border border-dashed border-primary/20 bg-white/70 p-4 text-sm text-text/60">
                  <p>Operational security is our priority. All inquiries receive encrypted communication pathways.</p>
                </div>
              </div>
              <form className="space-y-6" onSubmit={handleContactSubmit}>
                <div>
                  <label className="block text-sm font-semibold text-primary" htmlFor="name">
                    Name
                  </label>
                  <input
                    className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text shadow-inner transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                    id="name"
                    name="name"
                    onChange={handleContactChange}
                    placeholder="Your name"
                    type="text"
                    value={contactForm.name}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary" htmlFor="email">
                    Email
                  </label>
                  <input
                    className="mt-2 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text shadow-inner transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                    id="email"
                    name="email"
                    onChange={handleContactChange}
                    placeholder="you@example.com"
                    type="email"
                    value={contactForm.email}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary" htmlFor="message">
                    Message
                  </label>
                  <textarea
                    className="mt-2 h-32 w-full rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm text-text shadow-inner transition focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-accent1/30"
                    id="message"
                    name="message"
                    onChange={handleContactChange}
                    placeholder="Share your objectives or questions"
                    value={contactForm.message}
                  />
                </div>
                {contactStatus.error && (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                    {contactStatus.error}
                  </p>
                )}
                {contactStatus.success && (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">
                    {contactStatus.success}
                  </p>
                )}
                <button
                  className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
                  disabled={contactStatus.submitting}
                  type="submit"
                >
                  {contactStatus.submitting ? 'Sending…' : 'Send Message'}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/30 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 text-sm text-text/70 md:flex-row md:items-center md:justify-between">
          <p>© 2025 An Explainable AI and Blockchain Approach to Reinvent Digital Forensics and Evidence Management</p>
          <div className="flex flex-wrap items-center gap-4">
            <a className="transition hover:text-primary" href="#privacy">
              Privacy Policy
            </a>
            <a className="transition hover:text-primary" href="#terms">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  </div>
  );
};

export default Landing;
