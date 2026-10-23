// src/pages/components/rate-checks/RulesTab.jsx
// "Rules" tab: the agency's routing rules, in plain sentences
// ("Home · Dwelling limit is over $1,000,000 → Expanded market — Chubb").
// Principals edit; everyone can read. Saving re-runs the rules on open rate checks.

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useRateCheckRules, useSaveRateCheckRule, useDeleteRateCheckRule, useSeedRateCheckRules } from '../../../hooks/useRateChecks';
import { inputStyle, money } from './ui';
import { RULE_FIELDS, RULE_OPS, RULE_DECISIONS, DECISION, POLICY_TYPE_LABEL } from './format';

const LINES = [['', 'Any policy'], ...Object.entries(POLICY_TYPE_LABEL)];
const BLANK = { name: '', line: '', field: 'dwelling', op: 'gt', value_num: '', value_text: '', decision: 'double_check', carrier: '', note: '', enabled: true, priority: 100 };

const fieldDef = (f) => RULE_FIELDS.find(x => x.value === f) || RULE_FIELDS[0];
const opLabel = (field, op) => (RULE_OPS[fieldDef(field).kind].find(([v]) => v === op) || [])[1] || op;

function sentence(r) {
  const f = fieldDef(r.field);
  const val = r.op === 'missing' ? '' : f.kind === 'money' ? money(r.value_num) : f.kind === 'number' ? String(r.value_num ?? '') : (r.value_text || '');
  return `${f.label} ${opLabel(r.field, r.op)}${val ? ` ${val}` : ''}`;
}

export default function RulesTab({ agencyId, canEdit }) {
  const { data: rules = [], isLoading, error } = useRateCheckRules(agencyId);
  const save = useSaveRateCheckRule();
  const remove = useDeleteRateCheckRule();
  const seed = useSeedRateCheckRules();
  const [editing, setEditing] = useState(null); // null | 'new' | rule id
  const [form, setForm] = useState(BLANK);

  const start = (r) => {
    setEditing(r ? r.id : 'new');
    setForm(r ? { ...BLANK, ...r, line: r.line || '', value_num: r.value_num ?? '', value_text: r.value_text || '', carrier: r.carrier || '', note: r.note || '' } : BLANK);
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const kind = fieldDef(form.field).kind;
  const needsValue = form.op !== 'missing';

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    save.mutate({
      id: editing === 'new' ? null : editing,
      agencyId,
      values: {
        name: form.name.trim(),
        line: form.line || null,
        field: form.field,
        op: form.op,
        value_num: needsValue && kind !== 'text' && form.value_num !== '' ? Number(String(form.value_num).replace(/[$,]/g, '')) : null,
        value_text: needsValue && kind === 'text' ? form.value_text.trim() || null : null,
        decision: form.decision,
        carrier: form.decision === 'expanded_market' ? form.carrier.trim() || null : null,
        note: form.note.trim() || null,
        enabled: form.enabled,
        priority: Number(form.priority) || 100,
      },
    }, { onSuccess: () => setEditing(null) });
  };

  const field = 'w-full rounded px-2 py-1.5 text-sm';
  const label = (t) => <span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>{t}</span>;

  return (
    <div className="space-y-4">
      <div className="dark-card text-sm" style={{ padding: 12, color: 'var(--qs-subtle)' }}>
        Rules run on every scan and pick where it goes: <span style={{ color: 'var(--qs-text)' }}>Quote Allstate P&amp;C, + umbrella, Expanded market, Double check, Manual Review, or Refer</span>.
        The strongest result wins. Unreadable scans always go to Manual Review. This is a pre-screen from what the dec page shows, not underwriting.
      </div>

      <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
        <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--qs-border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{rules.length} rule{rules.length === 1 ? '' : 's'}</span>
          {canEdit && (
            <div className="flex gap-2">
              {rules.length === 0 && (
                <button onClick={() => seed.mutate(agencyId)} disabled={seed.isPending} className="rounded-lg px-3 py-1.5 text-sm" style={inputStyle}>
                  {seed.isPending ? 'Adding…' : 'Add the starter rules'}
                </button>
              )}
              <button onClick={() => start(null)} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white">
                <Plus className="h-4 w-4" /> New rule
              </button>
            </div>
          )}
        </div>

        {editing && (
          <form onSubmit={submit} className="grid gap-3 p-4 md:grid-cols-4" style={{ borderBottom: '1px solid var(--qs-border)', background: 'var(--qs-elevated)' }}>
            <label className="md:col-span-2">{label('Rule name')}
              <input className={field} style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="High-value home" required />
            </label>
            <label>{label('Applies to')}
              <select className={field} style={inputStyle} value={form.line} onChange={e => set('line', e.target.value)}>
                {LINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>{label('Order (lower runs first)')}
              <input className={field} style={inputStyle} type="number" value={form.priority} onChange={e => set('priority', e.target.value)} />
            </label>

            <label>{label('When')}
              <select className={field} style={inputStyle} value={form.field}
                onChange={e => { const f = fieldDef(e.target.value); set('field', f.value); set('op', RULE_OPS[f.kind][0][0]); }}>
                {RULE_FIELDS.filter(f => !form.line || !f.lines || f.lines.includes(form.line)).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label>{label('Condition')}
              <select className={field} style={inputStyle} value={form.op} onChange={e => set('op', e.target.value)}>
                {RULE_OPS[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className={needsValue ? '' : 'invisible'}>{label(kind === 'text' ? (form.op.includes('in') ? 'Values (comma-separated)' : 'Value') : 'Amount')}
              {kind === 'text'
                ? <input className={field} style={inputStyle} value={form.value_text} onChange={e => set('value_text', e.target.value)} placeholder={form.field === 'zip' ? '300' : 'State Farm, GEICO'} />
                : <input className={field} style={inputStyle} inputMode="decimal" value={form.value_num} onChange={e => set('value_num', e.target.value.replace(/[^\d.]/g, ''))} placeholder={kind === 'money' ? '1000000' : '3'} />}
            </label>
            <label>{label('Then')}
              <select className={field} style={inputStyle} value={form.decision} onChange={e => set('decision', e.target.value)}>
                {RULE_DECISIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            {form.decision === 'expanded_market' && (
              <label>{label('Carrier')}
                <input className={field} style={inputStyle} value={form.carrier} onChange={e => set('carrier', e.target.value)} placeholder="Chubb" />
              </label>
            )}
            <label className={form.decision === 'expanded_market' ? 'md:col-span-3' : 'md:col-span-4'}>{label('Shown on the card')}
              <input className={field} style={inputStyle} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Dwelling limit is over the Allstate cutoff" />
            </label>

            <div className="flex items-center gap-3 md:col-span-4">
              <button type="submit" disabled={save.isPending} className="rounded bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {save.isPending ? 'Saving…' : 'Save rule'}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded px-3 py-1.5 text-sm" style={inputStyle}>Cancel</button>
              <label className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--qs-text)' }}>
                <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} /> On
              </label>
              {save.isError && <span className="text-sm text-red-600">{save.error.message}</span>}
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">Error loading rules.</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>No rules yet — every scan will say Quote Allstate P&amp;C.</div>
        ) : (
          <ul>
            {rules.map(r => {
              const d = DECISION[r.decision === 'umbrella' ? 'quote_allstate_umbrella' : r.decision];
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm" style={{ borderTop: '1px solid var(--qs-border)', opacity: r.enabled ? 1 : 0.5 }}>
                  <span className="w-28 shrink-0 text-xs uppercase" style={{ color: 'var(--qs-subtle)' }}>{r.line ? POLICY_TYPE_LABEL[r.line] || r.line : 'any'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium" style={{ color: 'var(--qs-bright)' }}>{r.name}</span>
                    <span style={{ color: 'var(--qs-text)' }}> · {sentence(r)}</span>
                    {r.note && <span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>{r.note}</span>}
                  </span>
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${d?.cls || ''}`}>
                    {r.decision === 'umbrella' ? 'Counts toward PUP' : d?.label}{r.carrier ? ` — ${r.carrier}` : ''}
                  </span>
                  {!r.enabled && <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>off</span>}
                  {canEdit && (
                    <span className="flex items-center gap-2">
                      <button onClick={() => start(r)} className="text-primary-600 hover:underline">Edit</button>
                      <button onClick={() => { if (window.confirm(`Delete “${r.name}”?`)) remove.mutate({ id: r.id, agencyId }); }}
                        aria-label={`Delete ${r.name}`} className="rounded p-1" style={{ color: 'var(--qs-subtle)' }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
