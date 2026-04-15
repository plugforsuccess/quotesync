// src/components/ThemeToggle.jsx
import { useState, useRef, useEffect } from 'react';
import { useTheme, THEMES } from '../contexts/ThemeContext';

// ── Pill variant — single icon with dropdown ──────────────────
// Used in Layout.jsx (principal/platform nav bar). Shows only the
// current theme's icon; clicking opens a small popover that lets the
// user pick from all three options.
function PillToggle({ theme, setTheme }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const current = THEMES.find(t => t.key === theme) ?? THEMES[0];

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Theme: ${current.label}`}
        aria-label={`Theme: ${current.label}. Click to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 32, height: 32,
          borderRadius: 8,
          border: '1px solid var(--qs-border)',
          background: 'var(--qs-elevated)',
          cursor: 'pointer',
          fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        {current.icon}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 168,
            background: 'var(--qs-card)',
            border: '1px solid var(--qs-border)',
            borderRadius: 10,
            padding: 4,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.35), 0 8px 10px -6px rgba(0,0,0,0.25)',
            zIndex: 60,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: 'var(--qs-subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            padding: '6px 10px 4px',
          }}>
            Theme
          </div>
          {THEMES.map(t => {
            const active = theme === t.key;
            return (
              <button
                key={t.key}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => { setTheme(t.key); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 7,
                  border: 'none',
                  background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left', width: '100%',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--qs-elevated)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, width: 18, textAlign: 'center' }}>{t.icon}</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#3B82F6' : 'var(--qs-text)',
                  flex: 1,
                }}>
                  {t.label}
                </span>
                {active && (
                  <span style={{
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: '#3B82F6',
                    flexShrink: 0,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Switch variant — labeled selector for employee sidebar ────
// Shows all three options inline, always visible.
function SwitchToggle({ theme, setTheme }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: 'var(--qs-subtle)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 6,
      }}>
        Theme
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {THEMES.map(t => (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 7,
              border: theme === t.key
                ? '1px solid rgba(59,130,246,0.35)'
                : '1px solid transparent',
              background: theme === t.key
                ? 'rgba(59,130,246,0.10)'
                : 'transparent',
              cursor: 'pointer',
              textAlign: 'left', width: '100%',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
            <span style={{
              fontSize: 13,
              fontWeight: theme === t.key ? 600 : 400,
              color: theme === t.key ? '#3B82F6' : 'var(--qs-dim)',
            }}>
              {t.label}
            </span>
            {theme === t.key && (
              <span style={{
                marginLeft: 'auto',
                width: 6, height: 6,
                borderRadius: '50%',
                background: '#3B82F6',
                flexShrink: 0,
              }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────
export default function ThemeToggle({ variant = 'pill' }) {
  const { theme, setTheme } = useTheme();
  if (variant === 'pill')   return <PillToggle   theme={theme} setTheme={setTheme} />;
  if (variant === 'switch') return <SwitchToggle theme={theme} setTheme={setTheme} />;
  return null;
}
