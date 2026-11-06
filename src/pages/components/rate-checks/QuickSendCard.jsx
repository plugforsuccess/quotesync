// src/pages/components/rate-checks/QuickSendCard.jsx
// Top of "Links sent": where Quick Send lives (/qs, no login — a Quick Send PIN), and
// the phones signed in to it. Remove a lost phone here and it's signed out at once.

import { T } from '../../../components/SiteCopy';
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
      <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.quicksendcard.5474b4">Quick Send</T></p>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>
        <T k="pages.components.ratechecks.quicksendcard.e827b4">Text someone the upload link while you're talking to them. Open</T> <span className="font-mono"><T k="pages.components.ratechecks.quicksendcard.13b64e">insuredbycam.com/qs</T></span> <T k="pages.components.ratechecks.quicksendcard.5dc1d0">on your phone and sign in with your Quick Send PIN, no QuoteSync login. PINs are set on the Team page.</T>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/qs" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> <T k="pages.components.ratechecks.quicksendcard.876873">Open Quick Send</T>
        </Link>
        <button type="button" onClick={() => setShowPhones(v => !v)} aria-expanded={showPhones}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={inputStyle}>
          <Smartphone className="h-4 w-4" aria-hidden="true" /> <T k="pages.components.ratechecks.quicksendcard.f90fd6">Signed-in Phones (</T>{devices.length})
        </button>
      </div>

      {showPhones && (
        devices.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.quicksendcard.2fced6">No phones signed in yet.</T></p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {devices.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)' }}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{d.producer_name || <T k="pages.components.ratechecks.quicksendcard.7b7194">{'Producer'}</T>} <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}>· {d.label || <T k="pages.components.ratechecks.quicksendcard.77064d">{'Phone'}</T>}</span></p>
                  <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                    {d.expires_at ? <><T k="pages.components.ratechecks.quicksendcard.810760">{"Shared phone · signs out"}</T>{" "}{new Date(d.expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</> : <><T k="pages.components.ratechecks.quicksendcard.1b6c52">{"Signed in"}</T>{" "}{formatDate(d.created_at)}</>}
                    {d.last_used_at ? <>{" "}<T k="pages.components.ratechecks.quicksendcard.c93ba7">{"· last used"}</T>{" "}{formatDate(d.last_used_at)}</> : ''}
                  </p>
                </div>
                <button type="button" onClick={() => { if (window.confirm(`Sign out ${d.producer_name || 'this'}’s ${d.label || 'phone'}? They’ll need their PIN to sign in again.`)) remove.mutate(d.id); }}
                  className="min-h-[36px] shrink-0 rounded-lg px-3 text-sm font-semibold text-red-600" style={inputStyle}>
                  <T k="pages.components.ratechecks.quicksendcard.c87aac">Sign Out</T>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
