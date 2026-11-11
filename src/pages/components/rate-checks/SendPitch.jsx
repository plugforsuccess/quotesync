// src/pages/components/rate-checks/SendPitch.jsx
import { T } from '../../../components/SiteCopy';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { sharePitch, pitchWithLinks } from './partnerPitch';

// Sends the partner pitch (a short text and four screenshots) to someone you'd like as a
// partner: the phone's share sheet with the pictures attached, or else a text with links.
export default function SendPitch({ className = '' }) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const result = await sharePitch();
    setBusy(false);
    if (result === 'unsupported') window.location.href = `sms:?&body=${encodeURIComponent(pitchWithLinks())}`;
  };
  return (
    <button type="button" onClick={send} disabled={busy} aria-label="Send affiliate pitch" title="Text someone the affiliate pitch: a short message and 4 screenshots"
      className={`inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 disabled:opacity-60 ${className}`}
      style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
      <Send className="h-4 w-4" aria-hidden="true" /> {busy ? <T k="pages.components.ratechecks.sendpitch.b1b853">{'Opening…'}</T> : <T k="pages.components.ratechecks.sendpitch.34dfa2">{'Send Pitch'}</T>}
    </button>
  );
}

