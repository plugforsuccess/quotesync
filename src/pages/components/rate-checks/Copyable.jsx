// src/pages/components/rate-checks/Copyable.jsx
// One-click copy for anything an agent re-keys elsewhere (address, policy #,
// VINs, phone) — and the whole policy as a sheet for the Allstate quote.

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { ADD_ON_CLS, ADD_ON_STYLE } from './ui';

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older Safari / non-secure contexts: fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text) => {
    if (!text) return;
    if (await writeClipboard(text)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }
  };
  return [copied, copy];
}

// Small icon button. `label` is for screen readers ("Copy address").
export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" onClick={e => { e.stopPropagation(); copy(text); }}
      aria-label={copied ? 'Copied' : label} title={copied ? 'Copied' : label}
      className={`inline-flex shrink-0 items-center justify-center rounded p-1 hover:bg-black/10 ${className}`}
      style={{ color: copied ? 'var(--qs-success, #16a34a)' : 'var(--qs-subtle)' }}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// Labelled button: "Copy details for Allstate quote".
export function CopyTextButton({ text, children, className = '', style }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" onClick={() => copy(text)} disabled={!text} className={`inline-flex items-center gap-1.5 ${className}`} style={style}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : children}
    </button>
  );
}

// Label / value row with a copy button. Value stays plain selectable text.
// `addOn` marks something the producer must match on the quote (shown in yellow).
export function Field({ label, value, copy, mono = false, wide = false, hint, hintTone, addOn = false }) {
  const empty = value == null || value === '';
  return (
    <div className="flex items-start justify-between gap-3 py-2" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <dt className={`${wide ? 'w-36 sm:w-52' : 'w-32'} shrink-0 text-sm`} style={{ color: 'var(--qs-subtle)' }}>{label}</dt>
      <dd className="flex min-w-0 flex-1 items-start justify-end gap-1 text-right text-sm">
        <span className="min-w-0">
          <span className={`select-text break-words ${mono ? 'font-mono' : ''} ${addOn && !empty ? ADD_ON_CLS : ''}`}
            style={addOn && !empty ? ADD_ON_STYLE : { color: empty ? 'var(--qs-subtle)' : 'var(--qs-bright)' }}>
            {empty ? 'Not on page' : value}
          </span>
          {hint && <span className={`block text-xs ${hintTone === 'warn' ? 'text-yellow-600' : ''}`} style={hintTone === 'warn' ? undefined : { color: 'var(--qs-subtle)' }}>{hint}</span>}
        </span>
        {copy && !empty && <CopyButton text={typeof copy === 'string' ? copy : String(value)} label={`Copy ${label.toLowerCase()}`} />}
      </dd>
    </div>
  );
}
