// src/pages/components/rate-checks/ui.js
// Shared table styles + formatters for the Rate Checks inbox tabs.

export const thCls = 'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider';
export const thStyle = { color: 'var(--qs-subtle)' };
export const inputStyle = { background: 'var(--qs-elevated)', color: 'var(--qs-text)', border: '1px solid var(--qs-border)' };

export function money(n, { cents = false } = {}) {
  if (n == null || n === '') return '—';
  return `$${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

export function formatPhone(p) {
  const d = (p || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  if (d.length !== 10) return p || '—';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function formatDate(ts) {
  return ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

// Can the competing agent's book be bought? (competitor_agents.book_ownership)
export const BOOK_OWNERSHIP = {
  acquirable:     { label: 'Acquirable',     cls: 'bg-green-100 text-green-700', hint: 'Agent owns the book — a purchase target' },
  allstate:       { label: 'Allstate',       cls: 'bg-primary-100 text-primary-700', hint: 'Buy via Allstate’s agency transfer process' },
  not_acquirable: { label: 'Recruit only',   cls: 'bg-gray-200 text-gray-600', hint: 'Carrier owns the book — recruit, don’t buy' },
  check:          { label: 'Check',          cls: 'bg-yellow-100 text-yellow-700', hint: 'Book ownership varies — confirm before approaching' },
};
