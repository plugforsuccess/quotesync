// src/components/affiliates/HomeScreenSteps.jsx
// "Save to Your Home Screen" in the affiliate portal: two icons, "Affiliate Portal" (this
// page) and "Affiliate Link" (their share link), with plain iPhone and Android steps.
import { useState } from 'react';
import { ExternalLink, MoreVertical, PlusSquare, Share } from 'lucide-react';
import { T } from '../SiteCopy';

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function Steps({ phone, name }) {
  const b = (t) => <b className="font-semibold text-[#0F2D6B]">{t}</b>;
  const steps = phone === 'iphone'
    ? [
      <>Open it in {b('Safari')}.</>,
      <>Tap {b('Share')} <Share className="inline h-4 w-4 align-[-2px] text-blue-700" aria-label="(the square with an arrow)" /> at the bottom of the screen.</>,
      <>Scroll down and tap <span className="whitespace-nowrap">{b('Add to Home Screen')} <PlusSquare className="inline h-4 w-4 align-[-2px] text-blue-700" aria-hidden="true" />.</span></>,
      <>Check the name says {b(name)}, then tap {b('Add')}.</>,
    ]
    : [
      <>Open it in {b('Chrome')}.</>,
      <>Tap the {b('menu')} <MoreVertical className="inline h-4 w-4 align-[-2px] text-blue-700" aria-label="(three dots)" /> at the top right.</>,
      <>Tap {b('Add to Home screen')}, then {b('Add')} (or {b('Install')}).</>,
      <>Check the name says {b(name)}, then tap {b('Add')}.</>,
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

export default function HomeScreenSteps({ linkUrl, linkReady }) {
  const [phone, setPhone] = useState(() => (isAndroid() ? 'android' : 'iphone'));
  const tab = (key, label) => (
    <button type="button" role="tab" aria-selected={phone === key} onClick={() => setPhone(key)}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${phone === key ? 'bg-white text-[#0F2D6B] shadow-sm ring-1 ring-slate-200' : 'text-slate-500'}`}>
      {label}
    </button>
  );
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="aff-home">
      <h2 id="aff-home" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><T k="aff.home.title">Save to Your Home Screen</T></h2>
      <p className="mt-1 text-sm text-slate-600"><T k="aff.home.why">Two icons, so you can check your referrals and share your link in one tap.</T></p>
      <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Your phone">
        {tab('iphone', 'iPhone')}{tab('android', 'Android')}
      </div>

      <div className="mt-4">
        <p className="font-semibold text-[#0F2D6B]">1. <T k="aff.home.portal">Affiliate Portal</T> <span className="font-normal text-slate-500"><T k="aff.home.portal-is">(this page)</T></span></p>
        <Steps phone={phone} name="Affiliate Portal" />
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="font-semibold text-[#0F2D6B]">2. <T k="aff.home.link">Affiliate Link</T> <span className="font-normal text-slate-500"><T k="aff.home.link-is">(the page people see)</T></span></p>
        {linkReady ? (
          <>
            <a href={linkUrl} target="_blank" rel="noreferrer" className="qb qb-outline qb-md mt-2.5 w-full">
              <T k="aff.home.open-link">Open My Link</T> <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="mt-2 text-sm text-slate-600"><T k="aff.home.then">Then, on that page:</T></p>
            <Steps phone={phone} name="Affiliate Link" />
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500"><T k="aff.home.link-locked">Once your link unlocks, the steps for it show here.</T></p>
        )}
      </div>
    </section>
  );
}
