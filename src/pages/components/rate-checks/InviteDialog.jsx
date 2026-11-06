// src/pages/components/rate-checks/InviteDialog.jsx
// "Send a link" from the Rate Checks inbox — for people met at an event who
// don't have their dec page on them. The producer texts/emails the short link
// from their own phone; the upload later lands tagged with producer + event.

import { T } from '../../../components/SiteCopy';
import { useEffect, useRef, useState } from 'react';
import { Mail, MessageSquare, Share2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useCreateRateCheckInvite, useRateCheckEvents } from '../../../hooks/useRateChecks';
import { formatPhoneInput } from '../../../lib/rateCheckApi';
import { inputStyle, formatPhone } from './ui';
import { CopyTextButton } from './Copyable';
import { inviteUrl, inviteMessage, smsUrl } from './invite';

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
            <h2 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>{invite ? <T k="pages.components.ratechecks.invitedialog.6315d0">{'Link Ready'}</T> : <T k="pages.components.ratechecks.invitedialog.1c1560">{'Send a Link'}</T>}</h2>
            <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
              {invite ? <T k="pages.components.ratechecks.invitedialog.3a79ed">{'Send it from your own phone. Their upload comes back tagged to you.'}</T> : <T k="pages.components.ratechecks.invitedialog.30438d">{'For someone who doesn’t have their policy on them.'}</T>}
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
              <T k="pages.components.ratechecks.invitedialog.94572c">They tick the texting consent themselves when they upload, so nothing is sent automatically until then.</T>
            </p>
            {create.isError && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{create.error.message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm" style={inputStyle}><T k="pages.components.ratechecks.invitedialog.ea4788">Cancel</T></button>
              <button type="submit" disabled={!canSubmit} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {create.isPending ? <T k="pages.components.ratechecks.invitedialog.94d7d8">{'Creating…'}</T> : <T k="pages.components.ratechecks.invitedialog.dc18b6">{'Create Link'}</T>}
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
  const smsCanvas = useRef(null);
  const [showSmsQr, setShowSmsQr] = useState(false);
  const [shareError, setShareError] = useState('');
  const url = inviteUrl(invite.code);
  const producerFirst = (producerName || '').split(' ')[0];
  const message = inviteMessage(invite, producerFirst);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (canvas.current) QRCode.toCanvas(canvas.current, url, { width: 180, margin: 1 }).catch(() => {});
  }, [url]);
  useEffect(() => {
    if (showSmsQr && smsCanvas.current) QRCode.toCanvas(smsCanvas.current, smsUrl(invite, message), { width: 200, margin: 1 }).catch(() => {});
  }, [showSmsQr, invite, message]);

  const share = async () => {
    try { await navigator.share({ text: message }); } catch (e) { if (e?.name !== 'AbortError') setShareError('Couldn’t open the share sheet — copy the message instead.'); }
  };

  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <canvas ref={canvas} className="rounded-lg bg-white p-1" aria-label="QR code for the link" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{invite.first_name || <T k="pages.components.ratechecks.invitedialog.0e8574">{'Customer'}</T>}{invite.phone ? ` · ${formatPhone(invite.phone)}` : ''}</p>
          {invite.event_name && <p style={{ color: 'var(--qs-subtle)' }}>{invite.event_name}</p>}
          <p className="mt-2 select-all break-all font-mono text-xs" style={{ color: 'var(--qs-text)' }}>{url}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.invitedialog.8cec95">They can also scan this if they’re with you. Expires in 30 days.</T></p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a href={smsUrl(invite, message)} className={`${btn} bg-primary-600 text-white`}>
          <MessageSquare className="h-4 w-4" /> <T k="pages.components.ratechecks.invitedialog.98ea21">Text it</T>
        </a>
        <a href={`mailto:?subject=${encodeURIComponent('Your Allstate rate check')}&body=${encodeURIComponent(message)}`} className={btn} style={inputStyle}>
          <Mail className="h-4 w-4" /> <T k="pages.components.ratechecks.invitedialog.05555c">Email it</T>
        </a>
        {canShare && (
          <button type="button" onClick={share} className={btn} style={inputStyle}><Share2 className="h-4 w-4" /> <T k="pages.components.ratechecks.invitedialog.7ba39b">Share…</T></button>
        )}
        <CopyTextButton text={message} className={`${btn} justify-center`} style={inputStyle}><T k="pages.components.ratechecks.invitedialog.f1019f">Copy message</T></CopyTextButton>
      </div>
      {shareError && <p className="text-sm text-red-600">{shareError}</p>}

      {/* Tablets that can't text: the producer scans this with their own phone and Messages opens, text written. */}
      <div>
        <button type="button" onClick={() => setShowSmsQr(v => !v)} className="text-sm text-primary-600 hover:underline">
          {showSmsQr ? <T k="pages.components.ratechecks.invitedialog.34d8b6">{'Hide'}</T> : <T k="pages.components.ratechecks.invitedialog.59616f">{'On a tablet? Text it from your phone instead'}</T>}
        </button>
        {showSmsQr && (
          <div className="mt-2 flex items-center gap-4">
            <canvas ref={smsCanvas} className="rounded-lg bg-white p-1" aria-label="QR code that opens Messages on your phone" />
            <p className="text-sm" style={{ color: 'var(--qs-text)' }}>
              <T k="pages.components.ratechecks.invitedialog.730703">Point your phone’s camera at this. Messages opens with the text already written</T>{invite.phone ? <T k="pages.components.ratechecks.invitedialog.27124a">{' and addressed'}</T> : ''} <T k="pages.components.ratechecks.invitedialog.ba6cea">— just hit send.</T>
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>“{message}”</div>

      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white"><T k="pages.components.ratechecks.invitedialog.f92965">Done</T></button>
      </div>
    </div>
  );
}
