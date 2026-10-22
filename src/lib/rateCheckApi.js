// src/lib/rateCheckApi.js
// Client helpers for the public Rate Check page (/ratecheck): prepare the
// dec-page photo (downscale big/HEIC photos to JPEG) and post it to the
// rate-check edge function with the project's publishable key.

import { getSessionId, getUtmParams } from './leadsApi';

const RATE_CHECK_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-check`
  : '/functions/v1/rate-check';

export const RATE_CHECK_CONSENT_VERSION = 'ratecheck-v1';
// Separate, optional opt-in for partner referrals — never bundled with the call/text consent.
export const RATE_CHECK_REFERRAL_CONSENT_VERSION = 'ratecheck-referral-v2';

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
 * PDFs and small JPEG/PNG/WebP go up as-is; HEIC or anything over 2 MB is
 * downscaled to JPEG first. Throws an Error with a user-facing message.
 */
export async function prepareDecPage(file) {
  if (!file) throw new Error('Please add a photo of your declarations page.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

  let blob = file;
  let mediaType = isPdf ? 'application/pdf' : file.type;
  let downscaled = false;

  if (!isPdf && (isHeic(file) || file.size > DOWNSCALE_OVER_BYTES || !PASSTHROUGH_TYPES.includes(file.type))) {
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

/**
 * POST the dec page + contact + consent to the rate-check edge function.
 * Resolves to { status, rate_check_id, carrier, policy_type, annual_premium }.
 */
export async function submitRateCheck({ prepared, firstName, phone, zip, consentGivenAt, referralConsentGivenAt = null }) {
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
      zip,
      consent_given_at: consentGivenAt,
      consent_version: RATE_CHECK_CONSENT_VERSION,
      consent_user_agent: navigator.userAgent,
      ...(referralConsentGivenAt ? {
        referral_consent_given_at: referralConsentGivenAt,
        referral_consent_version: RATE_CHECK_REFERRAL_CONSENT_VERSION,
      } : {}),
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
  if (res.status === 429) throw new Error('Too many tries in a minute — please wait a moment and try again.');
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/** "(404) 555-1212" as the user types. */
export function formatPhoneInput(value) {
  const d = value.replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
