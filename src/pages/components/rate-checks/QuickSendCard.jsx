// src/pages/components/rate-checks/QuickSendCard.jsx
// Top of "Links sent": where Quick Send lives (/qs, works logged out), the agency's
// on/off switch (principal only), and the phones that can send — remove a lost phone
// here and its key stops working at once.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Smartphone } from 'lucide-react';
import { useQuickSendSettings, useSetQuickSendEnabled, useQuickSendDevices, useRemoveQuickSendDevice } from '../../../hooks/useQuickSend';
import { inputStyle, formatDate } from './ui';

export default function QuickSendCard({ agencyId }) {
  const { data: settings } = useQuickSendSettings(agencyId);
  const setEnabled = useSetQuickSendEnabled(agencyId);
  const { data: devices = [] } = useQuickSendDevices(agencyId);
  const remove = useRemoveQuickSendDevice(agencyId);
  const [showPhones, setShowPhones] = useState(false);
  const on = !!settings?.enabled;

  return (
    <div className="dark-card" style={{ padding: 16 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>Quick Send</p>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>
            Text the upload link from the agency&apos;s number while you&apos;re talking — no login needed at <span className="font-mono">insuredbycam.com/qs</span>.
          </p>
        </div>
        {settings?.can_change ? (
          <button type="button" role="switch" aria-checked={on} aria-label="Quick Send on" disabled={setEnabled.isPending}
            onClick={() => setEnabled.mutate(!on)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-primary-600' : ''}`}
            style={on ? undefined : { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        ) : (
          <span className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold" style={{ color: on ? 'var(--qs-success)' : 'var(--qs-subtle)', background: 'var(--qs-elevated)' }}>
            {on ? 'On' : 'Off'}
          </span>
        )}
      </div>
      {setEnabled.error && <p className="mt-2 text-sm text-red-600">{setEnabled.error.message}</p>}
      {!on && settings && (
        <p className="mt-2 text-sm" style={{ color: 'var(--qs-warning)' }}>
          Off — nothing can be sent until {settings.can_change ? 'you turn it on' : 'the principal turns it on'}.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/qs" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open Quick Send
        </Link>
        <button type="button" onClick={() => setShowPhones(v => !v)} aria-expanded={showPhones}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={inputStyle}>
          <Smartphone className="h-4 w-4" aria-hidden="true" /> Phones ({devices.length})
        </button>
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--qs-subtle)' }}>
        On your own phone: open Quick Send while logged in and tap “Set up Quick Send on this phone,” then add it to your home screen.
        Anyone else can sign in there with their time-clock PIN for the day.
      </p>

      {showPhones && (
        devices.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--qs-subtle)' }}>No phones set up yet.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {devices.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)' }}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{d.producer_name || 'Producer'} <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}>· {d.label || 'Phone'}</span></p>
                  <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                    {d.expires_at ? `PIN sign-in · ends ${new Date(d.expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `Set up ${formatDate(d.created_at)}`}
                    {d.last_used_at ? ` · last used ${formatDate(d.last_used_at)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => { if (window.confirm(`Remove ${d.producer_name || 'this'}’s ${d.label || 'phone'}? It will need to be set up again.`)) remove.mutate(d.id); }}
                  className="min-h-[36px] shrink-0 rounded-lg px-3 text-sm font-semibold text-red-600" style={inputStyle}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
