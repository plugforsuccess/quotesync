// src/pages/components/rate-checks/DrawerExtras.jsx
// Rate check drawer sections: the competing agent on this dec page, and the
// partner-referral box (only shown when the customer opted in).

import { useState } from 'react';
import { useCompetitorAgents, useReferralPartners, useReferrals, useCreateReferral } from '../../../hooks/useRateChecks';
import { OwnershipChip } from './CompetitorAgents';
import { inputStyle, formatPhone, formatDate } from './ui';
import { Field } from './Copyable';

const heading = 'mb-1 text-base font-semibold';

export function CurrentAgentBox({ rc }) {
  const { data: competitors = [] } = useCompetitorAgents(rc.competitor_agent_id ? rc.agency_id : null);
  const stats = competitors.find(c => c.id === rc.competitor_agent_id);
  const a = rc.current_agent;
  if (!a && !stats) return null;
  const agency = stats?.agency_name || a?.agency_name;
  const person = stats?.agent_name || a?.agent_name;
  const phone = stats?.phone || a?.phone;
  const email = stats?.email || a?.email;
  const address = stats?.address || a?.address;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={heading} style={{ color: 'var(--qs-bright)' }}>Their current agent</h3>
        <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>Internal only</span>
      </div>
      <dl>
        <Field label="Agency" value={agency} />
        {person && person !== agency && <Field label="Agent" value={person} />}
        {phone && <Field label="Phone" value={formatPhone(phone)} copy />}
        {email && <Field label="Email" value={email} copy />}
        {address && <Field label="Address" value={address} copy />}
      </dl>
      {stats && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--qs-subtle)' }}>
          <OwnershipChip value={stats.book_ownership} />
          <span>
            {Number(stats.rate_checks) === 1 ? 'First customer of theirs we’ve seen.' : `We’ve seen ${stats.rate_checks} of their customers.`}
            {Number(stats.quoted) > 0 && ` Allstate beat the price ${stats.wins} of ${stats.quoted} times.`}
          </span>
          {stats.starred && <span className="text-yellow-500">★ Starred</span>}
        </div>
      )}
      <p className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>Never contact this agent about this customer.</p>
    </section>
  );
}

export function ReferralBox({ rc }) {
  const consented = !!rc.referral_consent_given_at;
  const { data: partners = [] } = useReferralPartners(consented ? rc.agency_id : null);
  const { data: referrals = [] } = useReferrals(rc.id);
  const create = useCreateReferral();
  const [partnerId, setPartnerId] = useState('');
  const [line, setLine] = useState('');
  const [note, setNote] = useState('');
  const active = partners.filter(p => p.active);

  // No opt-in and nothing logged: nothing to show (the database blocks the referral anyway).
  if (!consented && referrals.length === 0) return null;

  return (
    <section>
      <h3 className={heading} style={{ color: 'var(--qs-bright)' }}>Refer to a partner</h3>
      {consented && (
        <div className="space-y-2 text-sm">
          <p style={{ color: 'var(--qs-subtle)' }}>
            They said yes to being referred if Allstate can&apos;t help ({formatDate(rc.referral_consent_given_at)}).
          </p>
          {active.length === 0 ? (
            <p style={{ color: 'var(--qs-subtle)' }}>Add a partner in the Referral partners tab first.</p>
          ) : (
            <form className="grid gap-2 sm:grid-cols-2" onSubmit={e => {
              e.preventDefault();
              if (!partnerId) return;
              create.mutate({ agencyId: rc.agency_id, rateCheckId: rc.id, leadId: rc.lead_id, partnerId, line, note },
                { onSuccess: () => { setPartnerId(''); setLine(''); setNote(''); } });
            }}>
              <select value={partnerId} onChange={e => setPartnerId(e.target.value)} className="rounded px-2 py-1.5" style={inputStyle} required aria-label="Partner">
                <option value="">Choose a partner…</option>
                {active.map(p => <option key={p.id} value={p.id}>{p.name}{p.lines?.length ? ` (${p.lines.join(', ')})` : ''}</option>)}
              </select>
              <input value={line} onChange={e => setLine(e.target.value)} placeholder="What they need, e.g. SR-22" aria-label="What they need" className="rounded px-2 py-1.5" style={inputStyle} />
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note for the partner (optional)" aria-label="Note" className="rounded px-2 py-1.5 sm:col-span-2" style={inputStyle} />
              <button type="submit" disabled={!partnerId || create.isPending} className="justify-self-start rounded bg-primary-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
                {create.isPending ? 'Saving…' : 'Log referral'}
              </button>
            </form>
          )}
          {create.isError && <p className="text-red-600">{create.error.message}</p>}
        </div>
      )}
      {referrals.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm" style={{ color: 'var(--qs-text)' }}>
          {referrals.map(r => (
            <li key={r.id}>Referred to {r.referral_partners?.name || 'a partner'}{r.line ? ` for ${r.line}` : ''}{r.note ? ` — ${r.note}` : ''}
              <span style={{ color: 'var(--qs-subtle)' }}> · {formatDate(r.created_at)}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
