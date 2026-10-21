// src/pages/RateChecksPage.jsx
// Rate Checks inbox — consumer dec-page uploads (insuredbycam.com/ratecheck).
// Agents review Claude's extraction, correct it, enter the Allstate quote, and
// the outcome (won → call, lost → polite auto-text) is handled by rate-check-outcome.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Camera, ExternalLink, Map as MapIcon, Phone, X } from 'lucide-react';
import { useCurrentAgency } from '../hooks/useAgencyLeads';
import { useEnabledFeatures } from '../hooks/useFeaturePermissions';
import {
  useRateChecks, useRateCheckImageUrl, useUpdateRateCheck,
  useEnterRateCheckQuote, useRateCheckWinMap, annualize,
} from '../hooks/useRateChecks';
import { sanitizeMoneyInput, parseMoney } from '../lib/money';
import PageSpinner from '../components/PageSpinner';

const FILTERS = [
  { value: 'open', label: 'Needs quote', statuses: ['extracted', 'pending', 'extract_failed'] },
  { value: 'won', label: 'Won', statuses: ['won'] },
  { value: 'lost', label: 'Lost', statuses: ['lost'] },
  { value: 'all', label: 'All', statuses: [] },
];

const STATUS_CHIP = {
  pending:        { label: 'pending',   cls: 'bg-gray-100 text-gray-700' },
  extracted:      { label: 'extracted', cls: 'bg-primary-100 text-primary-700' },
  extract_failed: { label: 'failed',    cls: 'bg-red-100 text-red-700' },
  quoted:         { label: 'quoted',    cls: 'bg-purple-100 text-purple-700' },
  won:            { label: 'won',       cls: 'bg-green-100 text-green-700' },
  lost:           { label: 'lost',      cls: 'bg-gray-200 text-gray-600' },
  declined:       { label: 'declined',  cls: 'bg-gray-100 text-gray-500' },
};

const CONFIDENCE_CHIP = {
  high:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-red-100 text-red-700',
};

const CARRIERS = [
  'State Farm', 'GEICO', 'Progressive', 'Allstate', 'USAA', 'Farmers', 'Liberty Mutual',
  'Nationwide', 'Travelers', 'Auto-Owners', 'Georgia Farm Bureau', 'Erie', 'Other',
];
const POLICY_TYPES = ['auto', 'home', 'renters', 'condo', 'umbrella', 'other'];

const thCls = 'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider';
const thStyle = { color: 'var(--qs-subtle)' };
const inputStyle = { background: 'var(--qs-elevated)', color: 'var(--qs-text)', border: '1px solid var(--qs-border)' };

function money(n, { cents = false } = {}) {
  if (n == null || n === '') return '—';
  return `$${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

function formatPhone(p) {
  if (!p || p.length !== 10) return p || '—';
  return `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
}

function formatReceived(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusChip({ status }) {
  const c = STATUS_CHIP[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${c.cls}`}>{c.label}</span>;
}

function DeltaCell({ delta }) {
  if (delta == null) return <span style={{ color: 'var(--qs-subtle)' }}>—</span>;
  // delta = current − Allstate, so positive means the customer saves.
  const n = Number(delta);
  return n > 0
    ? <span className="text-green-600 font-semibold">save {money(n)}</span>
    : <span className="text-red-500">+{money(Math.abs(n))}</span>;
}

export default function RateChecksPage() {
  const { data: currentAgency, isLoading: agencyLoading } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;
  const { data: features, isLoading: featuresLoading } = useEnabledFeatures(agencyId);
  const [tab, setTab] = useState('inbox');
  const [filter, setFilter] = useState('open');
  const [openId, setOpenId] = useState(null);

  const statuses = FILTERS.find(f => f.value === filter)?.statuses;
  const enabled = features?.has('rate_checks');
  const { data: rows = [], isLoading, error } = useRateChecks(enabled ? agencyId : null, statuses);
  const open = rows.find(r => r.id === openId) || null;

  if (agencyLoading || (agencyId && featuresLoading)) return <PageSpinner />;

  if (!currentAgency || !enabled) {
    return (
      <div className="dark-page flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--qs-bright)' }}>Rate Checks isn&apos;t enabled</h2>
          <p style={{ color: 'var(--qs-dim)' }}>
            Ask a platform admin to turn on the Rate Checks feature for your agency.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-page">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="dark-header rounded-xl mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>Rate Checks</h1>
          <div className="flex flex-wrap items-center gap-4 mt-1">
            <p style={{ color: 'var(--qs-dim)' }}>Dec pages from insuredbycam.com/ratecheck — enter the Allstate quote to tag won / lost.</p>
            <Link to="/agency/leads" className="text-sm text-primary-600 hover:text-primary-800">← All leads</Link>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {[{ v: 'inbox', label: 'Inbox', Icon: Camera }, { v: 'map', label: 'Win map', Icon: MapIcon }].map(({ v, label, Icon }) => (
            <button key={v} onClick={() => setTab(v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === v ? 'bg-primary-600 text-white' : ''}`}
              style={tab === v ? undefined : { ...inputStyle }}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'map' ? <WinMap agencyId={agencyId} /> : (
          <>
            <div className="dark-card mb-4 flex items-center gap-3" style={{ padding: 12 }}>
              <select value={filter} onChange={e => setFilter(e.target.value)} className="dark-select" style={{ width: 'auto', ...inputStyle }}>
                {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>{rows.length} rate check{rows.length === 1 ? '' : 's'}</span>
            </div>

            <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
              {isLoading ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading rate checks…</div>
              ) : error ? (
                <div className="p-8 text-center text-red-600">Error loading rate checks. Please try again.</div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>No rate checks here yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr style={{ background: 'var(--qs-elevated)' }}>
                        {['Received', 'Name', 'Phone', 'ZIP', 'Carrier', 'Type', 'Current $/yr', 'Allstate $/yr', 'Delta', 'Status'].map(h => (
                          <th key={h} className={thCls} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer"
                          style={{ borderTop: '1px solid var(--qs-border)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--qs-elevated)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>{formatReceived(r.created_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium" style={{ color: 'var(--qs-bright)' }}>{r.first_name || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {r.phone ? (
                              <a href={`tel:+1${r.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                                <Phone className="w-3.5 h-3.5" /> {formatPhone(r.phone)}
                              </a>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>{r.zip || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>{r.carrier || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm capitalize" style={{ color: 'var(--qs-text)' }}>{r.policy_type || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>{money(r.annual_premium)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>{money(r.allstate_premium)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm"><DeltaCell delta={r.delta} /></td>
                          <td className="px-4 py-3 whitespace-nowrap"><StatusChip status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {open && <RateCheckDrawer key={open.id} rc={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────────

function RateCheckDrawer({ rc, onClose }) {
  const { data: imageUrl, isLoading: imageLoading } = useRateCheckImageUrl(rc.image_path);
  const isPdf = rc.image_media_type === 'application/pdf';
  const notes = rc.extracted?.notes;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Rate check detail">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto shadow-xl" style={{ background: 'var(--qs-card)', color: 'var(--qs-text)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4" style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>
              {rc.first_name || 'Rate check'} · {rc.carrier || 'Unknown carrier'} <span className="capitalize">{rc.policy_type || ''}</span>
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <StatusChip status={rc.status} />
              {rc.extract_confidence && (
                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${CONFIDENCE_CHIP[rc.extract_confidence]}`}>
                  {rc.extract_confidence} confidence
                </span>
              )}
              {rc.phone && <a href={`tel:+1${rc.phone}`} className="text-primary-600 hover:underline">{formatPhone(rc.phone)}</a>}
              <span style={{ color: 'var(--qs-subtle)' }}>ZIP {rc.zip}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rc.lead_id && (
              <Link to={`/agency/leads/${rc.lead_id}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium" style={inputStyle}>
                Open lead <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
            <button onClick={onClose} aria-label="Close" className="rounded p-1.5" style={inputStyle}><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="space-y-6 p-5">
          <QuoteBox rc={rc} />

          {rc.extract_error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Extraction failed: {rc.extract_error}. Read the image and fill in the fields below.
            </div>
          )}
          {notes && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--qs-warning-subtle)', color: 'var(--qs-text)' }}>
              <span className="font-semibold">Claude notes:</span> {notes}
            </div>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--qs-subtle)' }}>Dec page</h3>
            {!rc.image_path ? (
              <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Image deleted (90-day retention) or not uploaded.</p>
            ) : imageLoading ? (
              <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading image…</p>
            ) : imageUrl ? (
              isPdf ? (
                <a href={imageUrl} target="_blank" rel="noreferrer" className="text-primary-600 underline">Open PDF (link valid 60 min)</a>
              ) : (
                <a href={imageUrl} target="_blank" rel="noreferrer">
                  <img src={imageUrl} alt="Uploaded declarations page" className="max-h-[480px] w-full rounded-lg border object-contain" style={{ borderColor: 'var(--qs-border)', background: '#fff' }} />
                </a>
              )
            ) : (
              <p className="text-sm text-red-600">Couldn&apos;t load the image.</p>
            )}
          </section>

          <ExtractedForm rc={rc} />

          {rc.coverages && Object.keys(rc.coverages).length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--qs-subtle)' }}>Coverages</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {Object.entries(rc.coverages).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="capitalize" style={{ color: 'var(--qs-subtle)' }}>{k.replace(/_/g, ' ')}</dt>
                    <dd style={{ color: 'var(--qs-bright)' }}>{formatCoverage(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {Array.isArray(rc.vehicles) && rc.vehicles.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--qs-subtle)' }}>Vehicles</h3>
              <ul className="space-y-1 text-sm">
                {rc.vehicles.map((v, i) => (
                  <li key={i} style={{ color: 'var(--qs-bright)' }}>
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                    {v.vin_last4 && <span style={{ color: 'var(--qs-subtle)' }}> · VIN …{v.vin_last4}</span>}
                  </li>
                ))}
              </ul>
              {rc.driver_count != null && <p className="mt-1 text-sm" style={{ color: 'var(--qs-subtle)' }}>{rc.driver_count} driver{rc.driver_count === 1 ? '' : 's'}</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCoverage(v) {
  if (v == null) return '—';
  if (typeof v === 'object') {
    return Object.entries(v).map(([k, x]) => `${k.replace(/_/g, ' ')}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ');
  }
  return String(v);
}

// Editable extraction — agent corrections. Saving recomputes annual_premium.
function ExtractedForm({ rc }) {
  const update = useUpdateRateCheck();
  const [form, setForm] = useState({
    carrier: rc.carrier || '',
    policy_type: rc.policy_type || '',
    current_premium: rc.current_premium != null ? String(rc.current_premium) : '',
    term_months: rc.term_months != null ? String(rc.term_months) : '',
    policy_number_last4: rc.policy_number_last4 || '',
    effective_date: rc.effective_date || '',
    expiration_date: rc.expiration_date || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const annual = annualize(parseMoney(form.current_premium), form.term_months);

  const save = () => {
    update.mutate({
      id: rc.id,
      updates: {
        carrier: form.carrier || null,
        policy_type: form.policy_type || null,
        current_premium: parseMoney(form.current_premium),
        term_months: form.term_months ? Number(form.term_months) : null,
        annual_premium: annual,
        policy_number_last4: form.policy_number_last4 || null,
        effective_date: form.effective_date || null,
        expiration_date: form.expiration_date || null,
      },
    });
  };

  const field = 'w-full rounded-md px-2 py-1.5 text-sm';
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--qs-subtle)' }}>Extracted policy</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Carrier</span>
          <select className={field} style={inputStyle} value={form.carrier} onChange={e => set('carrier', e.target.value)}>
            <option value="">—</option>
            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Type</span>
          <select className={field} style={inputStyle} value={form.policy_type} onChange={e => set('policy_type', e.target.value)}>
            <option value="">—</option>
            {POLICY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Term premium</span>
          <input className={field} style={inputStyle} inputMode="decimal" value={form.current_premium}
            onChange={e => set('current_premium', sanitizeMoneyInput(e.target.value))} placeholder="780.00" />
        </label>
        <label className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Term</span>
          <select className={field} style={inputStyle} value={form.term_months} onChange={e => set('term_months', e.target.value)}>
            <option value="">Unknown</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </select>
        </label>
        <label className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Effective</span>
          <input type="date" className={field} style={inputStyle} value={form.effective_date} onChange={e => set('effective_date', e.target.value)} />
        </label>
        <label className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Expires</span>
          <input type="date" className={field} style={inputStyle} value={form.expiration_date} onChange={e => set('expiration_date', e.target.value)} />
        </label>
        <label className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Policy # (last 4)</span>
          <input className={field} style={inputStyle} maxLength={4} value={form.policy_number_last4} onChange={e => set('policy_number_last4', e.target.value)} />
        </label>
        <div className="space-y-1"><span style={{ color: 'var(--qs-subtle)' }}>Annual premium</span>
          <div className="py-1.5 text-base font-semibold" style={{ color: 'var(--qs-bright)' }}>{money(annual, { cents: true })}</div>
        </div>
      </div>
      {rc.insured_address && <p className="mt-2 text-sm" style={{ color: 'var(--qs-subtle)' }}>Address: {rc.insured_address}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={update.isPending} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {update.isPending ? 'Saving…' : 'Save corrections'}
        </button>
        {update.isSuccess && <span className="text-sm text-green-600">Saved.</span>}
        {update.isError && <span className="text-sm text-red-600">{update.error.message}</span>}
      </div>
    </section>
  );
}

// Allstate quote entry → won/lost + call script.
function QuoteBox({ rc }) {
  const enterQuote = useEnterRateCheckQuote();
  const [premium, setPremium] = useState(rc.allstate_premium != null ? String(rc.allstate_premium) : '');
  const [note, setNote] = useState(rc.quote_note || '');
  const result = enterQuote.data;
  const outcome = result?.status || (['won', 'lost'].includes(rc.status) ? rc.status : null);
  const delta = result?.delta ?? rc.delta;
  const deltaPct = result?.delta_pct ?? rc.delta_pct;
  const declined = rc.status === 'declined';

  const submit = (e) => {
    e.preventDefault();
    const n = parseMoney(premium);
    if (!n || n <= 0) return;
    enterQuote.mutate({ rateCheckId: rc.id, allstatePremium: n, quoteNote: note });
  };

  const script = `Hi ${rc.first_name || 'there'}, it's Cam with Allstate. You sent your ${rc.carrier || 'current'} policy over — ` +
    `I was able to beat it by ${money(delta)} a year with the same coverage. Do you have 5 minutes now to lock it in?`;

  return (
    <section className="rounded-xl p-4" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[160px] space-y-1 text-sm">
          <span style={{ color: 'var(--qs-subtle)' }}>Allstate annual premium</span>
          <input className="w-full rounded-md px-2 py-2 text-base" style={inputStyle} inputMode="decimal" placeholder="1,320"
            value={premium} onChange={e => setPremium(sanitizeMoneyInput(e.target.value))} disabled={declined} />
        </label>
        <label className="flex-[2] min-w-[200px] space-y-1 text-sm">
          <span style={{ color: 'var(--qs-subtle)' }}>Note (optional)</span>
          <input className="w-full rounded-md px-2 py-2 text-base" style={inputStyle} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Same limits, $500 deductibles" disabled={declined} />
        </label>
        <button type="submit" disabled={enterQuote.isPending || !parseMoney(premium) || declined}
          className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {enterQuote.isPending ? 'Saving…' : 'Enter quote'}
        </button>
      </form>
      {rc.annual_premium == null && !declined && (
        <p className="mt-2 text-xs" style={{ color: 'var(--qs-subtle)' }}>No current annual premium yet — fill it in below first, or the outcome will stay “quoted”.</p>
      )}
      {enterQuote.isError && <p className="mt-2 text-sm text-red-600">{enterQuote.error.message}</p>}

      {outcome === 'won' && (
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-green-600">Save {money(delta)}/yr{deltaPct != null ? ` (${deltaPct}%)` : ''}</div>
          <p className="mt-1 text-sm" style={{ color: 'var(--qs-subtle)' }}>Call now — lead moved to Interested.</p>
          <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: 'var(--qs-card)', border: '1px dashed var(--qs-border)' }}>
            <p style={{ color: 'var(--qs-bright)' }}>{script}</p>
            <button type="button" onClick={() => navigator.clipboard?.writeText(script)} className="mt-2 text-xs font-semibold text-primary-600 hover:underline">
              Copy script
            </button>
          </div>
        </div>
      )}
      {outcome === 'lost' && (
        <div className="mt-4 text-sm">
          <div className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}>
            Couldn&apos;t beat it ({money(rc.annual_premium)} vs {money(result?.allstate_premium ?? rc.allstate_premium)}). Lead closed.
          </div>
          {result?.sms && (
            result.sms.attempted && result.sms.ok
              ? <p className="mt-1 text-green-600">Auto-text sent.</p>
              : <p className="mt-1 text-yellow-600">
                  Auto-text not sent{result.sms.reason ? ` — ${result.sms.reason}` : result.sms.error ? ` — ${result.sms.error}` : ''}.
                </p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Win map ──────────────────────────────────────────────────────────────────

function WinMap({ agencyId }) {
  const { data = [], isLoading, error } = useRateCheckWinMap(agencyId);
  const [minQuoted, setMinQuoted] = useState(3);
  const [sortDir, setSortDir] = useState('desc');

  const rows = useMemo(() => data
    .filter(r => Number(r.quoted) >= minQuoted)
    .sort((a, b) => {
      const d = (Number(a.win_rate_pct) || 0) - (Number(b.win_rate_pct) || 0);
      return sortDir === 'desc' ? -d : d;
    }), [data, minQuoted, sortDir]);

  return (
    <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
      <div className="flex flex-wrap items-center gap-3 p-3" style={{ borderBottom: '1px solid var(--qs-border)' }}>
        <label className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          Min quoted{' '}
          <input type="number" min={1} value={minQuoted} onChange={e => setMinQuoted(Math.max(1, Number(e.target.value) || 1))}
            className="ml-1 w-16 rounded px-2 py-1" style={inputStyle} />
        </label>
        <span className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Where we win — carrier × type × ZIP.</span>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">Error loading win map.</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>No carrier/ZIP has {minQuoted}+ quoted rate checks yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ background: 'var(--qs-elevated)' }}>
                <th className={thCls} style={thStyle}>Carrier</th>
                <th className={thCls} style={thStyle}>Type</th>
                <th className={thCls} style={thStyle}>ZIP</th>
                <th className={thCls} style={thStyle}>Quoted</th>
                <th className={thCls} style={thStyle}>Wins</th>
                <th className={thCls} style={thStyle}>
                  <button onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))} className="uppercase">
                    Win rate {sortDir === 'desc' ? '↓' : '↑'}
                  </button>
                </th>
                <th className={thCls} style={thStyle}>Avg savings (won)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.carrier}-${r.policy_type}-${r.zip5}`} style={{ borderTop: '1px solid var(--qs-border)' }}>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-bright)' }}>{r.carrier || '—'}</td>
                  <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--qs-text)' }}>{r.policy_type || '—'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.zip5 || '—'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.quoted}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--qs-text)' }}>{r.wins}</td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{r.win_rate_pct != null ? `${r.win_rate_pct}%` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-green-600">{money(r.avg_savings_when_won)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
