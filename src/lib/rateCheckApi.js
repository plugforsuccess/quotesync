// src/lib/rateCheckApi.js
// Client helpers for the public Rate Check page (/ratecheck): prepare the
// dec-page photo (downscale big/HEIC photos to JPEG) and post it to the
// rate-check edge function with the project's publishable key.

import { getSessionId, getUtmParams } from './leadsApi';

const RATE_CHECK_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-check`
  : '/functions/v1/rate-check';

export const RATE_CHECK_CONSENT_VERSION = 'ratecheck-v2';
// Separate, optional opt-in for partner referrals — never bundled with the text consent.
export const RATE_CHECK_REFERRAL_CONSENT_VERSION = 'ratecheck-referral-v3';

const DOWNSCALE_OVER_BYTES = 2 * 1024 * 1024;
const MAX_LONG_EDGE = 1600;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PASSTHROUGH_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function isHeic(file) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

/** Re-encode an image as JPEG with its long edge capped at 1600px. */
async function downscaleToJpeg(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // flatten transparency so text stays readable
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85);
  });
}

/**
 * Turn the picked file into { base64, mediaType, bytes, downscaled }.
 * PDFs go up as-is; every image is re-encoded to JPEG (downscaled when over
 * 2 MB or larger than 1600px). Throws an Error with a user-facing message.
 */
export async function prepareDecPage(file) {
  if (!file) throw new Error('Please add a photo of your declarations page.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

  let blob = file;
  let mediaType = isPdf ? 'application/pdf' : file.type;
  let downscaled = false;

  // Every raster image is re-encoded to a plain JPEG (and downscaled when big):
  // the API rejects unusual PNGs (palette, 16-bit) outright, and a phone camera's
  // rotation metadata gets baked in. PDFs go up as-is.
  if (!isPdf) {
    try {
      blob = await downscaleToJpeg(file);
      mediaType = 'image/jpeg';
      downscaled = true;
    } catch {
      throw new Error(
        isHeic(file)
          ? "We couldn't read that HEIC photo. Try taking a screenshot of it, or set your camera to \"Most Compatible\"."
          : "We couldn't read that image. Try another photo."
      );
    }
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('That file is over 10 MB. Try a photo instead of a scan.');
  }

  const dataUrl = await readAsDataUrl(blob);
  return {
    base64: String(dataUrl).split(',')[1] || '',
    mediaType,
    bytes: blob.size,
    downscaled,
  };
}

const isPdfFile = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** How many pages a PDF holds (null if it can't be opened). Read on the device, nothing is sent. */
export async function pdfPageCount(file) {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

/**
 * One policy can be several pages (an auto dec page often runs 2–4). One page goes
 * up as before; several are combined into a single PDF, in order, so the scanner
 * reads them together as one policy and staff see every page. Photos are re-encoded
 * to JPEG first (same as single uploads); PDF pages are copied in as-is.
 * Resolves to { base64, mediaType, bytes, pages }.
 */
export async function preparePolicy(files) {
  const list = (files || []).filter(Boolean);
  if (!list.length) throw new Error('Please add a photo of your declarations page.');
  if (list.length === 1) return { ...(await prepareDecPage(list[0])), pages: 1 };

  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const file of list) {
    if (isPdfFile(file)) {
      let src;
      try { src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }); } catch {
        throw new Error("We couldn't open one of those PDFs. Try a screenshot of it instead.");
      }
      const copied = await pdf.copyPages(src, src.getPageIndices());
      copied.forEach(pg => pdf.addPage(pg));
    } else {
      let jpeg;
      try { jpeg = await downscaleToJpeg(file); } catch {
        throw new Error(isHeic(file)
          ? "We couldn't read one of those HEIC photos. Try a screenshot of it, or set your camera to \"Most Compatible\"."
          : "We couldn't read one of those photos. Try retaking it.");
      }
      const img = await pdf.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      pdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
  }
  const bytes = await pdf.save();
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error('Those pages add up to more than 10 MB. Try fewer pages, or photos instead of scans.');
  }
  return { base64: bytesToBase64(bytes), mediaType: 'application/pdf', bytes: bytes.length, pages: pdf.getPageCount() };
}

/**
 * POST the dec page + contact + consent to the rate-check edge function.
 * Resolves to { status, rate_check_id, carrier, policy_type, annual_premium }.
 */
export async function submitRateCheck({ prepared, firstName, phone, email, zip, housingSituation, consentGivenAt, referralConsentGivenAt = null, inviteCode = null }) {
  const utm = getUtmParams();
  const res = await fetch(RATE_CHECK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({
      image_base64: prepared.base64,
      media_type: prepared.mediaType,
      first_name: firstName.trim(),
      phone: phone.replace(/\D/g, ''),
      email: String(email || '').trim(),
      zip,
      housing_situation: housingSituation,
      // The optional text box: its wording version is sent either way; the time only if they checked it.
      ...(consentGivenAt ? { consent_given_at: consentGivenAt } : {}),
      sms_consent: consentGivenAt ? 'opted_in' : 'declined',
      consent_version: RATE_CHECK_CONSENT_VERSION,
      consent_user_agent: navigator.userAgent,
      ...(referralConsentGivenAt ? {
        referral_consent_given_at: referralConsentGivenAt,
        referral_consent_version: RATE_CHECK_REFERRAL_CONSENT_VERSION,
      } : {}),
      ...(inviteCode ? { invite_code: inviteCode } : {}),
      session_id: getSessionId(),
      landing_page: window.location.pathname,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const err = new Error('Too many tries in a minute — please wait a moment and try again.');
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

const OTP_URL = RATE_CHECK_URL.replace(/rate-check$/, 'rate-check-otp');

async function otp(mode, phone, extra = {}) {
  const res = await fetch(OTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '' },
    body: JSON.stringify({ mode, phone: phone.replace(/\D/g, ''), session_id: getSessionId(), ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.rateLimited = res.status === 429;
    throw err;
  }
  return data;
}

/** Text a 6-digit code to the mobile number (rate-check won't accept a dec page until it's verified). */
export const sendOtp = (phone) => otp('send', phone);
/** Check the code they typed; resolves to { verified: true }. */
export const verifyOtp = (phone, code) => otp('verify', phone, { code: String(code || '').replace(/\D/g, '') });

const PARTNER_URL = RATE_CHECK_URL.replace(/rate-check$/, 'rate-check-partner');

async function partnerCall(body) {
  const res = await fetch(PARTNER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

/** A partner's portal (/partner/TOKEN): the agreement, and once signed, their link and earnings. */
export const loadPartnerPortal = (token) => partnerCall({ mode: 'portal', token });
/** Record the partner's signature on the current agreement. */
export const signPartnerAgreement = (token, signedName) => partnerCall({ mode: 'sign', token, signed_name: signedName, accept: true });
/** The partner's photo for their link's landing page (a JPEG data URL from squarePhoto). */
export const savePartnerPhoto = (token, image) => partnerCall({ mode: 'photo', token, image, consent: true });
export const removePartnerPhoto = (token) => partnerCall({ mode: 'photo_remove', token });
/** The partner's W-9 (payload from w9Payload); the function fills the IRS form and keeps it privately. */
export const submitPartnerW9 = (payload) => partnerCall(payload);

/**
 * A headshot cropped to a centered square and shrunk to `size` px, as a JPEG data
 * URL (small enough to send to an edge function and load fast on a phone).
 */
export async function squarePhoto(file, size = 400) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose a photo.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That photo couldn’t be read. Try another.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(size, side);
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

/**
 * A producer's tagged link (/r/CODE): who sent it and what to pre-fill.
 * Resolves to { first_name, phone, event_name, producer_name }, or null if the
 * link is unknown or expired (the page still works, just untagged).
 */
export async function lookupInvite(code) {
  const res = await fetch(RATE_CHECK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '' },
    body: JSON.stringify({ mode: 'invite_lookup', code }),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** "(404) 555-1212" as the user types. */
export function formatPhoneInput(value) {
  const d = value.replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Where the customer lives — asked on the form, shown in the inbox, usable in rules.
export const HOUSING_OPTIONS = [
  ['own', 'I own my home'],
  ['rent', 'I rent'],
  ['family', 'I live with family'],
  ['retirement', 'Retirement community'],
];
export const HOUSING_LABEL = { own: 'Owns home', rent: 'Rents', family: 'Lives with family', retirement: 'Retirement community' };

// The /save wizard hands its dec-page step to the scanner (/). What the person
// already typed rides along in sessionStorage (never the URL) and is read once.
// Same tab, same session_id, so rate-check joins the wizard's partial lead.
const PREFILL_KEY = 'rc_prefill';
export function handOffToScanner(fields) {
  try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify(fields)); } catch { /* storage blocked: they'll just type it */ }
}
export function takeScannerPrefill() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PREFILL_KEY) || 'null');
    sessionStorage.removeItem(PREFILL_KEY);
    return v;
  } catch { return null; }
}
