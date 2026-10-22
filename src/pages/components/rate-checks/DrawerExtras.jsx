// src/pages/components/rate-checks/DrawerExtras.jsx
// Rate check drawer sections: the competing agent on this dec page, and the
// partner-referral box (only usable when the customer opted in).

import { useState } from 'react';
import { useCompetitorAgents, useReferralPartners, useReferrals, useCreateReferral } from '../../../hooks/useRateChecks';
import { OwnershipChip } from './CompetitorAgents';
import { inputStyle, formatPhone, formatDate } from './ui';

const heading = 'mb-2 text-sm font-semibold uppercase tracking-wide';

export function CurrentAgentBox({ rc }) {
  const { data: competitors = [] } = useCompetitorAgents(rc.competitor_agent_id ? rc.agency_id : null);
  const stats = competitors.find(c => c.id === rc.competitor_agent_id);
  const a = rc.current_agent;
  if (!a && !stats) return null;
  const name = stats?.agency_name || a?.agency_name || stats?.agent_name || a?.agent_name || 'Unknown agent';
  const person = (stats?.agency_name || a?.agency_name) && (stats?.agent_name || a?.agent_name);
  const phone = stats?.phone || a?.phone;

  return (
    <section>
      <h3 className={heading} style={{ color: 'var(--qs-subtle)' }}>Current agent</h3>
      <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{name}</span>
          {person && <span style={{ color: 'var(--qs-subtle)' }}>{person}</span>}
          {stats && <OwnershipChip value={stats.book_ownership} />}
          {stats?.starred && <span className="text-xs text-yellow-500">★ watchlist</span>}
        </div>
        <div className="mt-1" style={{ color: 'var(--qs-text)' }}>
          {[phone && formatPhone(phone), stats?.email || a?.email, stats?.address || a?.address].filter(Boolean).join(' · ')}
        </div>
        {stats && (
          <div className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>
            Seen on {stats.rate_checks} rate check{Number(stats.rate_checks) === 1 ? '' : 's'}
            {Number(stats.quoted) > 0 && ` · we won ${stats.wins} of ${stats.quoted}`}
            {' · '}first seen {formatDate(stats.first_seen_at)}. See the Competing agents tab.
          </div>
        )}
        <div className="mt-1 text-xs" style={{ color: 'var(--qs-subtle)' }}>Internal only — don’t contact this agent about this customer.</div>
      </div>
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

  return (
    <section>
      <h3 className={heading} style={{ color: 'var(--qs-subtle)' }}>Partner referral</h3>
      {!consented ? (
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          The customer didn’t opt in to partner referrals, so this rate check can’t be referred.
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p style={{ color: 'var(--qs-subtle)' }}>Opted in {formatDate(rc.referral_consent_given_at)}.</p>
          {active.length === 0 ? (
            <p style={{ color: 'var(--qs-subtle)' }}>No active partners — add one in the Partners tab.</p>
          ) : (
            <form className="flex flex-wrap items-end gap-2" onSubmit={e => {
              e.preventDefault();
              if (!partnerId) return;
              create.mutate({ agencyId: rc.agency_id, rateCheckId: rc.id, leadId: rc.lead_id, partnerId, line, note },
                { onSuccess: () => { setPartnerId(''); setLine(''); setNote(''); } });
            }}>
              <select value={partnerId} onChange={e => setPartnerId(e.target.value)} className="rounded px-2 py-1.5" style={inputStyle} required>
                <option value="">Choose partner…</option>
                {active.map(p => <option key={p.id} value={p.id}>{p.name}{p.lines?.length ? ` (${p.lines.join(', ')})` : ''}</option>)}
              </select>
              <input value={line} onChange={e => setLine(e.target.value)} placeholder="Line (e.g. high-risk auto)" className="rounded px-2 py-1.5" style={inputStyle} />
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note" className="flex-1 min-w-[140px] rounded px-2 py-1.5" style={inputStyle} />
              <button type="submit" disabled={!partnerId || create.isPending} className="rounded bg-primary-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
                {create.isPending ? 'Logging…' : 'Refer to partner'}
              </button>
            </form>
          )}
          {create.isError && <p className="text-red-600">{create.error.message}</p>}
        </div>
      )}
      {referrals.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm" style={{ color: 'var(--qs-text)' }}>
          {referrals.map(r => (
            <li key={r.id}>→ {r.referral_partners?.name || 'Partner'}{r.line ? ` · ${r.line}` : ''}{r.note ? ` · ${r.note}` : ''}
              <span style={{ color: 'var(--qs-subtle)' }}> · {formatDate(r.created_at)}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
