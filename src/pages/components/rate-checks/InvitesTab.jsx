// src/pages/components/rate-checks/InvitesTab.jsx
// "Invites" tab: links producers have sent, who uploaded, who hasn't yet —
// and a per-event / per-producer tally so a booth day can be scored.

import { useMemo, useState } from 'react';
import { useRateCheckInvites } from '../../../hooks/useRateChecks';
import { thCls, thStyle, inputStyle, formatPhone, formatDate } from './ui';
import { InviteShare } from './InviteDialog';

function ago(ts) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  return formatDate(ts);
}

export default function InvitesTab({ agencyId, producerName, onOpenRateCheck }) {
  const { data: invites = [], isLoading, error } = useRateCheckInvites(agencyId);
  const [filter, setFilter] = useState('all'); // all | waiting | uploaded
  const [event, setEvent] = useState('');
  const [resend, setResend] = useState(null);

  const events = useMemo(() => [...new Set(invites.map(i => i.event_name).filter(Boolean))], [invites]);
  const rows = useMemo(() => invites
    .filter(i => !event || i.event_name === event)
    .filter(i => filter === 'all' || (filter === 'waiting' ? i.upload_count === 0 : i.upload_count > 0)),
  [invites, filter, event]);

  // Scoreboard: event × producer.
  const tally = useMemo(() => {
    const m = new Map();
    invites.filter(i => !event || i.event_name === event).forEach(i => {
      const k = `${i.event_name || '(no event)'}|${i.producer_name || 'Unknown'}`;
      const t = m.get(k) || { event: i.event_name || '(no event)', producer: i.producer_name || 'Unknown', sent: 0, opened: 0, uploaded: 0 };
      t.sent += 1; if (i.opened_at) t.opened += 1; if (i.upload_count > 0) t.uploaded += 1;
      m.set(k, t);
    });
    return [...m.values()].sort((a, b) => b.uploaded - a.uploaded || b.sent - a.sent);
  }, [invites, event]);

  const waiting = invites.filter(i => i.upload_count === 0 && new Date(i.expires_at) > new Date()).length;

  return (
    <div className="space-y-4">
      {tally.length > 0 && (
        <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
          <div className="px-3 py-2 text-sm font-semibold" style={{ borderBottom: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>Scoreboard</div>
          <table className="min-w-full">
            <thead><tr style={{ background: 'var(--qs-elevated)' }}>
              {['Event', 'Producer', 'Links sent', 'Opened', 'Uploaded', 'Upload rate'].map(h => <th key={h} className={thCls} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {tally.map(t => (
                <tr key={`${t.event}|${t.producer}`} style={{ borderTop: '1px solid var(--qs-border)' }}>
                  <td className="px-4 py-2 text-sm" style={{ color: 'var(--qs-bright)' }}>{t.event}</td>
                  <td className="px-4 py-2 text-sm" style={{ color: 'var(--qs-text)' }}>{t.producer}</td>
                  <td className="px-4 py-2 text-sm" style={{ color: 'var(--qs-text)' }}>{t.sent}</td>
                  <td className="px-4 py-2 text-sm" style={{ color: 'var(--qs-text)' }}>{t.opened}</td>
                  <td className="px-4 py-2 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{t.uploaded}</td>
                  <td className="px-4 py-2 text-sm" style={{ color: 'var(--qs-text)' }}>{t.sent ? `${Math.round((t.uploaded / t.sent) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
        <div className="flex flex-wrap items-center gap-2 p-3 text-sm" style={{ borderBottom: '1px solid var(--qs-border)' }}>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--qs-elevated)' }}>
            {[['all', `All ${invites.length}`], ['waiting', `Not uploaded yet ${waiting}`], ['uploaded', `Uploaded ${invites.length - invites.filter(i => i.upload_count === 0).length}`]].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ${filter === v ? 'bg-primary-600 text-white' : ''}`}
                style={filter === v ? undefined : { color: 'var(--qs-text)' }}>{l}</button>
            ))}
          </div>
          {events.length > 0 && (
            <select value={event} onChange={e => setEvent(e.target.value)} className="dark-select ml-auto" style={{ width: 'auto', ...inputStyle }}>
              <option value="">All events</option>
              {events.map(ev => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">Error loading invites.</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
            {invites.length === 0 ? 'No links sent yet. Use “Send a link” for someone who doesn’t have their policy with them.' : 'Nothing matches.'}
          </div>
        ) : (
          <ul>
            {rows.map(i => {
              const expired = new Date(i.expires_at) < new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm" style={{ borderTop: '1px solid var(--qs-border)' }}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium" style={{ color: 'var(--qs-bright)' }}>
                      {i.first_name || 'No name'}{i.phone && <span className="font-normal" style={{ color: 'var(--qs-text)' }}> · {formatPhone(i.phone)}</span>}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                      {[i.event_name, i.producer_name && `sent by ${i.producer_name}`, ago(i.created_at)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
                    {i.upload_count > 0
                      ? <span className="font-semibold text-green-600">Uploaded {i.upload_count > 1 ? `×${i.upload_count}` : ''}</span>
                      : expired ? 'Expired'
                      : i.opened_at ? `Opened ${ago(i.opened_at)}, not uploaded`
                      : 'Not opened'}
                  </div>
                  {i.upload_count > 0 && i.last_rate_check_id && onOpenRateCheck && (
                    <button onClick={() => onOpenRateCheck(i.last_rate_check_id)} className="text-primary-600 hover:underline">Open</button>
                  )}
                  {i.upload_count === 0 && !expired && (
                    <button onClick={() => setResend(i)} className="text-primary-600 hover:underline">Resend</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {resend && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Resend link">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResend(null)} />
          <div className="relative w-full max-w-md rounded-xl p-5 shadow-xl" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
            <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>Resend to {resend.first_name || 'customer'}</h2>
            <InviteShare invite={resend} producerName={resend.producer_name || producerName} onDone={() => setResend(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
