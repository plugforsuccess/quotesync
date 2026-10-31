// src/components/ConsumerNav.jsx
// The consumer site's top bar: the insuredbycam wordmark and the three consumer pages
// (Rate Check, Drivers Ed, Newsroom). It sits on the royal-blue hero of each page.
// ConsumerShell wraps pages that don't draw their own hero (the Newsroom) with the
// same bar on its own blue band and the light footer.

import { Link, Outlet, useLocation } from 'react-router-dom';
import { T } from './SiteCopy';

const ACCENT = '#39FF88';
const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';

// The agency's display name and license, as shown in every consumer page's footer.
const AGENCY = { name: 'Cam Wiley Insurance', license: '209488' };

const PAGES = [
  ['rate', '/', 'Rate Check'],
  ['drivers', '/courses', 'Drivers Ed'],
  ['news', '/news', 'Newsroom'],
];

export function ConsumerNav({ current }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-5 lg:pt-7">
      <Link to="/" className="text-[15px] font-extrabold tracking-tight text-white">insured<span style={{ color: ACCENT }}>by</span>cam</Link>
      <nav aria-label="insuredbycam" className="-mr-1.5 flex items-center whitespace-nowrap text-[13px] font-semibold sm:mr-0 sm:gap-1 sm:text-sm">
        {PAGES.map(([key, to, label]) => (key === current
          ? <span key={key} aria-current="page" className="rounded-full bg-white/10 px-2 py-1.5 text-white sm:px-3">{label}</span>
          : <Link key={key} to={to} className="rounded-full px-2 py-1.5 text-white/70 hover:bg-white/10 hover:text-white sm:px-3">{label}</Link>))}
      </nav>
    </header>
  );
}

/** Blue bar with the nav, the page, then the light footer. */
export function ConsumerShell() {
  const { pathname } = useLocation();
  const current = pathname.startsWith('/news') ? 'news' : pathname.startsWith('/courses') || pathname.startsWith('/defensive-driving') ? 'drivers' : 'rate';
  return (
    <div className="min-h-screen bg-white">
      <div style={{ background: HERO_BG }}>
        <div className="mx-auto max-w-6xl px-4 pb-5 lg:px-8 lg:pb-6"><ConsumerNav current={current} /></div>
      </div>
      <Outlet />
      <div className="border-t border-slate-200 bg-slate-50 pt-8"><RateCheckFooter wide /></div>
    </div>
  );
}

/** The light footer on every consumer page: other pages, legal links, the Allstate disclosure. */
export function RateCheckFooter({ padForBar = false, wide = false }) {
  return (
    <footer className={`mx-auto max-w-md px-4 text-xs leading-relaxed text-slate-500 ${padForBar ? 'pb-36' : 'pb-10'} ${wide ? 'sm:max-w-6xl lg:px-8' : ''}`}>
      <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="More from insuredbycam">
        <Link to="/courses" className="font-semibold text-slate-600 underline">Drivers Ed</Link>
        <Link to="/news" className="font-semibold text-slate-600 underline">Newsroom</Link>
      </nav>
      <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
        <Link to="/ratecheck-privacy" className="underline">Rate Check privacy notice</Link>
        <Link to="/privacy" className="underline">Privacy policy</Link>
        <Link to="/terms" className="underline">Terms</Link>
      </nav>
      {/* TODO(compliance): confirm the Allstate agency disclosure wording before launch. */}
      <p>
        <T k="rc.footer.disclosure">{`${AGENCY.name} is an Allstate Insurance Agency. Quotes and savings vary and are subject to underwriting and eligibility; not all applicants qualify.`}</T>
      </p>
      <p className="mt-1">Agency Resident License #: {AGENCY.license}</p>
    </footer>
  );
}
