// src/pages/components/rate-checks/partnerPitch.js
// The pitch a principal sends someone they'd like as a referral partner: a short text
// and four screenshots (sample partner "Alex Johnson", sample referrals) in public/partner-pitch.
// On a phone the share sheet sends the text with the pictures attached; anywhere else
// it opens a text with the message and links to the pictures.

export const PITCH_IMAGES = [
  ['1-what-your-friends-see.jpg', 'What your friends see'],
  ['2-they-send-their-policy.jpg', 'They send their policy'],
  ['3-your-partner-page.jpg', 'Your affiliate page'],
  ['4-track-your-earnings.jpg', 'Track your earnings'],
];

import { buildText } from '../../../lib/textTemplates.js';

// The pitch text: edited on the Texts & Scripts page (The partner pitch).
export const pitchText = () => buildText('pitch');

const imageUrl = (file) => `${window.location.origin}/partner-pitch/${file}`;

/** The text alone, with links to the pictures (for a plain text message). */
export const pitchWithLinks = () =>
  [pitchText(), '', ...PITCH_IMAGES.map(([file, label], i) => `${i + 1}. ${label}: ${imageUrl(file)}`)].join('\n');

/**
 * Opens the share sheet with the text and the four pictures. Resolves 'shared',
 * 'cancelled', or 'unsupported' (then the caller falls back to a text with links).
 */
export async function sharePitch() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return 'unsupported';
  let files;
  try {
    files = await Promise.all(PITCH_IMAGES.map(async ([file]) => {
      const res = await fetch(`/partner-pitch/${file}`);
      if (!res.ok) throw new Error('missing');
      return new File([await res.blob()], file, { type: 'image/jpeg' });
    }));
  } catch {
    return 'unsupported';
  }
  if (!navigator.canShare({ files })) return 'unsupported';
  try {
    await navigator.share({ text: pitchText(), files });
    return 'shared';
  } catch (err) {
    return err?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
