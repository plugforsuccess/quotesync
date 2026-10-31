// src/pages/components/rate-checks/InvitesTab.jsx
// "Links sent": links producers have sent, who uploaded, who hasn't yet. A stat
// row up top (with a per-producer / per-event breakdown once there's more than
// one), then one card per link. "Opened, not uploaded" is the warmest lead in
// the list, so it gets a Nudge text; expired links sit at the bottom, hidden.

import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useRateCheckInvites, useRateCheckInviteStats } from '../../../hooks/useRateChecks';
import { inputStyle, formatPhone, formatDate, money } from './ui';
import { InviteShare } from './InviteDialog';
import { inviteUrl, smsUrl } from './invite';
import QuickSendCard from './QuickSendCard';

function ago(ts) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  return formatDate(ts);
}

const isExpired = (i) => new Date(i.expires_at) < new Date();
const stateOf = (i) => (i.upload_count > 0 ? 'uploaded' : isExpired(i) ? 'expired' : i.opened_at ? 'opened' : 'sent');
const PILL = {
  uploaded: { label: (i) => `Uploaded${i.upload_count > 1 ? ` ×${i.upload_count}` : ''}`, color: 'var(--qs-success)', bg: 'var(--qs-success-subtle)', border: 'var(--qs-success-border)' },
  opened: { label: (i) => `Opened ${ago(i.opened_at)} · not uploaded`, color: 'var(--qs-warning)', bg: 'var(--qs-warning-subtle)', border: 'var(--qs-warning-border)' },
  sent: { label: () => 'Not opened yet', color: 'var(--qs-subtle)', bg: 'var(--qs-elevated)', border: 'var(--qs-border)' },
  expired: { label: () => 'Expired', color: 'var(--qs-subtle)', bg: 'var(--qs-elevated)', border: 'var(--qs-border)' },
};

// A Quick Send text that never reached them: worth a call or a QR in person instead.
const textProblem = (i) => (i.source !== 'quick_send' || i.upload_count > 0 ? null
  : i.sms_status === 'blocked' ? 'Not texted — this number texted STOP'
    : i.sms_status === 'failed' ? 'Text didn’t go through' : null);

const nudgeText = (i) => `Hi${i.first_name ? ` ${i.first_name}` : ''}, saw you opened the link — just snap a photo of your dec page and I'll do the rest: ${inviteUrl(i.code)}`;

function Stat({ label, value }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{value}</p>
      <p className="truncate text-xs" style={{ color: 'var(--qs-subtle)' }}>{label}</p>
    </div>
  );
}

export default function InvitesTab({ agencyId, producerName, onOpenRateCheck }) {
  const { data: invites = [], isLoading, error } = useRateCheckInvites(agencyId);
  const { data: stats = [] } = useRateCheckInviteStats(agencyId);
  const [filter, setFilter] = useState('all'); // all | waiting | uploaded
  const [event, setEvent] = useState('');
  const [resend, setResend] = useState(null);
  const [showExpired, setShowExpired] = useState(false);

  const events = useMemo(() => [...new Set(invites.map(i => i.event_name).filter(Boolean))], [invites]);
  const matching = useMemo(() => invites
    .filter(i => !event || i.event_name === event)
    .filter(i => filter === 'all' || (filter === 'waiting' ? i.upload_count === 0 : i.upload_count > 0)), [invites, filter, event]);
  // Opened-not-uploaded first (warmest), then not opened, then uploaded; expired apart.
  const ORDER = { opened: 0, sent: 1, uploaded: 2 };
  const live = matching.filter(i => stateOf(i) !== 'expired')
    .sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)] || new Date(b.created_at) - new Date(a.created_at));
  const expired = matching.filter(i => stateOf(i) === 'expired');

  // Scoreboard: event × producer, through to bound premium (rate_check_invite_stats).
  const tally = useMemo(() => stats
    .filter(t => !event || t.event_name === event)
    .map(t => ({ ...t, event: t.event_name || 'Direct link', producer: t.producer_name || 'Unknown' }))
    .sort((a, b) => Number(b.bound) - Number(a.bound) || Number(b.won) - Number(a.won) || Number(b.uploaded) - Number(a.uploaded)),
  [stats, event]);
  const total = (f) => tally.reduce((t, r) => t + Number(r[f] || 0), 0);
  const links = total('invites'), uploaded = total('uploaded');
  const waiting = invites.filter(i => i.upload_count === 0 && !isExpired(i)).length;

  return (
    <div className="space-y-4">
      <QuickSendCard agencyId={agencyId} />
      {tally.length > 0 && (
        <div className="dark-card" style={{ padding: 16 }}>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Links" value={links} />
            <Stat label="Opened" value={total('opened')} />
            <Stat label="Uploaded" value={uploaded} />
            <Stat label="Conversion" value={links ? `${Math.round((uploaded / links) * 100)}%` : '—'} />
          </div>
          {total('bound') > 0 && (
            <p className="mt-3 text-center text-sm" style={{ color: 'var(--qs-text)' }}>
              {total('won')} won · {total('bound')} bound · <b className="text-green-600">{money(total('bound_premium'))}/yr</b>
            </p>
          )}
          {/* Who and where it's working — only worth showing with more than one row. */}
          {tally.length > 1 && (
            <ul className="mt-3 space-y-1.5">
              {tally.map(t => (
                <li key={`${t.event}|${t.producer}`} className="rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)' }}>
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{t.producer} <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}>· {t.event}</span></p>
                  <p className="text-xs tabular-nums" style={{ color: 'var(--qs-subtle)' }}>
                    {t.invites} links · {t.opened} opened · {t.uploaded} uploaded · {t.quoted} quoted · {t.won} won · {t.bound} bound
                    {Number(t.bound_premium) > 0 && <span className="font-semibold text-green-600"> · {money(t.bound_premium)}/yr</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
        <div className="flex flex-wrap items-center gap-2 p-3 text-sm" style={{ borderBottom: '1px solid var(--qs-border)' }}>
          <div className="grid w-full grid-cols-3 gap-1 rounded-lg p-1 sm:flex sm:w-auto" style={{ background: 'var(--qs-elevated)' }}>
            {[['all', 'All', invites.length], ['waiting', 'Waiting', waiting], ['uploaded', 'Uploaded', invites.filter(i => i.upload_count > 0).length]].map(([v, l, n]) => (
              <button key={v} onClick={() => setFilter(v)} className={`min-h-[36px] whitespace-nowrap rounded-md px-3 text-sm font-medium ${filter === v ? 'bg-primary-600 text-white' : ''}`}
                style={filter === v ? undefined : { color: 'var(--qs-text)' }}>
                {l} <span className={filter === v ? 'opacity-80' : ''} style={filter === v ? undefined : { color: 'var(--qs-subtle)' }}>{n}</span>
              </button>
            ))}
          </div>
          {events.length > 0 && (
            <select value={event} onChange={e => setEvent(e.target.value)} className="dark-select w-full sm:ml-auto sm:w-auto" style={inputStyle} aria-label="Event">
              <option value="">All events</option>
              {events.map(ev => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">Error loading links.</div>
        ) : matching.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
            {invites.length === 0 ? 'No links sent yet. Use “Send a link” for someone who doesn’t have their policy with them.' : 'Nothing matches.'}
          </div>
        ) : (
          <>
            <ul>
              {live.map(i => <InviteRow key={i.id} i={i} onOpen={onOpenRateCheck} onResend={() => setResend(i)} />)}
            </ul>
            {expired.length > 0 && (
              <>
                <button type="button" onClick={() => setShowExpired(v => !v)} className="min-h-[44px] w-full px-4 text-left text-sm font-semibold text-primary-600" style={{ borderTop: '1px solid var(--qs-border)' }}>
                  {showExpired ? 'Hide expired' : `Show expired (${expired.length})`}
                </button>
                {showExpired && <ul className="opacity-60">{expired.map(i => <InviteRow key={i.id} i={i} onOpen={onOpenRateCheck} />)}</ul>}
              </>
            )}
          </>
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

function InviteRow({ i, onOpen, onResend }) {
  const state = stateOf(i);
  const pill = PILL[state];
  return (
    <li className="px-4 py-3 text-sm" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>
            {i.first_name || 'No name'}
            {i.phone && <span className="ml-1.5 whitespace-nowrap font-normal" style={{ color: 'var(--qs-text)' }}>{formatPhone(i.phone)}</span>}
          </p>
          <span className="mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold" style={{ color: pill.color, background: pill.bg, border: `1px solid ${pill.border}` }}>{pill.label(i)}</span>
          {textProblem(i) && <p className="mt-1 text-xs font-semibold text-red-600">{textProblem(i)}</p>}
          <p className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>
            {[i.source === 'quick_send' ? 'Quick Send' : i.event_name || 'Direct link', i.producer_name && `sent by ${i.producer_name}`, ago(i.created_at)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {state === 'uploaded' && i.last_rate_check_id && onOpen && (
            <button onClick={() => onOpen(i.last_rate_check_id)} className="min-h-[40px] rounded-lg px-3 font-semibold" style={inputStyle}>Open</button>
          )}
          {state === 'opened' && i.phone && (
            <a href={smsUrl(i, nudgeText(i))} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-primary-600 px-3 font-semibold text-white">
              <MessageSquare className="h-4 w-4" aria-hidden="true" /> Nudge
            </a>
          )}
          {(state === 'opened' || state === 'sent') && onResend && (
            <button onClick={onResend} className={`min-h-[40px] rounded-lg px-3 font-semibold ${state === 'opened' ? 'text-primary-600' : ''}`} style={state === 'opened' ? undefined : inputStyle}>Resend</button>
          )}
        </div>
      </div>
    </li>
  );
}
