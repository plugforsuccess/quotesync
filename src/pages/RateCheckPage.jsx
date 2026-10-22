// src/pages/RateCheckPage.jsx
// Public Rate Check landing page (insuredbycam.com/ratecheck).
// Consumer snaps their declarations page; rate-check extracts it and drops a
// lead in QuoteSync. Standalone route (no site Layout) to keep it light on mobile.

/* COPY REVIEW: submit this page to Allstate marketing compliance before paid traffic */

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { prepareDecPage, submitRateCheck, formatPhoneInput, lookupInvite } from '../lib/rateCheckApi';

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
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [consent, setConsent] = useState(false);
  const [referralConsent, setReferralConsent] = useState(false);
  const [stage, setStage] = useState('form'); // form | sending | done
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

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

  // Revoke the thumbnail object URL when it changes or the page unmounts.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const onPick = (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setError('');
    setFile(picked);
    const isImage = picked.type.startsWith('image/') && !/heic|heif/i.test(picked.type);
    setPreview(isImage ? URL.createObjectURL(picked) : null);
  };

  const phoneDigits = phone.replace(/\D/g, '');
  const missing = [
    !file && 'a photo of your policy',
    !firstName.trim() && 'your first name',
    phoneDigits.length !== 10 && 'your mobile number',
    !/^\d{5}$/.test(zip) && 'your ZIP code',
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
    try {
      const prepared = await prepareDecPage(file);
      const data = await submitRateCheck({
        prepared,
        firstName,
        phone: phoneDigits,
        zip,
        consentGivenAt: new Date().toISOString(),
        referralConsentGivenAt: referralConsent ? new Date().toISOString() : null,
        inviteCode: invite ? inviteCode : null,
      });
      setResult(data);
      setStage('done');
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setStage('form');
    }
  };

  if (stage === 'done') {
    const policy = POLICY_LABELS[result?.policy_type];
    const what = result?.carrier && result.carrier !== 'Other'
      ? `your ${result.carrier}${policy ? ` ${policy}` : ''} policy`
      : `your${policy ? ` ${policy}` : ''} policy`;
    return (
      <Shell>
        <div className="text-center py-10" role="status">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl" aria-hidden="true">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Got it — we&apos;re checking {what} now.</h1>
          <p className="text-gray-700">If we can beat it, Cam will text you within the hour.</p>
        </div>
        <ol className="space-y-3 rounded-2xl bg-white p-5 text-left text-gray-700 shadow-sm">
          <li className="flex gap-3"><Step n={1} /> We price the same coverage with Allstate.</li>
          <li className="flex gap-3"><Step n={2} /> If we can save you money, Cam texts you the number.</li>
          <li className="flex gap-3"><Step n={3} /> If we can&apos;t, we&apos;ll say so. No spam, no pressure.</li>
        </ol>
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">Have another policy — a car, your home, a second car?</p>
          <button type="button" onClick={() => { setFile(null); setPreview(null); setResult(null); setStage('form'); window.scrollTo(0, 0); }}
            className="mt-2 rounded-xl border border-blue-700 px-4 py-3 text-base font-bold text-blue-700">
            Add another policy
          </button>
          <p className="mt-2 text-xs text-gray-500">Your name and number are kept. Bundling both often saves the most.</p>
        </div>
      </Shell>
    );
  }

  const sending = stage === 'sending';

  return (
    <Shell>
      {invite && (
        <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {invite.producer_name ? `${invite.producer_name.split(' ')[0]} with Allstate` : 'Your Allstate agent'} sent you this link
          {invite.event_name ? ` after ${invite.event_name}` : ''}.{result ? '' : ' Takes about a minute.'}
        </p>
      )}
      {inviteExpired && (
        <p className="mb-4 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">That link has expired, but you can still check your rate below.</p>
      )}
      <h1 className="text-3xl font-extrabold leading-tight text-gray-900">
        Overpaying for insurance? Find out in 60 seconds.
      </h1>
      <p className="mt-3 text-gray-700">
        Take a photo of your policy&apos;s first page. A local Allstate agent compares it and texts you only if we can save you money.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {/* Camera / file */}
        <input ref={cameraInput} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onPick} />
        <input ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPick} />

        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
            {preview ? (
              <img src={preview} alt="Your declarations page" className="h-20 w-16 rounded object-cover border" />
            ) : (
              <div className="flex h-20 w-16 items-center justify-center rounded border bg-gray-50 text-xs font-semibold text-gray-500">
                {/pdf/i.test(file.type) ? 'PDF' : 'PHOTO'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{file.name || 'Declarations page'}</p>
              <button type="button" onClick={() => cameraInput.current?.click()} className="text-sm font-semibold text-blue-700 underline" disabled={sending}>
                Retake
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
              <span className="text-sm text-blue-700">The page with your price and coverages</span>
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} className="mt-2 w-full text-center text-sm font-medium text-gray-600 underline">
              or upload a photo or PDF
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
          {sending ? 'Reading your policy…' : 'Check my rate'}
        </button>
        {sending
          ? <p className="text-center text-sm text-gray-500" aria-live="polite">This usually takes 10–20 seconds.</p>
          : !canSubmit && <p className="text-center text-sm text-gray-500" aria-live="polite">{missingText}</p>}
      </form>
    </Shell>
  );
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
