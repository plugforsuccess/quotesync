// src/pages/RateCheckPage.jsx
// Public Rate Check landing page (insuredbycam.com/ratecheck, and /r/CODE for producer links).
// Consumer snaps their declarations pages; rate-check reads each one and drops a
// lead in QuoteSync. Standalone route (no site Layout) to keep it light on mobile.
//
// Flow: 1 Policies (add any number, each photo checked on the device for blur /
// darkness) → 2 You (contact + consent) → 3 Results (each policy is read live and
// shows what it found). Progress is saved on the device automatically — see
// lib/rateCheckDraft.js — so there is no "save and return" button to find.

/* COPY REVIEW: submit this page to Allstate marketing compliance before paid traffic */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, Camera, Check, ChevronLeft, FileText, Loader2, Lock, Plus, RotateCcw, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react';
import { prepareDecPage, submitRateCheck, formatPhoneInput, lookupInvite, sendOtp, verifyOtp, isEmail, HOUSING_OPTIONS } from '../lib/rateCheckApi';
import { assessPhoto } from '../lib/photoQuality';
import {
  saveDraftFields, saveDraftPhoto, removeDraftPhoto, loadDraft, clearDraft, saveSession, loadSession, clearSession,
} from '../lib/rateCheckDraft';

const CONSENT_TEXT =
  'I agree to receive a call and text messages about my insurance quote from Wiley-Wilson Agency / ' +
  'Allstate at the number provided. Msg & data rates may apply. Reply STOP to opt out. Consent is not ' +
  'a condition of purchase.';

// Optional, unchecked by default, and not required to submit.
const REFERRAL_CONSENT_TEXT =
  "Optional: if Allstate can't help, Wiley-Wilson Agency may share my name, number and policy details " +
  'with a trusted partner agency so they can quote me.';

const POLICY_LABELS = { auto: 'Auto', home: 'Home', renters: 'Renters', condo: 'Condo', umbrella: 'Umbrella', commercial_auto: 'Commercial auto', commercial: 'Business' };

// Texted-code verification of the mobile number: off while the agency tests; set
// VITE_RATE_CHECK_OTP=true (and RATE_CHECK_OTP_REQUIRED on the function) to turn it on.
const OTP_ENABLED = import.meta.env.VITE_RATE_CHECK_OTP === 'true';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const isActive = (s) => s === 'queued' || s === 'reading';

export default function RateCheckPage() {
  const { inviteCode } = useParams();
  const [invite, setInvite] = useState(null); // { first_name, phone, event_name, producer_name }
  const [inviteExpired, setInviteExpired] = useState(false);
  const cameraInput = useRef(null);
  const fileInput = useRef(null);
  const retakeTarget = useRef(null); // id of the card a Retake replaces

  const [step, setStep] = useState('policies'); // policies | you | results
  // { id, file, preview, quality, status: draft|queued|reading|read|unreadable|failed, result, error }
  const [items, setItems] = useState([]);
  const [fields, setFields] = useState({ firstName: '', phone: '', email: '', zip: '', housing: '' });
  // Text-message verification of the mobile number. The verified number is kept for
  // the tab session so a reload (or a second policy) doesn't ask again.
  const [otp, setOtp] = useState({ status: 'idle', code: '', error: '', sentAt: 0 }); // idle | sending | sent | verifying
  const [verifiedPhone, setVerifiedPhone] = useState(() => { try { return sessionStorage.getItem('rc_verified_phone') || ''; } catch { return ''; } });
  const [, tick] = useState(0);
  const [consent, setConsent] = useState(false);
  const [referralConsent, setReferralConsent] = useState(false);
  const [given, setGiven] = useState(null); // { consentGivenAt, referralConsentGivenAt } once sent this session
  const [resumed, setResumed] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);

  // The list is mirrored in a ref and every change goes through updateItems, so the
  // sender and the auto-save always see the latest list without waiting for a render.
  const itemsRef = useRef(items);
  const updateItems = useCallback((fn) => { itemsRef.current = fn(itemsRef.current); setItems(itemsRef.current); }, []);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const patch = useCallback((id, change) => updateItems(list => list.map(i => (i.id === id ? { ...i, ...change } : i))), [updateItems]);
  const checkQuality = useCallback((id, file) => {
    assessPhoto(file).then(q => patch(id, { quality: q }));
  }, [patch]);

  useEffect(() => {
    document.title = 'Rate Check — Are you overpaying for insurance? | insuredbycam';
    window.scrollTo(0, 0);
  }, []);

  // Restore: what was sent this tab session, then any unsent draft on this device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = loadSession();
      const draft = await loadDraft();
      if (cancelled) return;
      const sentBefore = session?.results?.length > 0;
      const restored = [];
      if (sentBefore) {
        restored.push(...session.results.map(r => ({ ...r, file: null, preview: null, quality: null })));
        setGiven({ consentGivenAt: session.consentGivenAt, referralConsentGivenAt: session.referralConsentGivenAt });
        setStep('results');
      }
      if (draft?.photos?.length) {
        restored.push(...draft.photos.map(p => ({ id: p.id, file: p.file, preview: previewFor(p.file), quality: null, status: 'draft' })));
      }
      const f = session?.fields || draft?.fields;
      if (f) setFields(prev => ({ firstName: f.firstName || prev.firstName, phone: f.phone || prev.phone, email: f.email || prev.email, zip: f.zip || prev.zip, housing: f.housing || prev.housing }));
      const draftHasContent = !!draft && (draft.photos.length > 0 || ['firstName', 'phone', 'email', 'zip', 'housing'].some(k => draft.fields?.[k]));
      if (draftHasContent && !sentBefore) setResumed(true);
      if (restored.length) {
        updateItems(() => restored);
        restored.filter(i => i.status === 'draft').forEach(i => checkQuality(i.id, i.file));
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [checkQuality, updateItems]);

  // A producer's tagged link: pre-fill what they typed at the booth (draft wins).
  useEffect(() => {
    if (!inviteCode) return;
    let cancelled = false;
    lookupInvite(inviteCode).then(data => {
      if (cancelled) return;
      if (!data) { setInviteExpired(true); return; }
      setInvite(data);
      setFields(f => ({ ...f, firstName: f.firstName || data.first_name || '', phone: f.phone || (data.phone ? formatPhoneInput(data.phone) : '') }));
    });
    return () => { cancelled = true; };
  }, [inviteCode]);

  // Save typed details as they change (never consent).
  useEffect(() => {
    if (!ready) return;
    if (given) saveSession({ ...currentSession(itemsRef.current, given), fields });
    else saveDraftFields(fields);
  }, [fields, ready, given]);

  // Revoke thumbnails on unmount.
  useEffect(() => () => itemsRef.current.forEach(i => i.preview && URL.revokeObjectURL(i.preview)), []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // ── Sending ──
  const sendQueue = async (ids, grant) => {
    const f = fieldsRef.current;
    for (const id of ids) {
      const it = itemsRef.current.find(i => i.id === id);
      if (!it?.file) continue;
      patch(id, { status: 'reading', error: null });
      try {
        const prepared = await prepareDecPage(it.file);
        const data = await submitWithRetry(() => submitRateCheck({
          prepared, firstName: f.firstName, phone: f.phone.replace(/\D/g, ''), email: f.email, zip: f.zip,
          housingSituation: f.housing, consentGivenAt: grant.consentGivenAt,
          referralConsentGivenAt: grant.referralConsentGivenAt, inviteCode: invite ? inviteCode : null,
        }));
        const unreadable = !data?.carrier && !data?.policy_type && data?.annual_premium == null;
        patch(id, { status: unreadable ? 'unreadable' : 'read', result: data });
        removeDraftPhoto(id);
      } catch (err) {
        patch(id, { status: 'failed', error: err.message || 'Didn’t go through.' });
      }
      saveSession({ ...currentSession(itemsRef.current, grant), fields: fieldsRef.current });
    }
    if (!itemsRef.current.some(i => i.status === 'draft')) clearDraft();
  };

  // ── Adding, replacing and removing policies ──
  const onPick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const target = retakeTarget.current;
    retakeTarget.current = null;
    if (!picked.length) return;
    navigator.vibrate?.(8);

    if (target) {
      const old = itemsRef.current.find(i => i.id === target);
      const file = picked[0];
      if (!old) return;
      if (old.preview) URL.revokeObjectURL(old.preview);
      const id = newId();
      if (old.status === 'draft') {
        removeDraftPhoto(old.id);
        updateItems(list => list.map(i => (i.id === target ? { id, file, preview: previewFor(file), quality: null, status: 'draft' } : i)));
        saveDraftPhoto({ id, file });
        checkQuality(id, file);
      } else {
        // Retaking a policy we couldn't read: send the new photo straight away.
        const next = { id, file, preview: previewFor(file), quality: null, status: 'queued' };
        updateItems(list => [...list.filter(i => i.id !== target), next]);
        checkQuality(id, file);
        sendQueue([id], given);
      }
      return;
    }

    const have = new Set(itemsRef.current.filter(i => i.file).map(i => fileKey(i.file)));
    const fresh = picked.filter(f => !have.has(fileKey(f)));
    if (fresh.length < picked.length) setNotice(fresh.length ? 'Skipped a photo you already added.' : 'You already added that one.');
    const added = fresh.map(file => ({ id: newId(), file, preview: previewFor(file), quality: null, status: 'draft' }));
    if (!added.length) return;
    updateItems(list => [...list, ...added]);
    added.forEach(i => { saveDraftPhoto(i); checkQuality(i.id, i.file); });
    if (step === 'results') setStep('policies');
  };

  const removeItem = (id) => {
    const it = itemsRef.current.find(i => i.id === id);
    if (it?.preview) URL.revokeObjectURL(it.preview);
    removeDraftPhoto(id);
    updateItems(list => list.filter(i => i.id !== id));
  };

  const openCamera = (replaceId = null) => { retakeTarget.current = replaceId; cameraInput.current?.click(); };
  const openFiles = () => { retakeTarget.current = null; fileInput.current?.click(); };

  const startOver = async () => {
    itemsRef.current.forEach(i => i.preview && URL.revokeObjectURL(i.preview));
    await clearDraft();
    clearSession();
    updateItems(() => []); setFields({ firstName: '', phone: '', email: '', zip: '', housing: '' });
    setOtp({ status: 'idle', code: '', error: '', sentAt: 0 });
    setConsent(false); setReferralConsent(false); setGiven(null); setResumed(false); setStep('policies');
    window.scrollTo(0, 0);
  };

  const drafts = items.filter(i => i.status === 'draft');
  const sent = items.filter(i => i.status !== 'draft');
  const phoneDigits = fields.phone.replace(/\D/g, '');
  const phoneVerified = !OTP_ENABLED || (phoneDigits.length === 10 && verifiedPhone === phoneDigits);
  const missing = [
    !fields.firstName.trim() && 'your first name',
    phoneDigits.length !== 10 && 'your mobile number',
    !isEmail(fields.email) && 'your email',
    !/^\d{5}$/.test(fields.zip) && 'your ZIP code',
    !fields.housing && 'where you live',
    phoneDigits.length === 10 && !phoneVerified && 'the code we texted you',
  ].filter(Boolean);
  const contactOk = missing.length === 0;

  // ── Mobile number verification ──
  const requestCode = async () => {
    setOtp(o => ({ ...o, status: 'sending', error: '' }));
    try {
      await sendOtp(phoneDigits);
      setOtp({ status: 'sent', code: '', error: '', sentAt: Date.now() });
    } catch (err) {
      setOtp(o => ({ ...o, status: o.sentAt ? 'sent' : 'idle', error: err.message }));
    }
  };
  const checkCode = async (code) => {
    setOtp(o => ({ ...o, status: 'verifying', error: '' }));
    try {
      await verifyOtp(phoneDigits, code);
      try { sessionStorage.setItem('rc_verified_phone', phoneDigits); } catch { /* private mode */ }
      setVerifiedPhone(phoneDigits);
      setOtp({ status: 'idle', code: '', error: '', sentAt: 0 });
      navigator.vibrate?.(8);
    } catch (err) {
      setOtp(o => ({ ...o, status: 'sent', error: err.message }));
    }
  };
  const canResend = Date.now() - otp.sentAt > 30_000;
  useEffect(() => {
    if (otp.status !== 'sent' || canResend) return undefined;
    const t = setTimeout(() => tick(n => n + 1), 30_500 - (Date.now() - otp.sentAt));
    return () => clearTimeout(t);
  }, [otp.status, otp.sentAt, canResend]);

  const submit = () => {
    if (!contactOk || !drafts.length) return;
    if (!given && !consent) return;
    const now = new Date().toISOString();
    const grant = given || { consentGivenAt: now, referralConsentGivenAt: referralConsent ? now : null };
    setGiven(grant);
    const ids = drafts.map(d => d.id);
    updateItems(list => list.map(i => (ids.includes(i.id) ? { ...i, status: 'queued' } : i)));
    setStep('results');
    window.scrollTo(0, 0);
    sendQueue(ids, grant);
  };

  const fileInputs = (
    <>
      <input ref={cameraInput} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onPick} data-testid="rc-camera" />
      <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPick} data-testid="rc-files" />
    </>
  );

  const banner = (
    <>
      {invite && (
        <p className="mb-4 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {invite.producer_name ? `${invite.producer_name.split(' ')[0]} with Allstate` : 'Your Allstate agent'} sent you this link
          {invite.event_name ? ` after ${invite.event_name}` : ''}.
        </p>
      )}
      {inviteExpired && (
        <p className="mb-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">That link has expired, but you can still check your rate below.</p>
      )}
      {resumed && step === 'policies' && (
        <p className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span>Welcome back — we kept your progress.</span>
          <button type="button" onClick={startOver} className="shrink-0 font-semibold underline">Start over</button>
        </p>
      )}
    </>
  );

  // ── Step 3: results ──
  if (step === 'results') {
    const reading = sent.some(i => isActive(i.status));
    const read = sent.filter(i => i.status === 'read');
    const priced = read.filter(i => i.result?.annual_premium != null);
    const total = priced.reduce((s, i) => s + i.result.annual_premium, 0);
    const policySlide = {
      key: 'policies',
      label: sent.length === 1 ? 'Your policy' : `Your ${sent.length} policies`,
      content: (
        <ul className="max-h-[15.5rem] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
          {sent.map((it, n) => (
            <ResultRow key={it.id} item={it} index={n} onRetake={() => openCamera(it.id)} onRetry={() => sendQueue([it.id], given)} />
          ))}
        </ul>
      ),
    };
    const slides = reading ? [policySlide] : [
      policySlide,
      {
        key: 'next',
        label: 'Next steps',
        content: (
          <ol className="space-y-2.5 text-[15px] leading-snug text-slate-700">
            <li className="flex gap-3"><Step n={1} /> We price the same coverage with Allstate.</li>
            <li className="flex gap-3"><Step n={2} /> If we can save you money, Cam texts you the number.</li>
            <li className="flex gap-3"><Step n={3} /> If we can&apos;t, we&apos;ll say so. No spam, no pressure.</li>
          </ol>
        ),
      },
      {
        key: 'more',
        label: 'Add more',
        untitled: true,
        content: (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-semibold text-slate-900">Got another policy?</p>
            <p className="mt-1 text-sm text-slate-600">A second car, your home, a boat. Bundling often saves the most.</p>
            <button type="button" onClick={() => { setStep('policies'); window.scrollTo(0, 0); }}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white shadow-sm active:bg-blue-800">
              <Plus className="h-5 w-5" aria-hidden="true" /> Add more policies
            </button>
          </div>
        ),
      },
    ];
    return (
      <Shell step={3} center>
        {fileInputs}
        {banner}
        <div role="status" aria-live="polite" className="text-center">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">
            {reading ? 'Reading your policies…' : 'Got it — Cam is on it.'}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-slate-600">
            {reading
              ? 'Each one takes about 10–20 seconds. Keep this screen open.'
              : 'If we can beat what you pay, Cam texts you within the hour.'}
          </p>
        </div>

        {priced.length > 0 && (
          <div className="mt-5 rounded-2xl bg-slate-900 px-5 py-4 text-center text-white">
            <p className="text-sm text-slate-300">You pay today</p>
            <p className="mt-0.5 text-4xl font-extrabold tracking-tight tabular-nums"><span data-testid="rc-total">{money(total)}</span><span className="text-lg font-semibold text-slate-300"> /yr</span></p>
            <p className="mt-1 text-sm text-slate-300">
              across {priced.length} {priced.length === 1 ? 'policy' : 'policies'}{reading ? ' so far' : ''} · the price to beat
            </p>
          </div>
        )}

        <Carousel slides={slides} className="mt-5" />

        {!reading && (
          <p className="mt-5 text-center text-sm text-slate-500">
            Not {fields.firstName || 'you'}? <button type="button" onClick={startOver} className="font-semibold underline">Start over</button>
          </p>
        )}
      </Shell>
    );
  }

  // ── Step 2: contact ──
  if (step === 'you') {
    const canSend = contactOk && consent && drafts.length > 0;
    const hint = missing.length
      ? `Add ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0]}${consent ? '' : ', then tick the box'}.`
      : !consent ? 'Tick the box so we can text you.' : '';
    return (
      <Shell step={2} bar={
        <ActionBar hint={canSend ? null : hint}>
          <button type="button" onClick={submit} disabled={!canSend} className={primaryBtn}>
            {drafts.length > 1 ? `Check my ${drafts.length} policies` : 'Check my rate'}
          </button>
        </ActionBar>
      }>
        {banner}
        <button type="button" onClick={() => setStep('policies')} className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {drafts.length === 1 ? '1 policy' : `${drafts.length} policies`}
        </button>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">Where should Cam text you?</h1>
        <p className="mt-2 text-slate-600">Only if we can beat your price. No call centers, ever.</p>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-6 space-y-4" noValidate>
          <Field label="First name" htmlFor="rc-first">
            <input id="rc-first" autoComplete="given-name" value={fields.firstName} maxLength={60} required
              onChange={e => setFields(f => ({ ...f, firstName: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Mobile number" htmlFor="rc-phone">
            <input id="rc-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(404) 555-1212" required
              value={fields.phone} className={inputCls}
              onChange={e => { setFields(f => ({ ...f, phone: formatPhoneInput(e.target.value) })); setOtp({ status: 'idle', code: '', error: '', sentAt: 0 }); }} />
          </Field>
          {OTP_ENABLED && phoneDigits.length === 10 && (phoneVerified ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700" role="status">
              <Check className="h-4 w-4" aria-hidden="true" /> Number verified
            </p>
          ) : !otp.sentAt ? (
            <div>
              <button type="button" onClick={requestCode} disabled={otp.status === 'sending'}
                className="h-12 w-full rounded-xl border border-blue-700 bg-white px-4 font-semibold text-blue-700 disabled:opacity-60">
                {otp.status === 'sending' ? 'Sending…' : 'Text me a code'}
              </button>
              <p className="mt-1.5 px-1 text-xs text-slate-500">We text a 6-digit code to confirm it&apos;s you.</p>
              {otp.error && <p className="mt-1 px-1 text-sm text-red-600" role="alert">{otp.error}</p>}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label htmlFor="rc-code" className="block text-sm font-semibold text-slate-800">Enter the 6-digit code we texted to {fields.phone}</label>
              <div className="mt-2 flex gap-2">
                <input id="rc-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={otp.code}
                  className={`${inputCls} tracking-[0.25em]`}
                  onChange={e => {
                    const code = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtp(o => ({ ...o, code, error: '' }));
                    if (code.length === 6) checkCode(code);
                  }} />
                <button type="button" onClick={() => checkCode(otp.code)} disabled={otp.code.length !== 6 || otp.status === 'verifying'}
                  className="h-12 shrink-0 rounded-xl bg-blue-700 px-4 font-semibold text-white disabled:opacity-50">
                  {otp.status === 'verifying' ? 'Checking…' : 'Verify'}
                </button>
              </div>
              {otp.error && <p className="mt-2 text-sm text-red-600" role="alert">{otp.error}</p>}
              <button type="button" onClick={requestCode} disabled={!canResend || otp.status === 'sending'}
                className="mt-2 text-xs font-semibold text-slate-600 underline disabled:no-underline disabled:opacity-60">
                {otp.status === 'sending' ? 'Sending…' : canResend ? 'Send a new code' : 'Send a new code in 30 seconds'}
              </button>
            </div>
          ))}
          <Field label="Email" htmlFor="rc-email">
            <input id="rc-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" required
              value={fields.email} onChange={e => setFields(f => ({ ...f, email: e.target.value }))} className={inputCls} />
          </Field>
          <div className="grid grid-cols-[7.5rem_1fr] gap-3">
            <Field label="ZIP code" htmlFor="rc-zip">
              <input id="rc-zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="30094" required
                value={fields.zip} onChange={e => setFields(f => ({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 5) }))} className={inputCls} />
            </Field>
            <Field label="Where do you live?" htmlFor="rc-housing">
              <select id="rc-housing" value={fields.housing} required onChange={e => setFields(f => ({ ...f, housing: e.target.value }))} className={inputCls}>
                <option value="">Choose one</option>
                {HOUSING_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" required />
            <span>{CONSENT_TEXT}</span>
          </label>
          <label className="flex items-start gap-3 px-3 text-xs leading-relaxed text-slate-500">
            <input type="checkbox" checked={referralConsent} onChange={e => setReferralConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
            <span>{REFERRAL_CONSENT_TEXT}</span>
          </label>
          <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Your photos go only to Cam&apos;s office and are deleted after 90 days.
          </p>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Shell>
    );
  }

  // ── Step 1: policies ──
  const returning = sent.length > 0 && !!given;
  const goNext = () => {
    if (!drafts.length) return;
    if (returning && contactOk) { submit(); return; }
    setStep('you');
    window.scrollTo(0, 0);
  };
  return (
    <Shell step={1} bar={drafts.length > 0 && (
      <ActionBar hint={drafts.some(d => d.quality?.issue) ? 'Blurry or dark? Retake, or send anyway.' : null}>
        <button type="button" onClick={() => openCamera()} aria-label="Take another photo"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700">
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
        <button type="button" onClick={goNext} className={primaryBtn}>
          {returning ? (drafts.length === 1 ? 'Send it' : `Send all ${drafts.length}`) : 'Continue'}
          <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-sm tabular-nums">{drafts.length}</span>
        </button>
      </ActionBar>
    )}>
      {fileInputs}
      {banner}
      {returning && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          {sent.length === 1 ? '1 policy already sent.' : `${sent.length} policies already sent.`}
          <button type="button" onClick={() => setStep('results')} className="ml-auto font-semibold underline">View</button>
        </p>
      )}

      {drafts.length === 0 ? (
        <>
          {returning ? (
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">Add another policy</h1>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Free rate check · Georgia</p>
              <h1 className="mt-2 text-[32px] font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Overpaying for insurance? Find out in 60 seconds.
              </h1>
              <p className="mt-3 text-slate-600">
                Snap the first page of each policy — car, home, renters, all of them. A local Allstate agent compares them
                and texts you only if we can save you money.
              </p>
            </>
          )}

          <button type="button" onClick={() => openCamera()}
            className="mt-6 flex w-full flex-col items-center justify-center gap-3 rounded-3xl bg-blue-700 px-6 py-9 text-white shadow-lg shadow-blue-700/20 active:scale-[0.99] active:bg-blue-800">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
              <Camera className="h-8 w-8" aria-hidden="true" strokeWidth={1.75} />
            </span>
            <span className="text-xl font-bold">Snap your policy</span>
            <span className="text-sm text-blue-100">Add as many as you like</span>
          </button>
          <button type="button" onClick={openFiles}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 font-semibold text-slate-700">
            <Upload className="h-5 w-5" aria-hidden="true" /> Upload photos or PDFs
          </button>

          <ul className="mt-6 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
            <Trust icon={Sparkles} label="Read in seconds" />
            <Trust icon={ShieldCheck} label="No spam calls" />
            <Trust icon={Lock} label="Private & secure" />
          </ul>

          <details className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <summary className="cursor-pointer font-semibold text-slate-800">Which page do I need?</summary>
            <p className="mt-2">
              The one insurers call the <em>declarations page</em>, usually page 1. It shows your name, your cars or home,
              your coverages and your total price. Find it in your insurer&apos;s app, or in the email they sent when your
              policy started or renewed. A screenshot works.
            </p>
          </details>
        </>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">Your policies</h1>
            <span className="pb-1 text-sm font-semibold text-slate-500 tabular-nums">
              {drafts.length === 1 ? '1 added' : `${drafts.length} added`}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">One photo per policy. Add every car, home and renters policy you have.</p>

          <ul className="mt-5 space-y-3">
            {drafts.map((it, n) => (
              <DraftCard key={it.id} item={it} index={n} onRetake={() => openCamera(it.id)} onRemove={() => removeItem(it.id)} />
            ))}
            <li className="flex gap-2">
              <button type="button" onClick={() => openCamera()}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 font-semibold text-blue-800 active:bg-blue-100">
                <Camera className="h-5 w-5" aria-hidden="true" /> Add another policy
              </button>
              <button type="button" onClick={openFiles} aria-label="Upload more"
                className="flex w-16 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-700">
                <Upload className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </>
      )}

      {notice && <p className="mt-4 rounded-xl bg-slate-900 px-3 py-2 text-center text-sm text-white" role="status">{notice}</p>}
    </Shell>
  );
}

function currentSession(items, given) {
  return {
    consentGivenAt: given?.consentGivenAt,
    referralConsentGivenAt: given?.referralConsentGivenAt,
    results: items.filter(i => i.status === 'read' || i.status === 'unreadable')
      .map(i => ({ id: i.id, status: i.status, result: i.result })),
  };
}

function previewFor(file) {
  const isImage = file?.type?.startsWith('image/') && !/heic|heif/i.test(file.type);
  return isImage ? URL.createObjectURL(file) : null;
}

// A big household sent back to back can hit the per-minute limit; wait it out rather than fail.
async function submitWithRetry(send, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      if (!err?.rateLimited || attempt >= tries) throw err;
      await new Promise(r => setTimeout(r, 20_000));
    }
  }
}

// ── Pieces ──

function Thumb({ item, scanning = false, small = false }) {
  return (
    <div className={`relative ${small ? 'h-14 w-11' : 'h-[72px] w-14'} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50`}>
      {item.preview
        ? <img src={item.preview} alt="" className="h-full w-full object-cover" />
        : <div className="flex h-full w-full items-center justify-center text-slate-400"><FileText className="h-6 w-6" aria-hidden="true" /></div>}
      {scanning && (
        <>
          <div className="absolute inset-0 bg-blue-600/10" />
          <div className="rc-scan absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-blue-500/60 to-transparent" />
        </>
      )}
    </div>
  );
}

function QualityLine({ item }) {
  const q = item.quality;
  if (!q) return <span className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Checking photo…</span>;
  if (q.issue === 'dark') return <span className="inline-flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Too dark</span>;
  if (q.issue === 'blurry') return <span className="inline-flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Blurry</span>;
  if (!q.checked) return <span className="text-slate-500">{/pdf/i.test(item.file?.type || '') ? 'PDF ready' : 'Ready'}</span>;
  return <span className="inline-flex items-center gap-1.5 text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Clear</span>;
}

function DraftCard({ item, index, onRetake, onRemove }) {
  const warn = !!item.quality?.issue;
  return (
    <li className={`flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm ${warn ? 'border-amber-300' : 'border-slate-200'}`}>
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">Policy {index + 1}</p>
        <p className="mt-0.5 text-sm"><QualityLine item={item} /></p>
      </div>
      <button type="button" onClick={onRetake} aria-label={`Retake policy ${index + 1}`}
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${warn ? 'bg-amber-100 text-amber-800' : 'text-slate-500'}`}>
        <RotateCcw className="h-5 w-5" aria-hidden="true" />
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove policy ${index + 1}`}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500">
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </li>
  );
}

// One policy on the results screen: a compact row that goes queued → reading → what it found.
function ResultRow({ item, index, onRetake, onRetry }) {
  const r = item.result;
  const active = isActive(item.status);
  const line = POLICY_LABELS[r?.policy_type];
  const carrier = r?.carrier && r.carrier !== 'Other' ? r.carrier : null;
  let title = `Policy ${index + 1}`;
  let detail = null;
  if (item.status === 'read') {
    title = carrier || 'Policy read';
    detail = <span className="text-slate-600">{[line, r?.annual_premium != null ? `${money(r.annual_premium)}/yr` : null].filter(Boolean).join(' · ') || 'Received'}</span>;
  } else if (active) {
    detail = <span className="inline-flex items-center gap-1.5 text-blue-700"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{item.status === 'queued' ? 'Waiting…' : 'Reading…'}</span>;
  } else if (item.status === 'unreadable') {
    title = 'Couldn’t read it';
    detail = <span className="text-slate-600">Cam will check it</span>;
  } else if (item.status === 'failed') {
    title = `Policy ${index + 1} didn’t send`;
    detail = <span className="text-red-700">{item.error}</span>;
  }
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      {item.status === 'read' && !item.preview
        ? <Monogram name={carrier || line || 'Policy'} />
        : <Thumb item={item} scanning={active} small />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{title}</p>
        <p className="truncate text-sm">{detail}</p>
      </div>
      {item.status === 'read' && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-label="Received">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
      {item.status === 'unreadable' && (
        <button type="button" onClick={onRetake} className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900">Retake</button>
      )}
      {item.status === 'failed' && (
        <button type="button" onClick={item.file ? onRetry : onRetake} className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800">
          {item.file ? 'Try again' : 'Retake'}
        </button>
      )}
    </li>
  );
}

// Swipeable sections (native scroll-snap, so touch, trackpad and keyboard all work).
// The next slide peeks in from the right so it reads as swipeable; the dots jump.
function Carousel({ slides, className = '' }) {
  const track = useRef(null);
  const [active, setActive] = useState(0);
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const kids = [...el.children];
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) { setActive(kids.length - 1); return; }
    let best = 0;
    kids.forEach((k, i) => { if (Math.abs(k.offsetLeft - el.scrollLeft) < Math.abs(kids[best].offsetLeft - el.scrollLeft)) best = i; });
    setActive(best);
  };
  const go = (i) => {
    const el = track.current;
    const kid = el?.children[i];
    if (kid) el.scrollTo({ left: kid.offsetLeft, behavior: 'smooth' });
    setActive(i);
  };
  const many = slides.length > 1;
  return (
    <section className={className} aria-roledescription="carousel" aria-label="Your rate check">
      <div ref={track} onScroll={onScroll}
        className={`rc-track relative flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto ${many ? '' : 'justify-center'}`}>
        {slides.map((s, i) => (
          <div key={s.key} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.label}`}
            className={`${many ? 'w-[88%]' : 'w-full'} shrink-0 snap-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
            {!s.untitled && <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{s.label}</p>}
            {s.content}
          </div>
        ))}
      </div>
      {many && (
        <div className="mt-2 flex justify-center">
          {slides.map((s, i) => (
            <button key={s.key} type="button" onClick={() => go(i)} aria-label={`Show ${s.label}`} aria-current={i === active}
              className="flex h-8 items-center px-1">
              <span className={`block h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-blue-700' : 'w-1.5 bg-slate-300'}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const MONO_TONES = ['bg-blue-100 text-blue-800', 'bg-emerald-100 text-emerald-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800'];
function Monogram({ name }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const tone = MONO_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % MONO_TONES.length];
  return <div className={`flex h-14 w-11 shrink-0 items-center justify-center rounded-lg text-base font-extrabold ${tone}`} aria-hidden="true">{initials}</div>;
}

function Trust({ icon: Icon, label }) {
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-xl bg-white px-2 py-3 ring-1 ring-slate-200">
      <Icon className="h-5 w-5 text-blue-700" aria-hidden="true" />
      <span className="font-medium">{label}</span>
    </li>
  );
}

function ActionBar({ children, hint }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto max-w-md px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {hint && <p className="mb-2 text-center text-xs text-slate-500" aria-live="polite">{hint}</p>}
        <div className="flex gap-2">{children}</div>
      </div>
    </div>
  );
}

const primaryBtn =
  'flex h-14 flex-1 items-center justify-center rounded-xl bg-blue-700 px-4 text-lg font-bold text-white shadow-sm active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300';

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';

function Step({ n }) {
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800" aria-hidden="true">{n}</span>;
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</label>
      {children}
    </div>
  );
}

const STEPS = ['Policies', 'You', 'Results'];
function Shell({ children, step, bar, center = false }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <style>{'@keyframes rc-scan{0%{top:-25%}100%{top:100%}}.rc-scan{animation:rc-scan 1.4s ease-in-out infinite}.rc-track{scrollbar-width:none}.rc-track::-webkit-scrollbar{display:none}@media (prefers-reduced-motion: reduce){.rc-scan{animation:none;top:40%}}'}</style>
      <header className="mx-auto flex max-w-md items-center justify-between px-4 pt-5">
        <span className="text-sm font-extrabold tracking-tight text-slate-900">insuredbycam <span className="font-semibold text-slate-400">· Rate Check</span></span>
        {step && (
          <ol className="flex items-center gap-1.5" aria-label={`Step ${step} of 3: ${STEPS[step - 1]}`}>
            {STEPS.map((s, i) => (
              <li key={s} className={`h-1.5 rounded-full transition-all ${i + 1 === step ? 'w-6 bg-blue-700' : i + 1 < step ? 'w-3 bg-blue-300' : 'w-3 bg-slate-300'}`} />
            ))}
          </ol>
        )}
      </header>
      <main className={center
        ? 'mx-auto flex min-h-[calc(100dvh-3.25rem)] max-w-md flex-col justify-center px-4 py-6'
        : 'mx-auto max-w-md px-4 pt-6 pb-10'}>{children}</main>
      <RateCheckFooter padForBar={!!bar} />
      {bar}
    </div>
  );
}

export function RateCheckFooter({ padForBar = false }) {
  return (
    <footer className={`mx-auto max-w-md px-4 text-xs leading-relaxed text-slate-500 ${padForBar ? 'pb-36' : 'pb-10'}`}>
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
