// Sales workspace, step 3: contact them about the saved quote. A text written for the
// result (saves / same / costs more / quoted) that the producer can edit, then Send —
// from the agency's number, never a personal phone. Texts only go to people who agreed
// to texts and haven't opted out; otherwise it's a call, with the same words as a script.
import { useEffect, useMemo, useState } from 'react';
import { Phone, Send } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { T } from '../../../components/SiteCopy';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { queryKeys } from '../../../lib/queryKeys';
import { money } from '../rate-checks/ui';
import { quoteResult } from './quoteResult';
import { contactMessage } from './contactMessage';

/**
 * The message and Send / Call for one household.
 * cur = what they pay now a year (null when unknown), all = the Allstate quote a year.
 * onTexted runs after a "reply Y" text goes out.
 */
export function ContactPanel({ first, phone, leadId, cur, all, consented, onTexted }) {
  const { profile } = useAuth();
  const result = cur > 0 ? quoteResult(cur, all) : null;
  const kind = result?.kind || (all > 0 ? 'quoted' : null);
  const producer = (profile?.full_name || '').split(' ')[0] || 'Cam';
  const draft = kind ? contactMessage(kind, { first, producer, allstate: all, diff: result?.diff }) : '';
  const [text, setText] = useState(draft);
  useEffect(() => { setText(draft); }, [draft]);

  // Opted out on the lead?
  const { data: optedOut = false } = useQuery({
    queryKey: ['lead-opt-out', leadId],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('sms_opted_out').eq('id', leadId).maybeSingle();
      return !!data?.sms_opted_out;
    },
    enabled: !!leadId,
  });
  const canText = !!phone && !!leadId && consented && !optedOut;
  const whyNot = !phone ? 'No mobile number on file.'
    : optedOut ? 'They replied STOP, so no texts.'
    : !consented ? 'They haven’t agreed to texts, so call them instead.' : null;

  const [state, setState] = useState({ sending: false, sent: false, error: '' });
  const send = async () => {
    if (!canText || !text.trim()) return;
    setState({ sending: true, sent: false, error: '' });
    const { error } = await supabase.functions.invoke('send-manual-sms', { body: { lead_id: leadId, body: text.trim() } });
    if (error) {
      let message = error.message;
      try { message = (await error.context?.json())?.error || message; } catch { /* keep */ }
      if (/twilio|not configured|from number/i.test(message)) message = 'Texting isn’t set up yet: the agency’s Twilio number is still pending. Call them for now.';
      setState({ sending: false, sent: false, error: message });
      return;
    }
    if (kind !== 'more') await onTexted?.();
    setState({ sending: false, sent: true, error: '' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.contact.title">Contact Them</T></h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>
          <T k="sales.contact.household">Household</T> · {money(all)}<T k="sales.log.peryear">/yr</T>
          {cur > 0 && <> <T k="sales.log.vs">vs</T> {money(cur)}</>}
          {kind === 'saves' && <> · <b style={{ color: 'var(--qs-success)' }}><T k="sales.log.saves">Saves</T> {money(result.diff)}<T k="sales.log.peryear">/yr</T></b></>}
          {kind === 'same' && <> · <b style={{ color: 'var(--qs-bright)' }}><T k="sales.log.same">About the same</T></b></>}
          {kind === 'more' && <> · <b style={{ color: 'var(--qs-danger)' }}>{money(-result.diff)}<T k="sales.log.peryear">/yr</T> <T k="sales.log.more">more</T></b></>}
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{canText ? <T k="sales.contact.text">Text Message</T> : <T k="sales.contact.script">What to Say</T>}</span>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={480}
          className="mt-1.5 w-full rounded-xl p-3 text-[15px] leading-relaxed"
          style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }} />
        <span className="mt-1 block text-right text-xs tabular-nums" style={{ color: 'var(--qs-subtle)' }}>{text.length}/480</span>
      </label>

      {whyNot && <p className="text-sm" style={{ color: 'var(--qs-text)' }}><T>{whyNot}</T></p>}
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.sent && <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }} role="status"><T k="sales.contact.sent">Sent from the agency’s number.</T></p>}

      <div className="grid grid-cols-2 gap-2">
        {phone && (
          <a href={`tel:+1${phone}`} className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl text-base font-bold ${canText ? '' : 'bg-primary-600 text-white'}`}
            style={canText ? { border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' } : undefined}>
            <Phone className="h-5 w-5" aria-hidden="true" /> <T k="sales.contact.call">Call</T>
          </a>
        )}
        <button type="button" onClick={send} disabled={!canText || !text.trim() || state.sending || state.sent}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary-600 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-5 w-5" aria-hidden="true" /> {state.sending ? <T k="sales.contact.sending">Sending…</T> : state.sent ? <T k="sales.contact.sentbtn">Sent</T> : <T k="sales.contact.send">Send Text</T>}
        </button>
      </div>
    </div>
  );
}

/** A household from Rate Check uploads. */
export default function ContactStep({ household }) {
  const queryClient = useQueryClient();
  const lead = household[0] || {};
  const quoted = useMemo(() => household.filter(rc => rc.allstate_premium != null && rc.status !== 'declined'), [household]);
  const cur = quoted.reduce((s, rc) => s + (Number(rc.annual_premium) || 0), 0);
  const all = quoted.reduce((s, rc) => s + (Number(rc.allstate_premium) || 0), 0);

  if (!quoted.length) {
    return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.contact.first">Save the quote first; the message is written from it.</T></p>;
  }
  // A "reply Y" text: mark it sent, so a Y back flags them ready to call.
  const onTexted = async () => {
    await supabase.from('rate_checks').update({ quote_ready_texted_at: new Date().toISOString() }).in('id', quoted.map(rc => rc.id));
    queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
  };
  return (
    <ContactPanel first={lead.first_name} phone={lead.phone} leadId={lead.lead_id} cur={cur} all={all}
      consented={household.some(rc => !!rc.consent_given_at)} onTexted={onTexted} />
  );
}
