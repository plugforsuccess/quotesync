// src/pages/components/planning/ProductionGoalsTab.jsx
// Production Goals workspace — set a monthly production goal per sales producer
// with the context needed to make the call: trailing production, last-month
// actual, a 6-month sparkline, and a suggested goal. Goals are effective-dated
// (one effective month at a time), so changes keep history.
//
// Phase 3: per-producer rows + Mode-A suggestions + effective-month picker.
// (Phase 4 adds the agency-goal rollup band and "Apply suggested to all".)

import { useMemo, useState, useEffect, useRef } from 'react';
import { Target, ChevronDown, ChevronUp, Check, Sparkles } from 'lucide-react';
import { useActiveEmployees } from '../../../hooks/useEmployees';
import {
  useAllProducerTargets,
  useSaveProducerTargets,
  PRODUCER_DEFAULT_TARGETS,
} from '../../../hooks/useProducerTargets';
import { useProducerProductionSeries } from '../../../hooks/useProducerProductionSeries';

const PRIMARY_FIELDS = [
  { key: 'premium_monthly',  label: 'Premium Goal / Mo', money: true },
  { key: 'vc_items_monthly', label: 'VC Items / Mo' },
];

const ADVANCED_FIELDS = [
  { key: 'outbound_calls_weekly', label: 'Outbound Calls / Wk' },
  { key: 'avg_calls_per_day',     label: 'Avg Calls / Day' },
  { key: 'grade_a_vc_items',      label: 'Grade A — VC Items' },
  { key: 'grade_b_vc_items',      label: 'Grade B — VC Items' },
  { key: 'grade_c_vc_items',      label: 'Grade C — VC Items' },
  { key: 'grade_a_outbound',      label: 'Grade A — Outbound' },
  { key: 'grade_b_outbound',      label: 'Grade B — Outbound' },
  { key: 'grade_c_outbound',      label: 'Grade C — Outbound' },
];

const ALL_FIELDS = [...PRIMARY_FIELDS, ...ADVANCED_FIELDS].map((f) => f.key);

const money = (n) => `$${Math.round(n || 0).toLocaleString()}`;
const roundTo = (n, step) => Math.round(n / step) * step;

function monthsSince(dateStr) {
  if (!dateStr) return Infinity; // unknown hire date → treat as tenured
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return Infinity;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function median(nums) {
  const xs = nums.filter((n) => n > 0).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// Completed months exclude the current (partial) month; trailing window is the
// last up-to-3 completed months.
function trailingStats(bucket) {
  const months = bucket?.months || [];
  const completed = months.slice(0, -1);
  const last3 = completed.slice(-3);
  const avg = (sel) => (last3.length ? last3.reduce((s, m) => s + sel(m), 0) / last3.length : 0);
  // Recency-weighted (newest heaviest) for suggestions.
  const weighted = (sel) => {
    if (!last3.length) return 0;
    let num = 0, den = 0;
    last3.forEach((m, i) => { const w = i + 1; num += sel(m) * w; den += w; });
    return den ? num / den : 0;
  };
  return {
    avgPremium: avg((m) => m.premium),
    avgItems: avg((m) => m.items),
    weightedPremium: weighted((m) => m.premium),
    weightedItems: weighted((m) => m.items),
    lastMonth: completed[completed.length - 1] || null,
    hasData: last3.some((m) => m.premium > 0 || m.items > 0),
  };
}

// Mode-A suggestion: run-rate + growth for tenured producers; a ramp fraction of
// the team's steady-state for new hires or those with no production yet.
const RAMP = { 0: 0.4, 1: 0.6, 2: 0.8 };
function computeSuggestion(stats, tenureMo, steady) {
  let premium, items;
  if (tenureMo >= 3 && stats.hasData) {
    premium = stats.weightedPremium * 1.05;
    items = stats.weightedItems * 1.05;
  } else {
    const ramp = RAMP[Math.max(0, Math.floor(tenureMo))] ?? 1.0;
    premium = steady.premium * ramp;
    items = steady.items * ramp;
  }
  return {
    premium: roundTo(premium, 500),
    items: Math.round(items),
  };
}

function Sparkline({ values, width = 72, height = 22 }) {
  const max = Math.max(...values, 1);
  const n = values.length || 1;
  const barW = width / n;
  return (
    <svg width={width} height={height} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2));
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={height - h}
            width={Math.max(1, barW - 1.5)}
            height={h}
            rx="1"
            fill="var(--qs-info)"
            opacity={i === n - 1 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}

function ProducerGoalRow({ producer, userId, savedTargets, bucket, steady, effectiveDate, saveAsync, defaultExpanded }) {
  const rowRef = useRef(null);
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [status, setStatus] = useState(null); // 'saving' | 'saved'

  const seed = useMemo(() => {
    const v = { ...PRODUCER_DEFAULT_TARGETS };
    for (const k of ALL_FIELDS) if (savedTargets?.[k] != null) v[k] = Number(savedTargets[k]);
    return v;
  }, [savedTargets]);

  const [form, setForm] = useState(seed);
  // Re-seed from server data when it changes and the user isn't mid-edit.
  useEffect(() => { setForm(seed); }, [seed]);

  useEffect(() => {
    if (defaultExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [defaultExpanded]);

  const stats = useMemo(() => trailingStats(bucket), [bucket]);
  const tenureMo = monthsSince(producer.hire_date);
  const isNewHire = tenureMo < 3;
  const suggestion = useMemo(() => computeSuggestion(stats, tenureMo, steady), [stats, tenureMo, steady]);

  const name = `${producer.preferred_name || producer.first_name} ${producer.last_name || ''}`.trim();
  const goal = Number(form.premium_monthly) || 0;
  const lastPremium = stats.lastMonth?.premium || 0;
  const pctOfGoal = goal > 0 ? Math.round((lastPremium / goal) * 100) : null;
  const sparkValues = (bucket?.months || []).map((m) => m.premium);

  async function commit(field, overrideValue) {
    const nextForm = overrideValue != null ? { ...form, [field]: overrideValue } : form;
    if (overrideValue != null) setForm(nextForm);
    const val = Number(nextForm[field]);
    if (!Number.isFinite(val)) return;
    if (val === Number(seed[field])) return; // unchanged — skip the write
    const targets = Object.fromEntries(ALL_FIELDS.map((k) => [k, Number(nextForm[k]) || 0]));
    setStatus('saving');
    try {
      await saveAsync({ employeeUserId: userId, targets, effectiveDate });
      setStatus('saved');
      setTimeout(() => setStatus(null), 1500);
    } catch {
      setStatus(null);
    }
  }

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const showSuggest = suggestion.premium > 0 && suggestion.premium !== goal;

  return (
    <div ref={rowRef} className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 170 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,130,246,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--qs-info)', fontWeight: 700, fontSize: 13, flexShrink: 0,
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>{name}</div>
            {isNewHire && (
              <div style={{ fontSize: 11, color: 'var(--qs-warning, #D97706)' }}>
                Ramping · {Number.isFinite(tenureMo) ? `${tenureMo} mo` : 'new'}
              </div>
            )}
          </div>
        </div>

        {/* Trailing context */}
        <div style={{ minWidth: 90 }}>
          <div style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>3-mo avg</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-text)' }}>{money(stats.avgPremium)}</div>
        </div>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>
            Last mo{stats.lastMonth ? ` (${stats.lastMonth.month})` : ''}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-text)' }}>
            {money(lastPremium)}
            {pctOfGoal != null && (
              <span style={{ marginLeft: 6, fontSize: 11, color: pctOfGoal >= 100 ? 'var(--qs-success, #059669)' : 'var(--qs-subtle)' }}>
                {pctOfGoal}% of goal
              </span>
            )}
          </div>
        </div>
        <div style={{ minWidth: 76 }}>
          <Sparkline values={sparkValues} />
        </div>

        {/* Goal inputs */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11 }}>Premium / Mo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>$</span>
              <input
                type="number" min="0" step="500"
                value={form.premium_monthly}
                onChange={(e) => setField('premium_monthly', e.target.value)}
                onBlur={() => commit('premium_monthly')}
                style={{ width: 110 }}
              />
            </div>
            {showSuggest && (
              <button
                type="button"
                onClick={() => commit('premium_monthly', String(suggestion.premium))}
                title="Apply suggested goal"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--qs-info)', fontSize: 11,
                }}
              >
                <Sparkles size={11} /> Suggested {money(suggestion.premium)}
              </button>
            )}
          </div>
          <div>
            <label style={{ fontSize: 11 }}>VC Items / Mo</label>
            <input
              type="number" min="0" step="1"
              value={form.vc_items_monthly}
              onChange={(e) => setField('vc_items_monthly', e.target.value)}
              onBlur={() => commit('vc_items_monthly')}
              style={{ width: 80 }}
            />
          </div>
          <div style={{ width: 60, paddingTop: 18, textAlign: 'right' }}>
            {status === 'saving' && <span style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>Saving…</span>}
            {status === 'saved' && (
              <span style={{ fontSize: 11, color: 'var(--qs-success, #059669)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Check size={11} /> Saved
              </span>
            )}
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="btn-ghost"
          style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          Advanced {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Advanced — grade thresholds + activity targets */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--qs-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {ADVANCED_FIELDS.map((f) => (
              <div key={f.key}>
                <label style={{ fontSize: 11 }}>{f.label}</label>
                <input
                  type="number" min="0"
                  step={f.key === 'avg_calls_per_day' ? '0.5' : '1'}
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={() => commit(f.key)}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductionGoalsTab({ agencyId, focusProducerId }) {
  // Effective month — goals are written effective the 1st of this month; the
  // read resolves whatever goal is in force through month-end.
  const [monthStr, setMonthStr] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [y, m] = monthStr.split('-').map(Number);
  const effectiveDate = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const asOf = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

  const { data: roster = [] } = useActiveEmployees(agencyId);
  const { data: allTargets = [] } = useAllProducerTargets(agencyId, asOf);
  const { data: series } = useProducerProductionSeries(agencyId, { months: 6 });
  const { mutateAsync: saveAsync } = useSaveProducerTargets(agencyId);

  const producers = useMemo(
    () => roster.filter((e) => e.roles?.includes('sales') || e.roles?.includes('producer')),
    [roster]
  );

  const targetsByUser = useMemo(() => {
    const map = {};
    for (const t of allTargets) map[t.employee_user_id] = t;
    return map;
  }, [allTargets]);

  // Team steady-state reference for ramping new hires: median trailing run-rate
  // among tenured producers with production.
  const steady = useMemo(() => {
    const byEmp = series?.byEmployee || {};
    const prem = [], items = [];
    for (const p of producers) {
      if (monthsSince(p.hire_date) < 3) continue;
      const s = trailingStats(byEmp[p.id]);
      if (s.avgPremium > 0) prem.push(s.avgPremium);
      if (s.avgItems > 0) items.push(s.avgItems);
    }
    return { premium: median(prem), items: median(items) };
  }, [series, producers]);

  if (!producers.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <Target size={36} style={{ color: 'var(--qs-muted)', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 4 }}>
          No producers found
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-dim)' }}>
          Add employees with the “sales” role to set production goals.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={18} style={{ color: 'var(--qs-info)' }} /> Production Goals
          </div>
          <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginTop: 2 }}>
            Set each producer’s monthly goal. Changes are kept as history per effective month.
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11 }}>Effective month</label>
          <input type="month" value={monthStr} onChange={(e) => setMonthStr(e.target.value)} />
        </div>
      </div>

      {producers.map((p) => {
        const userId = p.auth_user_id || p.id;
        return (
          <ProducerGoalRow
            key={userId}
            producer={p}
            userId={userId}
            savedTargets={targetsByUser[userId]}
            bucket={series?.byEmployee?.[p.id]}
            steady={steady}
            effectiveDate={effectiveDate}
            saveAsync={saveAsync}
            defaultExpanded={focusProducerId && (focusProducerId === userId || focusProducerId === p.id)}
          />
        );
      })}
    </div>
  );
}
