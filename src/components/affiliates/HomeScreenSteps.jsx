// src/components/affiliates/HomeScreenSteps.jsx
// "Save to Your Home Screen" in the affiliate portal: two icons, "Affiliate Portal" (this
// page) and "Affiliate Link" (their share link), with plain iPhone and Android steps.
// Shown once the W-9 is signed (the link exists then).
import { useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Link2, MoreVertical, PlusSquare, Share } from 'lucide-react';
import { T } from '../SiteCopy';

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function Steps({ phone, name }) {
  const b = (t) => <b className="font-semibold text-[#0F2D6B]">{t}</b>;
  const steps = phone === 'iphone'
    ? [
      <>Tap {b('Share')} <Share className="inline h-4 w-4 align-[-2px] text-blue-700" aria-label="(the square with an arrow)" /> at the bottom of the screen.</>,
      <>Scroll down and tap <span className="whitespace-nowrap">{b('Add to Home Screen')} <PlusSquare className="inline h-4 w-4 align-[-2px] text-blue-700" aria-hidden="true" />.</span></>,
      <>It’s already named {b(name)}. Tap {b('Add')}.</>,
    ]
    : [
      <>Tap the {b('menu')} <MoreVertical className="inline h-4 w-4 align-[-2px] text-blue-700" aria-label="(three dots)" /> at the top right.</>,
      <>Tap {b('Add to Home screen')} (or {b('Install')}).</>,
      <>It’s already named {b(name)}. Tap {b('Add')}.</>,
    ];
  return (
    <ol className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-700">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-200">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

// Step 2 as a deck: one card per step, swipe or tap Next. `img` slots take real phone
// screenshots once we have them; until then each card shows its icon.
const DECK = {
  iphone: [
    { icon: Share, title: 'Tap Share', text: 'The square with an arrow, in the bar at the bottom of the screen.' },
    { icon: PlusSquare, title: 'Tap Add to Home Screen', text: 'Scroll down the list to find it.' },
    { icon: Check, title: 'Tap Add', text: 'It’s already named “Affiliate Portal.” Tap Add at the top right.' },
  ],
  android: [
    { icon: MoreVertical, title: 'Tap the Menu', text: 'The three dots at the top right.' },
    { icon: PlusSquare, title: 'Tap Add to Home Screen', text: 'It may say Install instead.' },
    { icon: Check, title: 'Tap Add', text: 'It’s already named “Affiliate Portal.” Tap Add.' },
  ],
};

function StepDeck({ phone, linkUrl, onDone }) {
  const cards = [...DECK[phone], {
    icon: Link2, title: 'Now Save Your Affiliate Link', text: 'That’s the page your friends see. Open it, then do the same 3 steps. It’s already named “Affiliate Link.”', link: true,
  }];
  const [i, setI] = useState(0);
  const start = useRef(null);
  const go = (n) => setI(Math.max(0, Math.min(cards.length - 1, n)));
  const c = cards[i];
  const Icon = c.icon;
  const behind = Math.min(2, cards.length - 1 - i);
  const last = i === cards.length - 1;
  return (
    <>
      <div className="relative mt-5" style={{ marginBottom: behind * 10 }}
        onPointerDown={e => { start.current = e.clientX; }}
        onPointerUp={e => { if (start.current == null) return; const dx = e.clientX - start.current; start.current = null; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); }}>
        {Array.from({ length: behind }).map((_, k) => (
          <div key={k} aria-hidden="true" className="absolute inset-0 rounded-2xl bg-blue-50 ring-1 ring-blue-100"
            style={{ transform: `translateY(${(k + 1) * 10}px) scale(${1 - (k + 1) * 0.05})`, opacity: 1 - k * 0.35, zIndex: 2 - k }} />
        ))}
        <div key={`${phone}-${i}`} role="group" aria-label={`Step ${i + 1} of ${cards.length}`}
          className="rc-deck-in relative z-10 touch-pan-y select-none rounded-2xl bg-white px-5 pb-6 pt-7 text-center shadow-[0_8px_24px_-12px_rgba(15,45,107,0.35)] ring-1 ring-slate-200">
          <span className="absolute right-3 top-3 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{i + 1} <T k="aff.deck.of">of</T> {cards.length}</span>
          {c.img
            ? <img src={c.img} alt="" className="mx-auto max-h-64 rounded-xl ring-1 ring-slate-200" />
            : <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100" aria-hidden="true"><Icon className="h-8 w-8" /></span>}
          <p className="mt-4 text-xl font-extrabold text-[#0F2D6B]"><T>{c.title}</T></p>
          <p className="mx-auto mt-1.5 max-w-xs text-[15px] leading-relaxed text-slate-600"><T>{c.text}</T></p>
          {c.link && (
            <a href={linkUrl} target="_blank" rel="noreferrer" className="qb qb-outline qb-md mt-4 w-full">
              <T k="aff.home.open-link">Open My Link</T> <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
        {cards.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-blue-600' : 'w-1.5 bg-slate-300'}`} />)}
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Back" className="qb qb-outline qb-lg px-4 disabled:opacity-40">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {last
          ? <button type="button" onClick={onDone} className="qb qb-blue qb-lg w-full"><T k="aff.home.done">Done</T></button>
          : <button type="button" onClick={() => go(i + 1)} className="qb qb-blue qb-lg w-full"><T k="aff.deck.next">Next</T> <ChevronRight className="h-5 w-5" aria-hidden="true" /></button>}
      </div>
    </>
  );
}

// asStep: onboarding step 2, right after the W-9, with Done and Skip for Now. Otherwise a
// collapsed how-to further down, for later.
export default function HomeScreenSteps({ linkUrl, asStep = false, onDone }) {
  const [phone, setPhone] = useState(() => (isAndroid() ? 'android' : 'iphone'));
  const tab = (key, label) => (
    <button type="button" role="tab" aria-selected={phone === key} onClick={() => setPhone(key)}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${phone === key ? 'bg-white text-[#0F2D6B] shadow-sm ring-1 ring-slate-200' : 'text-slate-500'}`}>
      {label}
    </button>
  );
  const body = (
    <>
      <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Your phone">
        {tab('iphone', 'iPhone')}{tab('android', 'Android')}
      </div>
      <div className="mt-4">
        <p className="font-semibold text-[#0F2D6B]">1. <T k="aff.home.portal">Affiliate Portal</T> <span className="font-normal text-slate-500"><T k="aff.home.portal-is">(this page)</T></span></p>
        <Steps phone={phone} name="Affiliate Portal" />
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="font-semibold text-[#0F2D6B]">2. <T k="aff.home.link">Affiliate Link</T> <span className="font-normal text-slate-500"><T k="aff.home.link-is">(the page people see)</T></span></p>
        <a href={linkUrl} target="_blank" rel="noreferrer" className="qb qb-outline qb-md mt-2.5 w-full">
          <T k="aff.home.open-link">Open My Link</T> <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        <p className="mt-2 text-sm text-slate-600"><T k="aff.home.then">Then, on that page:</T></p>
        <Steps phone={phone} name="Affiliate Link" />
      </div>
    </>
  );

  if (!asStep) {
    return (
      <details className="group mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          <T k="aff.home.title">Save to Your Home Screen</T>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <section aria-label="Save to Your Home Screen">{body}</section>
      </details>
    );
  }
  return (
    <section className="rounded-3xl bg-white px-5 py-7 text-center shadow-xl shadow-blue-900/10 ring-1 ring-slate-200" aria-labelledby="aff-home">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700"><T k="aff.home.step">Get Set Up · Step 2 of 2</T></p>
      <h2 id="aff-home" className="mt-3 text-2xl font-extrabold text-[#0F2D6B]"><T k="aff.home.title">Save to Your Home Screen</T></h2>
      <p className="mx-auto mt-1.5 max-w-xs text-[15px] leading-relaxed text-slate-600"><T k="aff.home.why">Two icons, so you can check your referrals and share your link in one tap.</T></p>
      <div className="mx-auto mt-4 flex max-w-[16rem] gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Your phone">
        {tab('iphone', 'iPhone')}{tab('android', 'Android')}
      </div>
      <div><StepDeck key={phone} phone={phone} linkUrl={linkUrl} onDone={onDone} /></div>
      <button type="button" onClick={onDone} className="mt-3 w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"><T k="aff.home.skip">Skip for Now</T></button>
    </section>
  );
}
