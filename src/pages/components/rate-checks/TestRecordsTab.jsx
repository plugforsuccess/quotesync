// Rate Checks → More → Test Records (principal only): everything marked as test, with
// Unmark to bring it back into the inboxes and counts.
import { FlaskConical } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { useSetTestFlag, useTestRecords } from '../../../hooks/useTestRecords';
import { formatPhone, CARD_STYLE } from './ui';

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

function Group({ title, kind, rows, label }) {
  const flag = useSetTestFlag();
  return (
    <section className="rounded-xl p-4" style={CARD_STYLE} aria-label={title}>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T>{title}</T> · {rows.length}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="test.none">None.</T></p>
      ) : (
        <ul className="mt-2 divide-y" style={{ borderColor: 'var(--qs-border)' }}>
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-semibold" style={{ color: 'var(--qs-bright)' }}>{label(r)}</p>
                <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{[r.phone && formatPhone(r.phone), when(r.created_at)].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" disabled={flag.isPending && flag.variables?.id === r.id}
                onClick={() => flag.mutate({ kind, id: r.id, on: false })}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-primary-600 disabled:opacity-50"
                style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
                <T k="test.unmark">Unmark</T>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function TestRecordsTab({ agencyId }) {
  const { data, isLoading, error } = useTestRecords(agencyId);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--qs-subtle)' }} aria-hidden="true" />
        <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="test.intro">Marked as test: hidden from the inboxes, counts, stats and payouts. Nothing is deleted. Unmark one to bring it back.</T></p>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error.message}</p>}
      {isLoading ? <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="test.loading">Loading…</T></p> : data && (
        <>
          <Group title="Rate Checks" kind="rate_check" rows={data.rate_checks} label={r => [r.first_name || 'No name', r.carrier, r.policy_type].filter(Boolean).join(' · ')} />
          <Group title="Leads" kind="lead" rows={data.leads} label={r => [r.first_name, r.last_name].filter(Boolean).join(' ') || 'No name'} />
          <Group title="Affiliates" kind="affiliate" rows={data.affiliates} label={r => r.name || 'No name'} />
        </>
      )}
    </div>
  );
}
