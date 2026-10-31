// src/pages/components/rate-checks/QuickSendCard.jsx
// Top of "Links sent": where Quick Send lives (/qs, no login — a Quick Send PIN), and
// the phones signed in to it. Remove a lost phone here and it's signed out at once.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Smartphone } from 'lucide-react';
import { useQuickSendDevices, useRemoveQuickSendDevice } from '../../../hooks/useQuickSend';
import { inputStyle, formatDate } from './ui';

export default function QuickSendCard({ agencyId }) {
  const { data: devices = [] } = useQuickSendDevices(agencyId);
  const remove = useRemoveQuickSendDevice(agencyId);
  const [showPhones, setShowPhones] = useState(false);

  return (
    <div className="dark-card" style={{ padding: 16 }}>
      <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>Quick Send</p>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>
        Text someone the upload link while you&apos;re talking to them. Open <span className="font-mono">insuredbycam.com/qs</span> on
        your phone and sign in with your Quick Send PIN, no QuoteSync login. PINs are set on the Team page.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/qs" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open Quick Send
        </Link>
        <button type="button" onClick={() => setShowPhones(v => !v)} aria-expanded={showPhones}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={inputStyle}>
          <Smartphone className="h-4 w-4" aria-hidden="true" /> Signed-in phones ({devices.length})
        </button>
      </div>

      {showPhones && (
        devices.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--qs-subtle)' }}>No phones signed in yet.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {devices.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)' }}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{d.producer_name || 'Producer'} <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}>· {d.label || 'Phone'}</span></p>
                  <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                    {d.expires_at ? `Shared phone · signs out ${new Date(d.expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `Signed in ${formatDate(d.created_at)}`}
                    {d.last_used_at ? ` · last used ${formatDate(d.last_used_at)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => { if (window.confirm(`Sign out ${d.producer_name || 'this'}’s ${d.label || 'phone'}? They’ll need their PIN to sign in again.`)) remove.mutate(d.id); }}
                  className="min-h-[36px] shrink-0 rounded-lg px-3 text-sm font-semibold text-red-600" style={inputStyle}>
                  Sign out
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
