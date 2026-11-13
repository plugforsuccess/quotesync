// "Mark as Test" (principal only): asks once, then hides this record (and what came with
// it) from the inboxes, counts and payouts. Undo in Rate Checks → More → Test Records.
import { useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { T } from '../SiteCopy';
import { useAuth } from '../../contexts/AuthContext';
import { useSetTestFlag } from '../../hooks/useTestRecords';

const WHAT = {
  rate_check: 'This upload (and the rest of this household) leaves the inbox, counts and stats.',
  lead: 'This lead and its uploads leave the inboxes, counts and stats.',
  affiliate: 'This affiliate and the uploads from their link leave the list, counts and payouts. Their portal still opens, for testing.',
};

export default function MarkAsTest({ kind, id, onDone, className = '' }) {
  const { currentAgencyRole } = useAuth();
  const [asking, setAsking] = useState(false);
  const flag = useSetTestFlag();
  if (currentAgencyRole !== 'principal' || !id) return null;
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={`inline-flex items-center gap-1.5 text-sm font-semibold ${className}`} style={{ color: 'var(--qs-subtle)' }}>
        <FlaskConical className="h-4 w-4" aria-hidden="true" /> <T k="test.mark">Mark as Test</T>
      </button>
    );
  }
  return (
    <div className={`rounded-xl p-3 text-left text-sm ${className}`} role="group" aria-label="Mark as test?"
      style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
      <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="test.ask">Mark as Test?</T></p>
      <p className="mt-0.5" style={{ color: 'var(--qs-subtle)' }}><T>{WHAT[kind]}</T> <T k="test.undo">Undo anytime in Rate Checks → More → Test Records.</T></p>
      {flag.isError && <p className="mt-1 text-red-600" role="alert">{flag.error.message}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAsking(false)} className="min-h-[40px] rounded-lg font-semibold" style={{ border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}><T k="test.cancel">Cancel</T></button>
        <button type="button" disabled={flag.isPending}
          onClick={() => flag.mutate({ kind, id, on: true }, { onSuccess: () => { setAsking(false); onDone?.(); } })}
          className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-primary-600 font-semibold text-white disabled:opacity-60">
          {flag.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} <T k="test.confirm">Mark as Test</T>
        </button>
      </div>
    </div>
  );
}
