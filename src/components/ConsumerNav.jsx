// src/components/ConsumerNav.jsx
// The consumer site's top bar: the insuredbycam wordmark and the three consumer pages
// (Rate Check, Drivers Ed, Newsroom). It sits on the royal-blue hero of each page.
// ConsumerShell wraps pages that don't draw their own hero (the Newsroom) with the
// same bar on its own blue band and the light footer.

import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { T, EditPagePencil } from './SiteCopy';

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
  // Wide screens: the page links inline. Phones: a ☰ button that opens a drawer.
  // The principal's pencil (edits this page) sits just left of it.
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <header className="flex items-center justify-between gap-2 pt-5 lg:pt-7">
      <Link to="/" className="text-[15px] font-extrabold tracking-tight text-white">insured<span style={{ color: ACCENT }}>by</span>cam.com</Link>
      <div className="flex items-center gap-1">
        <nav aria-label="insuredbycam" className="hidden items-center gap-1 whitespace-nowrap text-sm font-semibold sm:flex">
          {PAGES.map(([key, to, label]) => (key === current
            ? <span key={key} aria-current="page" className="rounded-full bg-white/10 px-3 py-1.5 text-white">{label}</span>
            : <Link key={key} to={to} className="rounded-full px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">{label}</Link>))}
        </nav>
        <EditPagePencil />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10 sm:hidden">
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] sm:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0" style={{ background: 'rgba(15,45,107,0.55)' }} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 right-0 flex w-[82%] max-w-xs flex-col shadow-2xl" style={{ background: HERO_BG }}>
            <div className="flex items-center justify-between px-5 pt-5">
              <span className="text-[15px] font-extrabold tracking-tight text-white">insured<span style={{ color: ACCENT }}>by</span>cam.com</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu"
                className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10">
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="insuredbycam" className="mt-6 flex flex-col gap-1 px-3">
              {PAGES.map(([key, to, label]) => (
                <Link key={key} to={to} onClick={() => setOpen(false)} aria-current={key === current ? 'page' : undefined}
                  className={`flex items-center justify-between rounded-xl px-4 py-3.5 text-lg font-bold ${key === current ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
                  {label}
                  {key === current && <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />}
                </Link>
              ))}
            </nav>
            <div className="mt-auto px-5 pb-8">
              <Link to="/" onClick={() => setOpen(false)} className="flex h-12 items-center justify-center rounded-xl text-base font-bold" style={{ background: ACCENT, color: '#0F2D6B' }}>
                Check my rate
              </Link>
            </div>
          </div>
        </div>
      )}
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
