// src/components/ThemeToggle.jsx
import { useTheme, THEMES } from '../contexts/ThemeContext';

// ── Pill variant — compact 3-button row ───────────────────────
// Used in Layout.jsx (principal/platform nav bar)
function PillToggle({ theme, setTheme }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: 'var(--qs-elevated)',
      border: '1px solid var(--qs-border)',
      borderRadius: 8,
      padding: 2,
      gap: 1,
    }}>
      {THEMES.map(t => (
        <button
          key={t.key}
          onClick={() => setTheme(t.key)}
          title={t.label}
          style={{
            width: 28, height: 28,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: theme === t.key ? 'var(--qs-card)' : 'transparent',
            boxShadow: theme === t.key ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
            transition: 'all 0.15s',
            opacity: theme === t.key ? 1 : 0.45,
          }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

// ── Switch variant — labeled selector for employee sidebar ────
function SwitchToggle({ theme, setTheme }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: 'var(--qs-muted)',
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
