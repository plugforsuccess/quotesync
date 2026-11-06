// Who referred this lead (a call-in referral). Saved to leads.referred_by_referrer_id so
// the referral rewards credit the right person. Only Georgia referrers can win.
import { useState } from 'react';
import { T } from '../../../components/SiteCopy';
import { useSetLeadReferrer } from '../../../hooks/useReferralRewards';

const field = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' };

export default function ReferredByField({ lead, leadId, agencyId }) {
  const setReferrer = useSetLeadReferrer(leadId, agencyId);
  const linked = lead.referred_by;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [err, setErr] = useState(null);

  const save = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Enter the referrer’s name.'); return; }
    if (state.trim() && !/^[A-Za-z]{2}$/.test(state.trim())) { setErr('State must be 2 letters (e.g. GA).'); return; }
    try {
      await setReferrer.mutateAsync({ name, phone, state });
      setEditing(false); setName(''); setPhone(''); setState('');
    } catch (e) {
      setErr(e.message || 'Could not save.');
    }
  };

  const ga = (linked?.state || '').toUpperCase() === 'GA';
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <dt style={{ color: 'var(--qs-subtle)' }}><T k="pages.agencyleaddetailpage.36e9b1">Referred By</T></dt>
        <dd className="text-right" style={{ color: 'var(--qs-bright)' }}>
          {linked ? (
            <span>
              <span className="font-semibold">{linked.name}</span>
              {linked.state && (
                <span className="ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-text)' }}>
                  {ga ? <T k="pages.agencyleaddetailpage.535ca9">{'GA · eligible'}</T> : <T k="pages.agencyleaddetailpage.e9bed4">{'not eligible to win'}</T>}
                </span>
              )}
            </span>
          ) : (
            <span style={{ color: 'var(--qs-subtle)' }}><T k="pages.agencyleaddetailpage.887992">Not linked</T></span>
          )}
          <button type="button" onClick={() => setEditing(v => !v)} className="ml-3 text-sm font-semibold text-primary-600">
            {editing ? <T k="pages.agencyleaddetailpage.77dfd2">{'Cancel'}</T> : linked ? <T k="pages.agencyleaddetailpage.64fbd9">{'Change'}</T> : <T k="pages.agencyleaddetailpage.8e2d68">{'Link Referrer'}</T>}
          </button>
        </dd>
      </div>
      {editing && (
        <div className="mt-3 space-y-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Referrer’s name" maxLength={120}
            aria-label="Referrer’s name" className="w-full rounded-lg px-3 py-2 text-base" style={field} />
          <div className="flex gap-2">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" maxLength={32}
              aria-label="Referrer’s phone" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-base" style={field} />
            <input type="text" value={state} onChange={e => setState(e.target.value)} placeholder="ST" maxLength={2}
              aria-label="Referrer’s state" className="w-16 rounded-lg px-3 py-2 text-base uppercase" style={field} />
          </div>
          {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
          <button type="button" onClick={save} disabled={setReferrer.isPending}
            className="min-h-[44px] w-full rounded-lg bg-primary-600 px-3 text-sm font-bold text-white disabled:opacity-50">
            {setReferrer.isPending ? <T k="pages.agencyleaddetailpage.56a228">{'Saving…'}</T> : <T k="pages.agencyleaddetailpage.7f7b08">{'Save Referrer'}</T>}
          </button>
          <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
            <T k="pages.agencyleaddetailpage.1224e2">Only Georgia-resident referrers are eligible to win; anyone may refer.</T>
          </p>
        </div>
      )}
    </div>
  );
}
