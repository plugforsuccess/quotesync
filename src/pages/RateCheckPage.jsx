// src/pages/RateCheckPage.jsx
// Public Rate Check landing page (insuredbycam.com/ratecheck).
// Consumer snaps their declarations page; rate-check extracts it and drops a
// lead in QuoteSync. Standalone route (no site Layout) to keep it light on mobile.

/* COPY REVIEW: submit this page to Allstate marketing compliance before paid traffic */

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { prepareDecPage, submitRateCheck, formatPhoneInput, lookupInvite, HOUSING_OPTIONS } from '../lib/rateCheckApi';

const CONSENT_TEXT =
  'I agree to receive a call and text messages about my insurance quote from Wiley-Wilson Agency / ' +
  'Allstate at the number provided. Msg & data rates may apply. Reply STOP to opt out. Consent is not ' +
  'a condition of purchase.';

// Optional, unchecked by default, and not required to submit.
const REFERRAL_CONSENT_TEXT =
  "Optional: if Allstate can't help, Wiley-Wilson Agency may share my name, number and policy details " +
  'with a trusted partner agency so they can quote me.';

const POLICY_LABELS = { auto: 'auto', home: 'home', renters: 'renters', condo: 'condo', umbrella: 'umbrella', commercial_auto: 'commercial auto', commercial: 'business' };

export default function RateCheckPage() {
  const { inviteCode } = useParams();
  const [invite, setInvite] = useState(null); // { first_name, phone, event_name, producer_name } from a producer's link
  const [inviteExpired, setInviteExpired] = useState(false);
  const cameraInput = useRef(null);
  const fileInput = useRef(null);
  // Every policy the customer adds — no cap. Each is sent (and read) on its own.
  const [policies, setPolicies] = useState([]); // [{ id, file, preview, error }]
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [housing, setHousing] = useState('');
  const [consent, setConsent] = useState(false);
  const [referralConsent, setReferralConsent] = useState(false);
  const [stage, setStage] = useState('form'); // form | sending | done
  const [progress, setProgress] = useState(null); // { current, total, waiting }
  const [error, setError] = useState('');
  const [results, setResults] = useState([]); // every policy received this visit

  useEffect(() => {
    document.title = 'Rate Check — Are you overpaying for insurance? | insuredbycam';
    window.scrollTo(0, 0);
  }, []);

  // A producer's tagged link: pre-fill what they typed at the booth.
  useEffect(() => {
    if (!inviteCode) return;
    let cancelled = false;
    lookupInvite(inviteCode).then(data => {
      if (cancelled) return;
      if (!data) { setInviteExpired(true); return; }
      setInvite(data);
      if (data.first_name) setFirstName(f => f || data.first_name);
      if (data.phone) setPhone(p => p || formatPhoneInput(data.phone));
    });
    return () => { cancelled = true; };
  }, [inviteCode]);

  // Revoke thumbnail object URLs when the page unmounts.
  const previewsRef = useRef(new Set());
  useEffect(() => () => { previewsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const onPick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setError('');
    setPolicies(list => [...list, ...picked.map(file => {
      const isImage = file.type.startsWith('image/') && !/heic|heif/i.test(file.type);
      const preview = isImage ? URL.createObjectURL(file) : null;
      if (preview) previewsRef.current.add(preview);
      return { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, file, preview, error: null };
    })]);
  };

  const removePolicy = (id) => {
    setPolicies(list => {
      const gone = list.find(p => p.id === id);
      if (gone?.preview) { URL.revokeObjectURL(gone.preview); previewsRef.current.delete(gone.preview); }
      return list.filter(p => p.id !== id);
    });
  };

  const phoneDigits = phone.replace(/\D/g, '');
  const missing = [
    !policies.length && 'a photo of your policy',
    !firstName.trim() && 'your first name',
    phoneDigits.length !== 10 && 'your mobile number',
    !/^\d{5}$/.test(zip) && 'your ZIP code',
    !housing && 'where you live',
  ].filter(Boolean);
  const canSubmit = missing.length === 0 && consent;
  const missingText = missing.length
    ? `Add ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0]}${consent ? '' : ', then tick the box above'}.`
    : !consent ? 'Tick the box above so we can text you.' : '';

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || stage === 'sending') return;
    setError('');
    setStage('sending');
    const consentGivenAt = new Date().toISOString();
    const referralConsentGivenAt = referralConsent ? consentGivenAt : null;
    const queue = policies;
    const sent = [];
    const failed = [];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setProgress({ current: i + 1, total: queue.length, waiting: false });
      try {
        const prepared = await prepareDecPage(item.file);
        const data = await submitWithRetry(() => submitRateCheck({
          prepared, firstName, phone: phoneDigits, zip, housingSituation: housing,
          consentGivenAt, referralConsentGivenAt, inviteCode: invite ? inviteCode : null,
        }), () => setProgress({ current: i + 1, total: queue.length, waiting: true }));
        sent.push({ id: item.id, data });
      } catch (err) {
        failed.push({ ...item, error: err.message || 'Something went wrong. Please try again.' });
      }
    }
    setProgress(null);
    if (sent.length) setResults(r => [...r, ...sent.map(s => s.data)]);
    // Sent policies leave the list; anything that failed stays so it can be retried.
    const sentIds = new Set(sent.map(s => s.id));
    setPolicies(list => list.filter(p => !sentIds.has(p.id)).map(p => failed.find(f => f.id === p.id) || p));
    if (failed.length) {
      setError(sent.length
        ? `We got ${sent.length} of ${queue.length}. ${failed.length === 1 ? 'One didn’t go through' : `${failed.length} didn’t go through`} — tap the button to try ${failed.length === 1 ? 'it' : 'them'} again.`
        : failed[0].error);
      setStage('form');
    } else {
      setStage('done');
      window.scrollTo(0, 0);
    }
  };

  if (stage === 'done') {
    const named = results.map(policyName);
    const heading = results.length === 1
      ? `Got it — we're checking ${named[0]} now.`
      : `Got it — we're checking your ${results.length} policies now.`;
    return (
      <Shell>
        <div className="text-center py-10" role="status">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl" aria-hidden="true">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{heading}</h1>
          {results.length > 1 && (
            <ul className="mb-3 space-y-1 text-gray-700">
              {named.map((n, i) => <li key={i}>{n.charAt(0).toUpperCase() + n.slice(1)}</li>)}
            </ul>
          )}
          <p className="text-gray-700">If we can beat {results.length === 1 ? 'it' : 'them'}, Cam will text you within the hour.</p>
        </div>
        <ol className="space-y-3 rounded-2xl bg-white p-5 text-left text-gray-700 shadow-sm">
          <li className="flex gap-3"><Step n={1} /> We price the same coverage with Allstate.</li>
          <li className="flex gap-3"><Step n={2} /> If we can save you money, Cam texts you the number.</li>
          <li className="flex gap-3"><Step n={3} /> If we can&apos;t, we&apos;ll say so. No spam, no pressure.</li>
        </ol>
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">Forgot one — a car, your home, a boat?</p>
          <button type="button" onClick={() => { setPolicies([]); setError(''); setStage('form'); window.scrollTo(0, 0); }}
            className="mt-2 rounded-xl border border-blue-700 px-4 py-3 text-base font-bold text-blue-700">
            Add more policies
          </button>
          <p className="mt-2 text-xs text-gray-500">Your name and number are kept. Bundling often saves the most.</p>
        </div>
      </Shell>
    );
  }

  const sending = stage === 'sending';
  const count = policies.length;

  return (
    <Shell>
      {invite && (
        <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {invite.producer_name ? `${invite.producer_name.split(' ')[0]} with Allstate` : 'Your Allstate agent'} sent you this link
          {invite.event_name ? ` after ${invite.event_name}` : ''}.{results.length ? '' : ' Takes about a minute.'}
        </p>
      )}
      {inviteExpired && (
        <p className="mb-4 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">That link has expired, but you can still check your rate below.</p>
      )}
      {results.length > 0 ? (
        <h1 className="text-2xl font-extrabold leading-tight text-gray-900">Add more policies</h1>
      ) : (
        <>
          <h1 className="text-3xl font-extrabold leading-tight text-gray-900">
            Overpaying for insurance? Find out in 60 seconds.
          </h1>
          <p className="mt-3 text-gray-700">
            Take a photo of each policy&apos;s first page — car, home, renters, all of them. A local Allstate agent compares
            them and texts you only if we can save you money.
          </p>
        </>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {/* Camera / files. The upload picker takes several at once. */}
        <input ref={cameraInput} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onPick} />
        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPick} />

        {count > 0 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-800">
              {count === 1 ? '1 policy added' : `${count} policies added`}
            </p>
            <ul className="space-y-2">
              {policies.map((p, i) => (
                <li key={p.id} className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${p.error ? 'border-red-300' : 'border-gray-200'}`}>
                  {p.preview ? (
                    <img src={p.preview} alt={`Policy ${i + 1}`} className="h-16 w-12 rounded border object-cover" />
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded border bg-gray-50 text-xs font-semibold text-gray-500">
                      {/pdf/i.test(p.file.type) ? 'PDF' : 'PHOTO'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">Policy {i + 1}</p>
                    <p className="truncate text-xs text-gray-500">{p.file.name || 'Declarations page'}</p>
                    {p.error && <p className="text-xs text-red-700">{p.error}</p>}
                  </div>
                  <button type="button" onClick={() => removePolicy(p.id)} disabled={sending}
                    className="rounded-lg px-2 py-2 text-sm font-semibold text-gray-600 underline" aria-label={`Remove policy ${i + 1}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => cameraInput.current?.click()} disabled={sending}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 px-3 py-3 text-sm font-bold text-blue-800">
                <Camera className="h-5 w-5" aria-hidden="true" /> Add another policy
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={sending}
                className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-700">
                Upload more
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => cameraInput.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-8 text-blue-800 active:bg-blue-100"
            >
              <Camera className="h-10 w-10" aria-hidden="true" strokeWidth={1.75} />
              <span className="text-lg font-bold">Take a photo of your policy</span>
              <span className="text-sm text-blue-700">The page with your price and coverages. You can add more after.</span>
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} className="mt-2 w-full text-center text-sm font-medium text-gray-600 underline">
              or upload photos or PDFs
            </button>
            <details className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
              <summary className="cursor-pointer font-medium text-gray-800">Which page do I need?</summary>
              <p className="mt-2">
                The one insurers call the <em>declarations page</em>, usually page 1. It shows your name, your cars or home,
                your coverages and your total price. Find it in your insurer&apos;s app, or in the email they sent when your
                policy started or renewed. A screenshot works.
              </p>
            </details>
          </div>
        )}

        <Field label="First name" htmlFor="rc-first">
          <input id="rc-first" autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)}
            className={inputCls} maxLength={60} disabled={sending} required />
        </Field>
        <Field label="Mobile number" htmlFor="rc-phone">
          <input id="rc-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(404) 555-1212"
            value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} className={inputCls} disabled={sending} required />
        </Field>
        <Field label="ZIP code" htmlFor="rc-zip">
          <input id="rc-zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="30094"
            value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} className={inputCls} disabled={sending} required />
        </Field>
        <Field label="Where do you live?" htmlFor="rc-housing">
          <select id="rc-housing" value={housing} onChange={e => setHousing(e.target.value)} className={inputCls} disabled={sending} required>
            <option value="">Choose one</option>
            {HOUSING_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>

        <label className="flex items-start gap-3 text-xs leading-relaxed text-gray-600">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" disabled={sending} required />
          <span>{CONSENT_TEXT}</span>
        </label>

        <label className="flex items-start gap-3 text-xs leading-relaxed text-gray-600">
          <input type="checkbox" checked={referralConsent} onChange={e => setReferralConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" disabled={sending} />
          <span>{REFERRAL_CONSENT_TEXT}</span>
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit || sending}
          className="w-full rounded-xl bg-blue-700 px-4 py-4 text-lg font-bold text-white shadow disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {sending
            ? (progress?.total > 1 ? `Reading policy ${progress.current} of ${progress.total}…` : 'Reading your policy…')
            : count > 1 ? `Check my ${count} policies` : 'Check my rate'}
        </button>
        {sending
          ? <p className="text-center text-sm text-gray-500" aria-live="polite">
              {progress?.waiting ? 'Almost there — finishing the rest in a few seconds.' : 'Each one takes about 10–20 seconds.'}
            </p>
          : !canSubmit && <p className="text-center text-sm text-gray-500" aria-live="polite">{missingText}</p>}
      </form>
    </Shell>
  );
}

function policyName(result) {
  const policy = POLICY_LABELS[result?.policy_type];
  return result?.carrier && result.carrier !== 'Other'
    ? `your ${result.carrier}${policy ? ` ${policy}` : ''} policy`
    : `your${policy ? ` ${policy}` : ''} policy`;
}

// A big household sent back to back can hit the per-minute limit; wait it out rather than fail.
async function submitWithRetry(send, onWait, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      if (!err?.rateLimited || attempt >= tries) throw err;
      onWait?.();
      await new Promise(r => setTimeout(r, 20_000));
    }
  }
}

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200';

function Step({ n }) {
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800" aria-hidden="true">{n}</span>;
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-gray-800">{label}</label>
      {children}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-md px-4 pt-8 pb-10">{children}</main>
      <RateCheckFooter />
    </div>
  );
}

export function RateCheckFooter() {
  return (
    <footer className="mx-auto max-w-md px-4 pb-10 text-xs leading-relaxed text-gray-500">
      <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        <Link to="/ratecheck-privacy" className="underline">Rate Check privacy notice</Link>
        <Link to="/privacy" className="underline">Privacy policy</Link>
        <Link to="/terms" className="underline">Terms</Link>
      </nav>
      {/* TODO(compliance): confirm the Allstate agency disclosure wording and the GA license number before launch. */}
      <p>
        Wiley-Wilson Agency is an Allstate agency. Quotes and savings vary and are subject to underwriting and
        eligibility; not all applicants qualify.
      </p>
      <p className="mt-1">GA License #: [LICENSE NUMBER]</p>
    </footer>
  );
}
