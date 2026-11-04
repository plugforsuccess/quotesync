// src/components/Dismissible.jsx
// An alert note with an X. Closing it is remembered on this device for 24 hours; it
// comes back sooner if `version` changes (pass something that changes when the message does).
// Not for errors, security notices (impersonation) or legal disclosures.
import { useState } from 'react';
import { X } from 'lucide-react';

const STORE = 'qs_dismissed_v1';
const DAY = 24 * 60 * 60 * 1000;
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
// Closed = same message, closed less than 24 hours ago.
const isClosed = (entry, version) =>
  !!entry && typeof entry === 'object' && entry.v === String(version) && Date.now() - Number(entry.at) < DAY;

export default function Dismissible({ id, version = '1', children, className = '', light = false }) {
  const [closed, setClosed] = useState(() => isClosed(read()[id], version));
  if (closed) return null;
  const close = () => {
    try { localStorage.setItem(STORE, JSON.stringify({ ...read(), [id]: { v: String(version), at: Date.now() } })); } catch { /* private mode: closes for now */ }
    setClosed(true);
  };
  return (
    <div className={`relative [&>*:first-child]:pr-10 ${className}`}>
      {children}
      <button type="button" onClick={close} aria-label="Close this note" title="Close"
        className={`absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${light ? 'text-slate-500 hover:bg-black/5' : 'opacity-70 hover:bg-white/10 hover:opacity-100'}`}
        style={light ? undefined : { color: 'var(--qs-subtle)' }}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
