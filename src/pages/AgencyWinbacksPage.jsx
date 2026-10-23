// src/pages/AgencyWinbacksPage.jsx
// Winbacks tab: former customers from Allstate termination reports (leads with
// source 'winback'), as a call list — who left, what line, when, why, and the
// premium that walked. Biggest premium first. The lead page does the logging.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, MessageSquare, ChevronRight } from 'lucide-react';
import { useCurrentAgency, useWinbackLeads } from '../hooks/useAgencyLeads';
import { parseWinbackNote } from '../lib/winbackNote';
import { displayName } from '../lib/names';
import { money, formatPhone } from './components/rate-checks/ui';
import PageSpinner from '../components/PageSpinner';

const CLOSED = new Set(['closed_won', 'closed_lost']);
const STATUS_LABEL = { new: 'Not called', contacted: 'Contacted', quoted: 'Quoted', interested: 'Interested', closed_won: 'Won back', closed_lost: 'Closed' };

function WinbackCard({ lead }) {
  const w = lead.winback;
  const name = [displayName(lead.first_name), displayName(lead.last_name)].filter(Boolean).join(' ') || 'No name';
  return (
    <li className="rounded-xl p-4" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/agency/leads/${lead.id}`} className="inline-flex items-center gap-1 text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>
            {name}<ChevronRight className="h-4 w-4 opacity-60" aria-hidden="true" />
          </Link>
          <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
            {[w?.line && `Lost ${w.line}`, w?.month].filter(Boolean).join(' · ') || 'Former customer'}
            {lead.zip ? ` · ${lead.zip}` : ''}
          </p>
        </div>
        {w?.premium != null && (
          <p className="shrink-0 text-lg font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>
            {money(w.premium)}<span className="text-sm font-medium" style={{ color: 'var(--qs-subtle)' }}>/yr</span>
          </p>
        )}
      </div>
      {w?.reason && <p className="mt-2 text-sm" style={{ color: 'var(--qs-text)' }}>{w.reason}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {lead.phone && (
          <>
            <a href={`tel:+1${lead.phone}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white">
              <Phone className="h-4 w-4" aria-hidden="true" /> Call {formatPhone(lead.phone)}
            </a>
            <a href={`sms:+1${lead.phone}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
              style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
              <MessageSquare className="h-4 w-4" aria-hidden="true" /> Text
            </a>
          </>
        )}
        <span className="ml-auto text-xs" style={{ color: 'var(--qs-subtle)' }}>
          {STATUS_LABEL[lead.status] || lead.status}{lead.attempt_count ? ` · ${lead.attempt_count} ${lead.attempt_count === 1 ? 'try' : 'tries'}` : ''}
        </span>
      </div>
    </li>
  );
}

export default function AgencyWinbacksPage() {
  const { data: currentAgency, isLoading: agencyLoading } = useCurrentAgency();
  const { data: leads = [], isLoading, error } = useWinbackLeads(currentAgency?.agency_id);
  const [show, setShow] = useState('open');

  const rows = useMemo(() => leads
    .map(l => ({ ...l, winback: parseWinbackNote(l.callback_note) }))
    .sort((a, b) => (b.winback?.premium ?? -1) - (a.winback?.premium ?? -1)), [leads]);
  const open = rows.filter(l => !CLOSED.has(l.status));
  const list = show === 'open' ? open : rows;
  const openPremium = open.reduce((t, l) => t + (l.winback?.premium || 0), 0);

  if (agencyLoading || isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>Winbacks</h1>
      <p className="mt-1" style={{ color: 'var(--qs-subtle)' }}>
        Customers who left Allstate. {open.length} to call{openPremium ? ` · ${money(openPremium)}/yr walked out` : ''}.
      </p>

      <div className="mt-4 inline-flex rounded-lg p-1" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }} role="tablist">
        {[['open', `To call ${open.length}`], ['all', `All ${rows.length}`]].map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={show === v} onClick={() => setShow(v)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${show === v ? 'bg-primary-600 text-white' : ''}`}
            style={show === v ? undefined : { color: 'var(--qs-text)' }}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm" style={{ color: 'var(--qs-danger)' }}>{error.message}</p>}
      {!error && list.length === 0 && (
        <p className="mt-6 rounded-xl p-6 text-center" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-subtle)' }}>
          No winbacks yet. They come from historical termination reports uploaded under Retention.
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {list.map(l => <WinbackCard key={l.id} lead={l} />)}
      </ul>
    </div>
  );
}
