// Sales workspace, step 3: contact them about the saved quote. A text written for the
// result (saves / same / costs more) that the producer can edit, then Send — from the
// agency's number, never a personal phone. Texts only go to people who agreed to texts
// and haven't opted out; otherwise it's a call, with the same words as a script.
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

export default function ContactStep({ household }) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const lead = household[0] || {};
  const quoted = household.filter(rc => rc.allstate_premium != null && rc.status !== 'declined');
  const totals = useMemo(() => {
    const cur = quoted.reduce((s, rc) => s + (Number(rc.annual_premium) || 0), 0);
    const all = quoted.reduce((s, rc) => s + (Number(rc.allstate_premium) || 0), 0);
    return { cur, all, result: quoteResult(cur, all) };
  }, [quoted]);
  const kind = totals.result?.kind || null;
  const producer = (profile?.full_name || '').split(' ')[0] || 'Cam';
  const draft = kind ? contactMessage(kind, { first: lead.first_name, producer, allstate: totals.all, diff: totals.result.diff }) : '';
  const [text, setText] = useState(draft);
  useEffect(() => { setText(draft); }, [draft]);

  // Opted out on the lead? Agreed to texts on the Rate Check?
  const { data: optedOut = false } = useQuery({
    queryKey: ['lead-opt-out', lead.lead_id],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('sms_opted_out').eq('id', lead.lead_id).maybeSingle();
      return !!data?.sms_opted_out;
    },
    enabled: !!lead.lead_id,
  });
  const consented = household.some(rc => !!rc.consent_given_at);
  const canText = !!lead.phone && !!lead.lead_id && consented && !optedOut;
  const whyNot = !lead.phone ? 'No mobile number on file.'
    : optedOut ? 'They replied STOP, so no texts.'
    : !consented ? 'They didn’t agree to texts when they uploaded, so call them instead.' : null;

  const [state, setState] = useState({ sending: false, sent: false, error: '' });
  const send = async () => {
    if (!canText || !text.trim()) return;
    setState({ sending: true, sent: false, error: '' });
    const { error } = await supabase.functions.invoke('send-manual-sms', { body: { lead_id: lead.lead_id, body: text.trim() } });
    if (error) {
      let message = error.message;
      try { message = (await error.context?.json())?.error || message; } catch { /* keep */ }
      if (/twilio|not configured|from number/i.test(message)) message = 'Texting isn’t set up yet: the agency’s Twilio number is still pending. Call them for now.';
      setState({ sending: false, sent: false, error: message });
      return;
    }
    // A "reply Y" text: mark it sent, so a Y back flags them ready to call.
    if (kind !== 'more') {
      const now = new Date().toISOString();
      await supabase.from('rate_checks').update({ quote_ready_texted_at: now }).in('id', quoted.map(rc => rc.id));
      queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
    }
    setState({ sending: false, sent: true, error: '' });
  };

  if (!quoted.length) {
    return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.contact.first">Save the quote first; the message is written from it.</T></p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.contact.title">Contact Them</T></h3>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>
          <T k="sales.contact.household">Household</T> · {money(totals.all)}<T k="sales.log.peryear">/yr</T> <T k="sales.log.vs">vs</T> {money(totals.cur)}
          {kind === 'saves' && <> · <b style={{ color: 'var(--qs-success)' }}><T k="sales.log.saves">Saves</T> {money(totals.result.diff)}<T k="sales.log.peryear">/yr</T></b></>}
          {kind === 'same' && <> · <b style={{ color: 'var(--qs-bright)' }}><T k="sales.log.same">About the same</T></b></>}
          {kind === 'more' && <> · <b style={{ color: 'var(--qs-danger)' }}>{money(-totals.result.diff)}<T k="sales.log.peryear">/yr</T> <T k="sales.log.more">more</T></b></>}
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
        {lead.phone && (
          <a href={`tel:+1${lead.phone}`} className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl text-base font-bold ${canText ? '' : 'bg-primary-600 text-white'}`}
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
