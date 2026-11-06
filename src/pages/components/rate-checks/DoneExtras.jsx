// The Rate Check confirmation screen's extras: the drawn check, the count-up
// total, the "what happens next" timeline, Cam's card with "Save my number",
// and a quiet share line. Every line of copy is editable in the copy editor.
import { useEffect, useState } from 'react';
import { UserPlus, Share2, Check } from 'lucide-react';
import { T } from '../../../components/SiteCopy';

// The number customers should save so the quote text isn't mistaken for spam.
// Confirm this is the number the quote texts come from.
const TEXT_FROM = { e164: '+17707861616', display: '(770) 786-1616' };

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A gold check drawn inside the navy badge. */
export function DrawnCheck({ small = false }) {
  return (
    <span className={`qc-badge ${small ? 'qc-badge-sm' : 'mb-4'}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className={small ? 'h-4 w-4' : 'h-8 w-8'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path className={small ? undefined : 'qc-check'} pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/** Counts up to `value` once (0.9s ease-out); jumps straight there with reduced motion. */
function useCountUp(value, ms = 900) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  useEffect(() => {
    if (reduced()) { setShown(value); return undefined; }
    let raf; const start = performance.now(); const from = 0;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (value - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** A number that counts up once, formatted by `format`. */
export function CountUp({ value, format }) {
  return format(useCountUp(value));
}

/** Received → pricing → text. `texting` = they allowed texts. */
export function NextTimeline({ texting, opensAt }) {
  const steps = [
    { key: 'got', state: 'done', title: <T k="rc.done.step1">Policy received</T>, line: <T k="rc.done.step1.line">Safely with Cam’s office.</T> },
    { key: 'price', state: 'now', title: <T k="rc.done.step2">Pricing the same coverage with Allstate</T>,
      line: opensAt ? <><T k="rc.done.step2.closed">Starts when the office opens</T> <span data-copy="fixed">{opensAt}</span>.</> : <T k="rc.done.step2.line">A licensed agent is on it.</T> },
    { key: 'text', state: 'next', title: texting ? <T k="rc.done.step3.text">Cam texts you the number</T> : <T k="rc.done.step3.reach">Cam’s team reaches out</T>,
      line: <T k="rc.done.step3.line">If we can’t get you a cheaper rate, we’ll say so.</T> },
  ];
  return (
    <ol className="qc-rise mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-left" style={{ animationDelay: '420ms' }}>
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-0.5 ${s.state === 'done' ? 'bg-[#F5D061]' : 'bg-slate-200'}`} aria-hidden="true" />}
          {s.state === 'done' ? <DrawnCheck small />
            : s.state === 'now' ? <span className="qc-pulse relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-[#F5D061]" /></span>
            : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white" aria-hidden="true" />}
          <div className="min-w-0 pt-0.5">
            <p className={`text-[15px] font-bold leading-snug ${s.state === 'next' ? 'text-slate-500' : 'text-[#0F2D6B]'}`}>{s.title}</p>
            <p className="mt-0.5 text-sm leading-snug text-slate-500">{s.line}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function saveContact() {
  const vcf = [
    'BEGIN:VCARD', 'VERSION:3.0',
    'N:Wiley;Cam;;;', 'FN:Cam Wiley (insuredbycam)', 'ORG:Cam Wiley Agency\\, Inc.',
    'TITLE:Licensed Allstate agent',
    `TEL;TYPE=CELL,VOICE:${TEXT_FROM.e164}`,
    'URL:https://insuredbycam.com',
    'NOTE:Your Rate Check quote will come from this number.',
    'END:VCARD', '',
  ].join('\r\n');
  const blob = new Blob([vcf], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Cam-Wiley.vcf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Cam's face, name, and one tap to save the number the text comes from. */
export function CamCard({ photo }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="qc-rise mt-5 flex items-center gap-3 rounded-2xl bg-white p-3.5 text-left ring-1 ring-slate-200" style={{ animationDelay: '520ms' }}>
      <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-[#F5D061]" />
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight text-[#0F2D6B]"><T k="rc.done.cam.name">Cam Wiley</T></p>
        <p className="text-sm leading-snug text-slate-500"><T k="rc.done.cam.line">Save my number so my text doesn’t look like spam.</T></p>
      </div>
      <button type="button" onClick={() => { saveContact(); setSaved(true); }} className="qb qb-outline qb-md shrink-0 px-3.5 text-sm">
        {saved ? <><Check className="h-4 w-4" aria-hidden="true" /> <T k="rc.done.cam.saved">Saved</T></>
          : <><UserPlus className="h-4 w-4" aria-hidden="true" /> <T k="rc.done.cam.save">Save</T></>}
      </button>
    </div>
  );
}

/** A quiet "know someone overpaying?" share line. */
export function ShareLine() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const data = { title: 'Cam Wiley Agency', text: 'Get a cheaper rate on your insurance:', url: 'https://insuredbycam.com' };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* dismissed */ }
  };
  return (
    <p className="qc-rise mt-5 text-center text-sm text-slate-500" style={{ animationDelay: '620ms' }}>
      <T k="rc.done.share.line">Know someone who might be overpaying?</T>{' '}
      <button type="button" onClick={share} className="inline-flex items-center gap-1 font-semibold text-blue-700 underline-offset-4 hover:underline">
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? <T k="rc.done.share.copied">Link Copied</T> : <T k="rc.done.share.cta">Share It</T>}
      </button>
    </p>
  );
}
