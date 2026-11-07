// src/pages/components/rate-checks/InvitesTab.jsx
// "Links sent": links producers have sent, who uploaded, who hasn't yet. A stat
// row up top (with a per-producer / per-event breakdown once there's more than
// one), then one card per link. "Opened, not uploaded" is the warmest lead in
// the list, so it gets a Nudge text; expired links sit at the bottom, hidden.

import { T } from '../../../components/SiteCopy';
import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useRateCheckInvites, useRateCheckInviteStats } from '../../../hooks/useRateChecks';
import { inputStyle, formatPhone, formatDate, money } from './ui';
import { InviteShare } from './InviteDialog';
import { inviteUrl, smsUrl } from './invite';
import { sentFromOwnPhone } from '../../../lib/quickSendFormat';
import QuickSendCard from './QuickSendCard';

function ago(ts) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  return formatDate(ts);
}

// "Oct 22" this year, "Oct 22, 2025" before; minutes and hours for today.
function short(ts) {
  const d = new Date(ts);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 24 * 60) return ago(ts);
  return d.toLocaleDateString('en-US', d.getFullYear() === new Date().getFullYear() ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
}

const isExpired = (i) => new Date(i.expires_at) < new Date();
const stateOf = (i) => (i.upload_count > 0 ? 'uploaded' : isExpired(i) ? 'expired' : i.opened_at ? 'opened' : 'sent');
// A colored dot carries the state; the label stays plain text so it reads in either theme.
const PILL = {
  uploaded: { label: (i) => `Uploaded${i.upload_count > 1 ? ` ×${i.upload_count}` : ''}`, dot: '#16A34A' },
  opened: { label: (i) => `Opened ${short(i.opened_at)} · no upload`, dot: '#F59E0B' },
  sent: { label: () => 'Not opened yet', dot: '#94A3B8' },
  expired: { label: () => 'Expired', dot: '#CBD5E1' },
};

// A Quick Send text that never reached them: worth a call or a QR in person instead.
// Not a problem when they opened it, or when it went from the producer's own phone
// (before the agency's number is set up).
const textProblem = (i) => (i.source !== 'quick_send' || i.upload_count > 0 ? null
  : i.sms_status === 'blocked' ? 'Not texted — this number texted STOP'
    : i.sms_status === 'failed' && !i.opened_at && !sentFromOwnPhone(i) ? 'Text didn’t go through' : null);

const nudgeText = (i) => `Hi${i.first_name ? ` ${i.first_name}` : ''}, saw you opened the link — just snap a photo of your dec page and I'll do the rest: ${inviteUrl(i.code)}`;

function Stat({ label, value }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{value}</p>
      <p className="truncate text-xs" style={{ color: 'var(--qs-subtle)' }}><T>{label}</T></p>
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
              {total('won')} <T k="pages.components.ratechecks.invitestab.296e48">won ·</T> {total('bound')} <T k="pages.components.ratechecks.invitestab.e0e0b8">bound ·</T> <b className="text-green-600">{money(total('bound_premium'))}<T k="pages.components.ratechecks.invitestab.6d8fef">/yr</T></b>
            </p>
          )}
          {/* Who and where it's working — only worth showing with more than one row. */}
          {tally.length > 1 && (
            <ul className="mt-3 space-y-1.5">
              {tally.map(t => (
                <li key={`${t.event}|${t.producer}`} className="rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)' }}>
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{t.producer} <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}>· {t.event}</span></p>
                  <p className="text-xs tabular-nums" style={{ color: 'var(--qs-subtle)' }}>
                    {t.invites} <T k="pages.components.ratechecks.invitestab.14a41a">links ·</T> {t.opened} <T k="pages.components.ratechecks.invitestab.570ead">opened ·</T> {t.uploaded} <T k="pages.components.ratechecks.invitestab.307f8c">uploaded ·</T> {t.quoted} <T k="pages.components.ratechecks.invitestab.4bc966">quoted ·</T> {t.won} <T k="pages.components.ratechecks.invitestab.296e48">won ·</T> {t.bound} <T k="pages.components.ratechecks.invitestab.b9f2b5">bound</T>
                    {Number(t.bound_premium) > 0 && <span className="font-semibold text-green-600"> · {money(t.bound_premium)}<T k="pages.components.ratechecks.invitestab.6d8fef">/yr</T></span>}
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
                <T>{l}</T> <span className={filter === v ? 'opacity-80' : ''} style={filter === v ? undefined : { color: 'var(--qs-subtle)' }}>{n}</span>
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
          <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.invitestab.5f02f0">Loading…</T></div>
        ) : error ? (
          <div className="p-8 text-center text-red-600"><T k="pages.components.ratechecks.invitestab.3c6c93">Error loading links.</T></div>
        ) : matching.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
            {invites.length === 0 ? <T k="pages.components.ratechecks.invitestab.34a451">{'No links sent yet. Use “Send a link” for someone who doesn’t have their policy with them.'}</T> : <T k="pages.components.ratechecks.invitestab.9f8576">{'Nothing matches.'}</T>}
          </div>
        ) : (
          <>
            <ul>
              {live.map(i => <InviteRow key={i.id} i={i} onOpen={onOpenRateCheck} onResend={() => setResend(i)} />)}
            </ul>
            {expired.length > 0 && (
              <>
                <button type="button" onClick={() => setShowExpired(v => !v)} className="min-h-[44px] w-full px-4 text-left text-sm font-semibold text-primary-600" style={{ borderTop: '1px solid var(--qs-border)' }}>
                  {showExpired ? <T k="pages.components.ratechecks.invitestab.2fb10d">{'Hide Expired'}</T> : <><T k="pages.components.ratechecks.invitestab.0a3633">{"Show Expired ("}</T>{expired.length}{")"}</>}
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
            <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.invitestab.4a863f">Resend to</T> {resend.first_name || <T k="pages.components.ratechecks.invitestab.0e8574">{'Customer'}</T>}</h2>
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
  const problem = textProblem(i);
  const meta = [i.source === 'quick_send' ? 'Quick Send' : i.event_name || 'Direct link', i.producer_name && `Sent by ${i.producer_name}`, short(i.created_at)].filter(Boolean).join(' · ');
  const btn = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold';
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-bright)' }} aria-hidden="true">
          {(i.first_name || '?').trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-tight">
            <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{i.first_name || <T k="pages.components.ratechecks.invitestab.b78fd2">{'No name'}</T>}</span>
            {i.phone && <span className="whitespace-nowrap tabular-nums" style={{ color: 'var(--qs-subtle)' }}>{formatPhone(i.phone)}</span>}
          </p>
          <p className="mt-1 text-xs sm:truncate" style={{ color: 'var(--qs-subtle)' }}>{meta}</p>
          {problem && <p className="mt-1 text-xs font-semibold text-red-600">{problem}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-[52px] sm:flex-nowrap sm:pl-0">
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-text)' }}>
          <span className="h-2 w-2 rounded-full" style={{ background: pill.dot }} aria-hidden="true" />{pill.label(i)}
        </span>
        <div className="flex w-full items-center gap-2 sm:ml-2 sm:w-[196px] sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          {state === 'uploaded' && i.last_rate_check_id && onOpen && (
            <button onClick={() => onOpen(i.last_rate_check_id)} className={btn} style={inputStyle}><T k="pages.components.ratechecks.invitestab.c3bf44">Open</T></button>
          )}
          {(state === 'opened' || state === 'sent') && onResend && (
            <button onClick={onResend} className={btn} style={inputStyle}><T k="pages.components.ratechecks.invitestab.1c0b8f">Resend</T></button>
          )}
          {state === 'opened' && i.phone && (
            <a href={smsUrl(i, nudgeText(i))} className={`${btn} bg-primary-600 text-white`}>
              <MessageSquare className="h-4 w-4" aria-hidden="true" /> <T k="pages.components.ratechecks.invitestab.bcd792">Nudge</T>
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
