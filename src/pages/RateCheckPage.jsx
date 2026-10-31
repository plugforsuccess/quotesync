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
import { T, CopyImage } from '../components/SiteCopy';
import {
  AlertTriangle, Camera, Check, ChevronLeft, FileText, Loader2, Lock, Paperclip, Plus, RotateCcw, ShieldCheck, Sparkles, Upload, X,
  Car, House, Building2, Sofa, KeyRound, Umbrella, Motorbike, Sailboat, Caravan, HeartPulse, Briefcase, Gem,
} from 'lucide-react';
import { preparePolicy, submitRateCheck, formatPhoneInput, lookupInvite, sendOtp, verifyOtp, isEmail, HOUSING_OPTIONS, takeScannerPrefill } from '../lib/rateCheckApi';
import { assessPhoto } from '../lib/photoQuality';
import {
  saveDraftFields, saveDraftPhoto, removeDraftPhoto, loadDraft, clearDraft, saveSession, loadSession, clearSession,
} from '../lib/rateCheckDraft';

// The legal operator, as it must appear on consent and privacy text (not the brand name in the footer).
export const LEGAL_OPERATOR = 'Cam Wiley Agency, Inc. d/b/a insuredbycam.com';

// The two optional boxes on the last step: unchecked by default, never required to submit.
// Changing the wording? Bump the versions in rateCheckApi.js.
const CONSENT = {
  title: 'Text me when my quote is ready',
  fine: `By checking this, you agree to receive automated texts from ${LEGAL_OPERATOR} at the number above about ` +
    'your insurance quote, when it’s ready, and your callback or quote-review appointment. Message frequency varies. ' +
    'Message and data rates may apply. Reply STOP to opt out or HELP for help. Not required to get a quote.',
};
const REFERRAL_CONSENT = {
  title: 'If Allstate can’t help, refer me to a partner',
  fine: 'Cam Wiley Agency, Inc. may share your name, number and policy details with one partner agency so they can quote you.',
};

const POLICY_LABELS = { auto: 'Auto', home: 'Home', renters: 'Renters', condo: 'Condo', umbrella: 'Umbrella', commercial_auto: 'Commercial auto', commercial: 'Business' };

// Texted-code verification of the mobile number: off while the agency tests; set
// VITE_RATE_CHECK_OTP=true (and RATE_CHECK_OTP_REQUIRED on the function) to turn it on.
const OTP_ENABLED = import.meta.env.VITE_RATE_CHECK_OTP === 'true';
// The licensed agent shown on the page (same headshot as the homepage). Two GA
// licenses: Cam's individual resident license goes under his headshot (the card
// names him); the agency's resident license goes in the footer next to the agency name.
const AGENT = { name: 'Cam Wiley', photo: '/logos/cameron-headshot.webp', license: '3282384' };
const AGENCY = { name: 'Cam Wiley Insurance', license: '209488' };
// "Meet Cam" carousel: the agent card first, then these photos and short bio cards, in order.
// Photo: { photo, alt, caption, position }. Story: { title, paragraphs }.
const ABOUT = [
  { key: 'hoops', photo: '/logos/cameron-swarthmore.webp', alt: 'Cam cutting down the net at Swarthmore', caption: 'Cutting the net, March 9, 2019: Swarthmore’s first NCAA Final Four', position: '52% 45%' },
  // Facts from Swarthmore Athletics (2019 NABC All-America and Final Four releases) and
  // the Swarthmore Phoenix season recap.
  { key: 'court', title: 'My story, on the court', paragraphs: [
    'March 9, 2019. I was on a ladder with a pair of scissors, cutting down the net. Swarthmore had just reached its first NCAA Final Four.',
    'In the Final Four I scored 23 against Christopher Newport, and we played for the Division III national title.',
    'That season I was Centennial Conference Player of the Year and the first NABC First Team All-American in program history.',
  ] },
  { key: 'family', photo: '/logos/cameron-family.webp', alt: 'Cam with his family', caption: 'My family', position: '50% 35%' },
  // From Cam's Allstate agent bio, condensed; statewide, not one town.
  { key: 'today', title: 'My story, today', paragraphs: [
    'Family comes first for me. So I treat your household the way I’d treat mine.',
    'Today I run Cam Wiley Insurance, my Allstate agency serving families all across Georgia. Getting to know them and building those relationships is the best part of my job.',
    'You choose your car and your home to fit your life and your budget. Your insurance should fit the same way, and I’ll help you look at the big picture.',
  ] },
];

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
  // What the next pick does: null = new policy; { mode: 'page', policyId } adds a page;
  // { mode: 'retake', policyId, pageId } replaces one page.
  const pickTarget = useRef(null);

  const [step, setStep] = useState('policies'); // policies | you | results
  // A policy: { id, pages: [{ id, file, preview, quality }], file, preview (page 1),
  //   status: draft|queued|reading|read|unreadable|failed, result, error }
  const [items, setItems] = useState([]);
  // The policy we're asking "more pages?" about, and photos picked together that
  // might be one policy or several.
  const [askingMore, setAskingMore] = useState(null);
  const [grouping, setGrouping] = useState(null); // File[]
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
  const patchPage = useCallback((pageId, change) => updateItems(list => list.map(i => (
    i.pages?.some(pg => pg.id === pageId) ? withPages(i, i.pages.map(pg => (pg.id === pageId ? { ...pg, ...change } : pg))) : i
  ))), [updateItems]);
  const checkQuality = useCallback((pageId, file) => {
    assessPhoto(file).then(q => patchPage(pageId, { quality: q }));
  }, [patchPage]);
  // Save every page of a draft policy, in order (the order is what gets sent).
  const saveDraftPages = (policy) => policy.pages.forEach((pg, order) => saveDraftPhoto({ id: pg.id, file: pg.file, policyId: policy.id, order }));

  useEffect(() => {
    document.title = 'Get a second opinion on your insurance | insuredbycam';
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
        restored.push(...session.results.map(r => ({ ...r, pages: [], file: null, preview: null })));
        setGiven({ consentGivenAt: session.consentGivenAt, referralConsentGivenAt: session.referralConsentGivenAt });
        setStep('results');
      }
      if (draft?.photos?.length) {
        const byPolicy = new Map();
        draft.photos.forEach(ph => {
          if (!byPolicy.has(ph.policyId)) byPolicy.set(ph.policyId, []);
          byPolicy.get(ph.policyId).push(ph);
        });
        byPolicy.forEach((rows, policyId) => {
          const pages = rows.sort((a, b) => a.order - b.order).map(r => ({ id: r.id, file: r.file, preview: previewFor(r.file), quality: null }));
          restored.push(withPages({ id: policyId, status: 'draft' }, pages));
        });
      }
      const f = session?.fields || draft?.fields;
      if (f) setFields(prev => ({ firstName: f.firstName || prev.firstName, phone: f.phone || prev.phone, email: f.email || prev.email, zip: f.zip || prev.zip, housing: f.housing || prev.housing }));
      // Sent here from the /save wizard: fill in what they already told it.
      const handed = takeScannerPrefill();
      if (handed) setFields(prev => ({
        firstName: prev.firstName || handed.firstName || '', phone: prev.phone || (handed.phone ? formatPhoneInput(handed.phone) : ''),
        email: prev.email || handed.email || '', zip: prev.zip || handed.zip || '', housing: prev.housing || handed.housing || '',
      }));
      const draftHasContent = !!draft && (draft.photos.length > 0 || ['firstName', 'phone', 'email', 'zip', 'housing'].some(k => draft.fields?.[k]));
      if (draftHasContent && !sentBefore) setResumed(true);
      if (restored.length) {
        updateItems(() => restored);
        restored.filter(i => i.status === 'draft').forEach(i => i.pages.forEach(pg => checkQuality(pg.id, pg.file)));
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
      if (!it?.pages?.length) continue;
      patch(id, { status: 'reading', error: null });
      try {
        const prepared = await preparePolicy(it.pages.map(pg => pg.file));
        const data = await submitWithRetry(() => submitRateCheck({
          prepared, firstName: f.firstName, phone: f.phone.replace(/\D/g, ''), email: f.email, zip: f.zip,
          housingSituation: f.housing, consentGivenAt: grant.consentGivenAt,
          referralConsentGivenAt: grant.referralConsentGivenAt, inviteCode: invite ? inviteCode : null,
        }));
        const unreadable = !data?.carrier && !data?.policy_type && data?.annual_premium == null;
        patch(id, { status: unreadable ? 'unreadable' : 'read', result: data });
        it.pages.forEach(pg => removeDraftPhoto(pg.id));
      } catch (err) {
        patch(id, { status: 'failed', error: err.message || 'Didn’t go through.' });
      }
      saveSession({ ...currentSession(itemsRef.current, grant), fields: fieldsRef.current });
    }
    if (!itemsRef.current.some(i => i.status === 'draft')) clearDraft();
  };

  // ── Adding policies and pages, replacing and removing ──
  const newPolicy = (files) => withPages({ id: newId(), status: 'draft' }, files.map(newPage));
  const addPolicies = (policies) => {
    updateItems(list => [...list, ...policies]);
    policies.forEach(pol => { saveDraftPages(pol); pol.pages.forEach(pg => checkQuality(pg.id, pg.file)); });
    if (step === 'results') setStep('policies');
  };

  const onPick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const target = pickTarget.current;
    pickTarget.current = null;
    if (!picked.length) return;
    navigator.vibrate?.(8);

    const have = new Set(itemsRef.current.flatMap(i => (i.pages || []).map(pg => fileKey(pg.file))));
    const fresh = picked.filter(f => !have.has(fileKey(f)));
    if (!target && fresh.length < picked.length) setNotice(fresh.length ? 'Skipped a photo you already added.' : 'You already added that one.');

    if (target?.mode === 'retake') {
      const old = itemsRef.current.find(i => i.id === target.policyId);
      const file = picked[0];
      if (!old) return;
      if (old.status !== 'draft') {
        // Retaking a policy we couldn't read: send the new photo straight away.
        old.pages.forEach(pg => pg.preview && URL.revokeObjectURL(pg.preview));
        const next = { ...newPolicy([file]), status: 'queued' };
        updateItems(list => [...list.filter(i => i.id !== old.id), next]);
        checkQuality(next.pages[0].id, file);
        sendQueue([next.id], given);
        return;
      }
      const pg = newPage(file);
      const pages = old.pages.map(p => {
        if (p.id !== target.pageId) return p;
        if (p.preview) URL.revokeObjectURL(p.preview);
        removeDraftPhoto(p.id);
        return pg;
      });
      const updated = withPages(old, pages);
      updateItems(list => list.map(i => (i.id === old.id ? updated : i)));
      saveDraftPages(updated);
      checkQuality(pg.id, file);
      return;
    }

    if (!fresh.length) return;

    if (target?.mode === 'page') {
      const pol = itemsRef.current.find(i => i.id === target.policyId);
      if (!pol) return;
      const added = fresh.map(newPage);
      const updated = withPages(pol, [...pol.pages, ...added]);
      updateItems(list => list.map(i => (i.id === pol.id ? updated : i)));
      saveDraftPages(updated);
      added.forEach(pg => checkQuality(pg.id, pg.file));
      setAskingMore(pol.id);
      return;
    }

    if (fresh.length > 1) {
      // A downloaded PDF already holds every page of one policy, so several PDFs are several policies.
      if (fresh.every(isPdfName)) { addPolicies(fresh.map(f => newPolicy([f]))); setAskingMore(null); return; }
      // Photos or screenshots could be one policy's pages, several policies, or a mix: ask.
      setGrouping(fresh);
      if (step === 'results') setStep('policies');
      return;
    }
    const pol = newPolicy(fresh);
    addPolicies([pol]);
    // A single photo: ask whether this policy has more pages (PDFs usually already do).
    setAskingMore(isPdfName(fresh[0]) ? null : pol.id);
  };

  // how: 'one' (pages of one policy), 'separate' (one file per policy), or 'mix' (one per
  // policy for now, each with "Same policy as above" so they can be sorted into pages).
  const groupPicked = (how) => {
    const files = grouping || [];
    setGrouping(null);
    if (!files.length) return;
    if (how === 'one') {
      const pol = newPolicy(files);
      addPolicies([pol]);
      setAskingMore(pol.id);
      return;
    }
    const batch = how === 'mix' ? newId() : null;
    addPolicies(files.map(f => ({ ...newPolicy([f]), ...(batch ? { batch } : {}) })));
    setAskingMore(null);
  };
  // "Same policy as above": move this policy's pages onto the end of the one before it.
  const mergeUp = (id) => {
    const list = itemsRef.current.filter(i => i.status === 'draft');
    const k = list.findIndex(i => i.id === id);
    if (k < 1) return;
    const prev = list[k - 1], cur = list[k];
    const merged = withPages(prev, [...prev.pages, ...cur.pages]);
    updateItems(all => all.filter(i => i.id !== cur.id).map(i => (i.id === prev.id ? merged : i)));
    saveDraftPages(merged);
  };

  const removeItem = (id) => {
    const it = itemsRef.current.find(i => i.id === id);
    (it?.pages || []).forEach(pg => { if (pg.preview) URL.revokeObjectURL(pg.preview); removeDraftPhoto(pg.id); });
    if (askingMore === id) setAskingMore(null);
    updateItems(list => list.filter(i => i.id !== id));
  };
  const removePage = (policyId, pageId) => {
    const pol = itemsRef.current.find(i => i.id === policyId);
    if (!pol) return;
    if (pol.pages.length <= 1) { removeItem(policyId); return; }
    const gone = pol.pages.find(pg => pg.id === pageId);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    removeDraftPhoto(pageId);
    const updated = withPages(pol, pol.pages.filter(pg => pg.id !== pageId));
    updateItems(list => list.map(i => (i.id === policyId ? updated : i)));
    saveDraftPages(updated);
  };

  const openCamera = (target = null) => { pickTarget.current = target; cameraInput.current?.click(); };
  const openFiles = (target = null) => { pickTarget.current = target; fileInput.current?.click(); };
  const addPage = (policyId) => openCamera({ mode: 'page', policyId });
  const retakePage = (policyId, pageId) => openCamera({ mode: 'retake', policyId, pageId });
  const newPolicyPhoto = () => { setAskingMore(null); openCamera(); };

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
    const now = new Date().toISOString();
    // The decision is made once per visit; later policies in the same visit reuse it.
    const grant = given || { consentGivenAt: consent ? now : null, referralConsentGivenAt: referralConsent ? now : null };
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
      {invite?.promoter_name && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-blue-50 px-3 py-2.5">
          {invite.promoter_photo_url && (
            <img src={invite.promoter_photo_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white" />
          )}
          <span className="min-w-0">
            <span className="block font-bold text-slate-900">{invite.promoter_name} shared this with you</span>
            <span className="block text-xs text-slate-600">{invite.promoter_name} gets a referral fee for sharing.</span>
          </span>
        </div>
      )}
      {invite && !invite.promoter_name && (
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
            <ResultRow key={it.id} item={it} index={n} onRetake={() => retakePage(it.id, it.pages?.[0]?.id)} onRetry={() => sendQueue([it.id], given)} />
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
            {reading ? <T k="rc.results.reading">Reading your policies…</T> : <T k="rc.results.done">Got it — Cam is on it.</T>}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-slate-600">
            {reading
              ? <T k="rc.results.reading.line">Each one takes about 10–20 seconds. Keep this screen open.</T>
              : given?.consentGivenAt
                ? <T k="rc.results.done.text">Cam’s team will text you when your quote is ready—typically within 30 mins during business hours.</T>
                : <T k="rc.results.done.reach">Cam’s team will reach out when your quote is ready—typically within 30 mins during business hours.</T>}
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
    const canSend = contactOk && drafts.length > 0;
    const hint = missing.length
      ? `Add ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0]}.`
      : '';
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
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900"><T k="rc.contact.heading">How can Cam reach you?</T></h1>
        <p className="mt-2 text-slate-600"><T k="rc.contact.line">Cam’s team only reaches out if Allstate can beat your price. No call centers, ever.</T></p>

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

          <fieldset className="pt-2">
            <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Optional</legend>
            <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              <Choice checked={consent} onChange={setConsent} {...CONSENT}>
                {' '}<Link to="/ratecheck-privacy#sms-terms" className="underline">Text terms</Link>
                {' · '}<Link to="/privacy" className="underline">Privacy</Link>
              </Choice>
              <Choice checked={referralConsent} onChange={setReferralConsent} {...REFERRAL_CONSENT} />
            </div>
          </fieldset>
          <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <T k="rc.contact.private">Your photos go only to Cam’s office and are deleted after 90 days.</T>
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
      <ActionBar hint={drafts.some(d => d.pages.some(pg => pg.quality?.issue)) ? 'Blurry or dark? Retake that page, or send anyway.' : null}>
        <button type="button" onClick={newPolicyPhoto} aria-label="Add another policy"
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
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700"><T k="rc.eyebrow">Free rate check · Georgia</T></p>
              <h1 className="mt-2 text-[32px] font-extrabold leading-[1.1] tracking-tight text-slate-900">
                <T k="rc.headline">Get a second opinion on your insurance.</T>
              </h1>
              <p className="mt-3 text-slate-600">
                <T k="rc.subhead">Upload your auto, home or umbrella declarations pages. A licensed agent on Cam’s team will check your rate and text you when your quote is ready—typically within 30 mins during business hours.</T>
              </p>
            </>
          )}

          <button type="button" onClick={() => openFiles()}
            className="mt-6 flex w-full flex-col items-center justify-center gap-3 rounded-3xl bg-blue-700 px-6 py-8 text-white shadow-lg shadow-blue-700/20 active:scale-[0.99] active:bg-blue-800">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
              <Upload className="h-8 w-8" aria-hidden="true" strokeWidth={1.75} />
            </span>
            <span className="text-xl font-bold"><T k="rc.upload.title">Upload my policy</T></span>
            <span className="text-sm text-blue-100"><T k="rc.upload.line">PDF, photos or screenshots</T></span>
          </button>
          <button type="button" onClick={() => openCamera()}
            className="mt-3 flex w-full flex-col items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-slate-700 active:bg-slate-50">
            <span className="flex items-center gap-2 font-semibold"><Camera className="h-5 w-5" aria-hidden="true" /> <T k="rc.photos.title">Take photos instead</T></span>
            <span className="mt-0.5 text-xs text-slate-500"><T k="rc.photos.line">Photograph every page of the declarations</T></span>
          </button>
          <p className="mt-4 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF2FF] px-3.5 py-1.5 text-sm font-semibold text-blue-700">
              <Paperclip className="h-4 w-4" aria-hidden="true" /> <T k="rc.multiple">Multiple policies? Upload them together.</T>
            </span>
          </p>

          <MeetCam />

          {/* Trust, kept quiet: one line, not cards, so it doesn't break up the story. */}
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-medium text-slate-500">
            <Trust icon={Sparkles} k="rc.trust.fast" label="Read in seconds" />
            <Trust icon={ShieldCheck} k="rc.trust.spam" label="No spam calls" />
            <Trust icon={Lock} k="rc.trust.private" label="Private & secure" />
          </ul>

          <details open className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <summary className="cursor-pointer font-semibold text-slate-800"><T k="rc.howto.title">How to get your declarations page</T></summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 marker:font-semibold marker:text-blue-700">
              <li><T k="rc.howto.1">Log in to your insurer’s website or app.</T></li>
              <li><T k="rc.howto.2">Open **Documents**. Some insurers call it **Policy Documents** or **Documents & ID Cards**.</T></li>
              <li><T k="rc.howto.3">Find the most recent declarations page for each policy.</T></li>
              <li><T k="rc.howto.4">Download the PDF. On iPhone, tap **Share**, then **Save to Files**. On Android, it goes to **Downloads**.</T></li>
              <li><T k="rc.howto.5">Come back here and tap **Upload my policy**.</T></li>
            </ol>
            <p className="mt-4 font-semibold text-slate-800"><T k="rc.howto.paper.title">Have a paper copy?</T></p>
            <p className="mt-1"><T k="rc.howto.paper">Tap **Take photos instead** and photograph every page of the declarations. Lay it flat in good light.</T></p>
            <p className="mt-4 font-semibold text-slate-800"><T k="rc.howto.screens.title">Can’t download it?</T></p>
            <p className="mt-1"><T k="rc.howto.screens">Screenshot every page of the declarations, not just the first. Most run 2 to 4 pages and list every vehicle, driver and coverage limit.</T></p>
          </details>

          <ProductsWeInsure />
          <CarrierLogos />

        </>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">Your policies</h1>
            <span className="pb-1 text-sm font-semibold text-slate-500 tabular-nums">
              {drafts.length === 1 ? '1 added' : `${drafts.length} added`}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">Include every page of each policy. Add every auto, home and umbrella policy you have.</p>

          <ul className="mt-5 space-y-3">
            {drafts.map((it, n) => (
              <DraftCard key={it.id} item={it} index={n} asking={askingMore === it.id}
                onAddPage={() => addPage(it.id)} onDoneAdding={() => setAskingMore(null)}
                onRetakePage={(pageId) => retakePage(it.id, pageId)} onRemovePage={(pageId) => removePage(it.id, pageId)}
                onRemove={() => removeItem(it.id)}
                onMergeUp={it.batch && drafts[n - 1]?.batch === it.batch ? () => mergeUp(it.id) : null} />
            ))}
            <li className="flex gap-2">
              <button type="button" onClick={newPolicyPhoto}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 font-semibold text-blue-800 active:bg-blue-100">
                <Camera className="h-5 w-5" aria-hidden="true" /> Add another policy
              </button>
              <button type="button" onClick={() => { setAskingMore(null); openFiles(); }} aria-label="Upload more"
                className="flex w-16 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-700">
                <Upload className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </>
      )}

      {notice && <p className="mt-4 rounded-xl bg-slate-900 px-3 py-2 text-center text-sm text-white" role="status">{notice}</p>}
      {grouping && <GroupSheet count={grouping.length} onOne={() => groupPicked('one')} onSeparate={() => groupPicked('separate')} onMix={() => groupPicked('mix')} onCancel={() => setGrouping(null)} />}
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

const isPdfName = (f) => f?.type === 'application/pdf' || /\.pdf$/i.test(f?.name || '');
const newPage = (file) => ({ id: newId(), file, preview: previewFor(file), quality: null });
// Keep a policy's cover (page 1) on the policy itself for the thumbnails and result rows.
function withPages(policy, pages) {
  return { ...policy, pages, file: pages[0]?.file || null, preview: pages[0]?.preview || null };
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

// A policy waiting to be sent: its pages in order, each with retake/remove, and an
// add-page tile. Right after a photo it asks whether the policy has more pages.
function DraftCard({ item, index, asking, onAddPage, onDoneAdding, onRetakePage, onRemovePage, onRemove, onMergeUp }) {
  const { pages } = item;
  const bad = pages.findIndex(pg => pg.quality?.issue);
  const n = index + 1;
  return (
    <li className={`rounded-2xl border bg-white p-3 shadow-sm ${bad >= 0 ? 'border-amber-300' : asking ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">Policy {n}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {pages.length === 1 ? '1 page' : `${pages.length} pages`}
            {bad >= 0 && <span className="text-amber-700"> · Page {bad + 1} looks {pages[bad].quality.issue === 'dark' ? 'too dark' : 'blurry'}</span>}
          </p>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove policy ${n}`}
          className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={`Pages of policy ${n}`}>
        {pages.map((pg, k) => (
          <li key={pg.id} className="flex w-16 shrink-0 flex-col items-center">
            <div className={`rounded-lg ${pg.quality?.issue ? 'ring-2 ring-amber-400' : ''}`}><Thumb item={pg} /></div>
            <span className="mt-1 text-xs font-medium text-slate-600">Page {k + 1}</span>
            <span className="flex">
              <button type="button" onClick={() => onRetakePage(pg.id)} aria-label={`Retake page ${k + 1} of policy ${n}`}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${pg.quality?.issue ? 'text-amber-800' : 'text-slate-500'}`}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => onRemovePage(pg.id)} aria-label={`Remove page ${k + 1} of policy ${n}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
        <li className="flex w-16 shrink-0 flex-col items-center">
          <button type="button" onClick={onAddPage} aria-label={`Add page ${pages.length + 1} to policy ${n}`}
            className="flex h-[72px] w-14 items-center justify-center rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/60 text-blue-700">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="mt-1 text-xs font-medium text-blue-700">Add page</span>
        </li>
      </ul>

      {onMergeUp && (
        <button type="button" onClick={onMergeUp}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
          Same policy as Policy {index}? Combine them
        </button>
      )}

      {asking && (
        <div className="mt-2 rounded-xl bg-blue-50 p-3" role="group" aria-label="More pages?">
          <p className="font-semibold text-slate-900">Does this policy have more pages?</p>
          <p className="mt-0.5 text-sm text-slate-600">Drivers, cars and coverages are often on page 2 or 3.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onAddPage}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 py-3 font-semibold text-white">
              <Camera className="h-4 w-4" aria-hidden="true" /> Add page {pages.length + 1}
            </button>
            <button type="button" onClick={onDoneAdding}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 font-semibold text-slate-700">
              That&apos;s all
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// Several photos picked at once: pages of one policy, or one photo per policy?
function GroupSheet({ count, onOne, onSeparate, onMix, onCancel }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label="How should we group these?">
      <div className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-6 pt-5" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <p className="text-xl font-extrabold text-slate-900">You picked {count} files</p>
        <p className="mt-1 text-slate-600">Are they pages of one policy, or more than one policy?</p>
        <button type="button" onClick={onOne}
          className="mt-5 flex w-full items-center justify-center rounded-2xl bg-blue-700 px-4 py-4 text-lg font-bold text-white">
          One policy, {count} pages
        </button>
        <button type="button" onClick={onSeparate}
          className="mt-3 flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3.5 font-semibold text-slate-800">
          {count} separate policies
        </button>
        <button type="button" onClick={onMix}
          className="mt-3 flex w-full flex-col items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800">
          A mix — I&apos;ll sort them
          <span className="text-xs font-normal text-slate-500">e.g. 3 pages of auto and 2 of home</span>
        </button>
        <button type="button" onClick={onCancel} className="mt-2 w-full py-2 text-sm font-medium text-slate-500">Cancel</button>
      </div>
    </div>
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
        <button type="button" onClick={item.pages?.length ? onRetry : onRetake} className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800">
          {item.pages?.length ? 'Try again' : 'Retake'}
        </button>
      )}
    </li>
  );
}

// Swipeable sections (native scroll-snap, so touch, trackpad and keyboard all work).
// The next slide peeks in from the right so it reads as swipeable; the dots jump.
function Carousel({ slides, className = '', label = 'Your rate check' }) {
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
    <section className={className} aria-roledescription="carousel" aria-label={label}>
      <div ref={track} onScroll={onScroll}
        className={`rc-track relative flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto ${many ? '' : 'justify-center'}`}>
        {slides.map((s, i) => (
          <div key={s.key} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.label}`}
            className={`${many ? 'w-[88%]' : 'w-full'} shrink-0 snap-start rounded-2xl border border-slate-200 bg-white shadow-sm ${s.bare ? 'overflow-hidden' : 'p-4'}`}>
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

// First slide of the Meet Cam carousel.
function AgentCard() {
  return (
    <div className="flex h-full min-h-[268px] flex-col items-center justify-center text-center">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Your licensed agent</p>
      <p className="mt-0.5 text-2xl font-extrabold text-slate-900">{AGENT.name}</p>
      <img src={AGENT.photo} alt={AGENT.name} width="128" height="128" loading="lazy"
        className="mx-auto mt-4 h-32 w-32 rounded-full object-cover ring-[3px] ring-blue-700 ring-offset-[3px]"
        style={{ objectPosition: '50% 30%' }} />
      {AGENT.license && <p className="mt-10 text-[11px] text-slate-400">GA License #: {AGENT.license}</p>}
    </div>
  );
}

function MeetCam() {
  const slides = [{ key: 'agent', label: 'Your licensed agent', untitled: true, content: <AgentCard /> }, ...ABOUT.map(a => a.photo ? {
    key: a.key, label: a.caption, untitled: true, bare: true,
    content: (
      <figure className="relative h-full min-h-[300px]">
        <img src={a.photo} alt={a.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: a.position }} />
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-left text-sm font-semibold text-white"><T k={`rc.about.${a.key}.caption`}>{a.caption}</T></figcaption>
      </figure>
    ),
  } : {
    key: a.key, label: a.title, untitled: true,
    content: (
      <div className="flex h-full min-h-[268px] flex-col text-left">
        {/* No visible header: the bold first line is the headline. The title names the slide for screen readers. */}
        <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">
          {a.paragraphs.map((t, i) => <p key={i} className={i === 0 ? 'text-base font-semibold text-slate-900' : ''}><T k={`rc.about.${a.key}.${i + 1}`}>{t}</T></p>)}
        </div>
      </div>
    ),
  })];
  return <Carousel slides={slides} label={`Meet ${AGENT.name}`} className="mt-6" />;
}

function Trust({ icon: Icon, k, label }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
      <T k={k}>{label}</T>
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

// A checkbox with a plain-language title and its fine print underneath.
function Choice({ checked, onChange, title, fine, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 p-4">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-snug text-slate-900">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-500">{fine}{children}</span>
      </span>
    </label>
  );
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</label>
      {children}
    </div>
  );
}

// ── Products we insure, and the carriers (landing page, below the how-to) ────
// Titles and lines are editable in place (copy editor); keys are stable, so reorder freely.
// Every title and note fits on one line, so the tiles line up.
const PRODUCTS = [
  ['auto', Car, 'Auto', 'Cars & trucks'],
  ['home', House, 'Home', 'Homeowners'],
  ['condo', Building2, 'Condo', 'Your unit'],
  ['renters', Sofa, 'Renters', 'Your things'],
  ['landlord', KeyRound, 'Landlord', 'Rentals'],
  ['umbrella', Umbrella, 'Umbrella', 'Extra liability'],
  ['motorcycle', Motorbike, 'Motorcycle', 'Bikes'],
  ['boat', Sailboat, 'Boat', 'Watercraft'],
  ['mobile-home', Caravan, 'Mobile home', 'Manufactured'],
  ['life', HeartPulse, 'Life', 'Term & whole'],
  ['commercial', Briefcase, 'Commercial', 'Business'],
  ['specialty', Gem, 'Specialty', 'Hard-to-place'],
];

// Three tiles to a row: filled brand blue with a fluorescent border.
function ProductsWeInsure() {
  return (
    <section className="mt-10" aria-labelledby="rc-products">
      <h2 id="rc-products" className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700"><T k="rc.products.heading">Products we insure</T></h2>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {PRODUCTS.map(([key, Icon, name, sub]) => (
          <li key={key} className="flex min-w-0 flex-col items-center rounded-2xl border-2 border-[#39FF88] bg-gradient-to-b from-blue-700 to-blue-900 px-1 py-3.5 text-center shadow-[0_0_10px_rgba(57,255,136,0.35)]">
            <Icon className="h-6 w-6 text-[#39FF88]" aria-hidden="true" strokeWidth={1.75} />
            <p className="mt-2 max-w-full truncate whitespace-nowrap text-[15px] font-extrabold leading-5 tracking-tight text-white"><T k={`rc.products.${key}.title`}>{name}</T></p>
            <p className="mt-0.5 max-w-full truncate whitespace-nowrap text-[11px] leading-4 text-blue-100"><T k={`rc.products.${key}.line`}>{sub}</T></p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Official logos in public/logos/carriers; a logo uploaded in the copy editor replaces it.
// Until a carrier has one, its name shows in its place.
/* TODO(compliance): confirm with Allstate marketing how other carriers' logos may be shown on the agency site. */
const CARRIERS = [
  ['allstate', 'Allstate', null],
  ['chubb', 'Chubb', null],
  ['american-modern', 'American Modern', null],
  ['national-general', 'National General', null],
  ['foremost', 'Foremost', null],
  ['liberty-mutual', 'Liberty Mutual', '/logos/carriers/liberty-mutual.webp'],
  ['progressive', 'Progressive', '/logos/carriers/progressive.webp'],
  ['the-hartford', 'The Hartford', null],
];

function CarrierLogos() {
  const row = (hidden) => (
    <ul className="flex shrink-0 items-center gap-12 pr-12" aria-hidden={hidden || undefined}>
      {CARRIERS.map(([key, name, src]) => (
        <li key={key} className="flex h-12 shrink-0 items-center">
          <CopyImage k={`rc.carriers.${key}.logo`} src={src} alt={name} className="h-10 w-auto max-w-[150px] object-contain"
            fallback={<span className="whitespace-nowrap text-xl font-extrabold tracking-tight text-slate-700">{name}</span>} />
        </li>
      ))}
    </ul>
  );
  return (
    <section className="mt-10" aria-labelledby="rc-carriers">
      <style>{'@keyframes rc-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}.rc-marquee{animation:rc-marquee 36s linear infinite}.rc-marquee-wrap:hover .rc-marquee{animation-play-state:paused}@media (prefers-reduced-motion: reduce){.rc-marquee{animation:none;width:auto!important}.rc-marquee>ul[aria-hidden]{display:none}.rc-marquee>ul{flex-wrap:wrap;row-gap:1rem}}'}</style>
      <h2 id="rc-carriers" className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700"><T k="rc.carriers.heading">Carriers we write</T></h2>
      <div className="rc-marquee-wrap -mx-4 mt-2 overflow-hidden px-4 pb-6 pt-2 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="rc-marquee flex w-max">{row(false)}{row(true)}</div>
      </div>
    </section>
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
      <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="More from insuredbycam">
        <Link to="/courses" className="font-semibold text-slate-600 underline">Drivers Ed</Link>
        <Link to="/news" className="font-semibold text-slate-600 underline">Insurance news</Link>
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
