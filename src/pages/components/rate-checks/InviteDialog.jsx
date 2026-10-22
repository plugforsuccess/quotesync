// src/pages/components/rate-checks/InviteDialog.jsx
// "Send a link" from the Rate Checks inbox — for people met at an event who
// don't have their dec page on them. The producer texts/emails the short link
// from their own phone; the upload later lands tagged with producer + event.

import { useEffect, useRef, useState } from 'react';
import { Mail, MessageSquare, Share2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useCreateRateCheckInvite, useRateCheckEvents } from '../../../hooks/useRateChecks';
import { formatPhoneInput } from '../../../lib/rateCheckApi';
import { inputStyle, formatPhone } from './ui';
import { CopyTextButton } from './Copyable';
import { inviteUrl, inviteMessage } from './invite';

export default function InviteDialog({ agencyId, userId, producerName, onClose, onCreated }) {
  const create = useCreateRateCheckInvite();
  const { data: events = [] } = useRateCheckEvents(agencyId);
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [eventName, setEventName] = useState(() => {
    try { return sessionStorage.getItem('qs_rc_event') || ''; } catch { return ''; }
  });
  const invite = create.data;

  const phoneDigits = phone.replace(/\D/g, '');
  const canSubmit = !create.isPending && (phoneDigits.length === 0 || phoneDigits.length === 10);

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    try { sessionStorage.setItem('qs_rc_event', eventName.trim()); } catch { /* ignore */ }
    create.mutate({ agencyId, userId, producerName, eventName, firstName, phone: phoneDigits }, { onSuccess: (row) => onCreated?.(row) });
  };

  const field = 'w-full rounded-md px-3 py-2 text-sm';
  const label = (t) => <span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>{t}</span>;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Send a Rate Check link">
      <div className="absolute inset-0 bg-black/50" onClick={create.isPending ? undefined : onClose} />
      <div className="relative w-full max-w-md space-y-4 rounded-xl p-5 shadow-xl"
        style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>{invite ? 'Link ready' : 'Send a link'}</h2>
            <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
              {invite ? 'Send it from your own phone. Their upload comes back tagged to you.' : 'For someone who doesn’t have their policy on them.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5" style={inputStyle}><X className="w-4 h-4" /></button>
        </div>

        {!invite ? (
          <form onSubmit={submit} className="space-y-3">
            <label>{label('Event')}
              <input className={field} style={inputStyle} list="rc-events" value={eventName} onChange={e => setEventName(e.target.value)}
                placeholder="e.g. Gwinnett Chamber expo" maxLength={80} />
              <datalist id="rc-events">{events.map(ev => <option key={ev.event_name} value={ev.event_name} />)}</datalist>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>{label('First name')}
                <input className={field} style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={60} autoFocus />
              </label>
              <label>{label('Mobile (optional)')}
                <input className={field} style={inputStyle} type="tel" inputMode="tel" placeholder="(404) 555-1212"
                  value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} />
              </label>
            </div>
            <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
              They tick the texting consent themselves when they upload, so nothing is sent automatically until then.
            </p>
            {create.isError && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{create.error.message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm" style={inputStyle}>Cancel</button>
              <button type="submit" disabled={!canSubmit} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {create.isPending ? 'Creating…' : 'Create link'}
              </button>
            </div>
          </form>
        ) : (
          <InviteShare invite={invite} producerName={producerName} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

export function InviteShare({ invite, producerName, onDone }) {
  const canvas = useRef(null);
  const [shareError, setShareError] = useState('');
  const url = inviteUrl(invite.code);
  const producerFirst = (producerName || '').split(' ')[0];
  const message = inviteMessage(invite, producerFirst);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (canvas.current) QRCode.toCanvas(canvas.current, url, { width: 180, margin: 1 }).catch(() => {});
  }, [url]);

  const share = async () => {
    try { await navigator.share({ text: message }); } catch (e) { if (e?.name !== 'AbortError') setShareError('Couldn’t open the share sheet — copy the message instead.'); }
  };

  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <canvas ref={canvas} className="rounded-lg bg-white p-1" aria-label="QR code for the link" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{invite.first_name || 'Customer'}{invite.phone ? ` · ${formatPhone(invite.phone)}` : ''}</p>
          {invite.event_name && <p style={{ color: 'var(--qs-subtle)' }}>{invite.event_name}</p>}
          <p className="mt-2 select-all break-all font-mono text-xs" style={{ color: 'var(--qs-text)' }}>{url}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>They can also scan this if they’re with you. Expires in 30 days.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {invite.phone ? (
          <a href={`sms:+1${invite.phone}?&body=${encodeURIComponent(message)}`} className={`${btn} bg-primary-600 text-white`}>
            <MessageSquare className="h-4 w-4" /> Text it
          </a>
        ) : (
          <a href={`sms:?&body=${encodeURIComponent(message)}`} className={`${btn} bg-primary-600 text-white`}>
            <MessageSquare className="h-4 w-4" /> Text it
          </a>
        )}
        <a href={`mailto:?subject=${encodeURIComponent('Your Allstate rate check')}&body=${encodeURIComponent(message)}`} className={btn} style={inputStyle}>
          <Mail className="h-4 w-4" /> Email it
        </a>
        {canShare && (
          <button type="button" onClick={share} className={btn} style={inputStyle}><Share2 className="h-4 w-4" /> Share…</button>
        )}
        <CopyTextButton text={message} className={`${btn} justify-center`} style={inputStyle}>Copy message</CopyTextButton>
      </div>
      {shareError && <p className="text-sm text-red-600">{shareError}</p>}

      <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>“{message}”</div>

      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">Done</button>
      </div>
    </div>
  );
}
