// Small reusable "copy to clipboard" button with transient "Copied!" feedback.
// Used to paste QuoteSync records into Allstate's internal system.

import { useState, useRef, useEffect } from 'react';
import { copyText } from '../lib/allstateClipboard';

export default function CopyButton({ getText, label = 'Copy', copiedLabel = 'Copied!', title, style }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const text = typeof getText === 'function' ? getText() : getText;
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title || 'Copy for Allstate'}
      style={{
        cursor: 'pointer', border: '1px solid var(--qs-border)',
        background: copied ? '#10B98122' : 'var(--qs-card)',
        color: copied ? '#34D399' : 'var(--qs-muted)',
        borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700,
        fontFamily: 'inherit', whiteSpace: 'nowrap', ...style,
      }}
    >
      {copied ? `✓ ${copiedLabel}` : `⧉ ${label}`}
    </button>
  );
}
