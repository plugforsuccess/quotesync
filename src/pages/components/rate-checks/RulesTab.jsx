// src/pages/components/rate-checks/RulesTab.jsx
// "Rules" tab: the agency's routing rules as cards — line tag, the outcome, the
// rule name, a compact condition ("Dwelling > $4M") and the message shown on the
// rate check. Drag the handle to change the run order; switch a rule off with its
// toggle; edit or delete from the ⋯ menu. Principals edit; everyone can read.
// Saving re-runs the rules on open rate checks.

import { useRef, useState } from 'react';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import {
  useRateCheckRules, useSaveRateCheckRule, useDeleteRateCheckRule, useSeedRateCheckRules, useReorderRateCheckRules,
} from '../../../hooks/useRateChecks';
import { inputStyle } from './ui';
import { RULE_FIELDS, RULE_OPS, RULE_DECISIONS, DECISION, POLICY_TYPE_LABEL } from './format';
import { ruleFormula, withCommas } from './ruleView';

const LINES = [['', 'Any policy'], ...Object.entries(POLICY_TYPE_LABEL)];
const BLANK = { name: '', line: '', field: 'dwelling', op: 'gt', value_num: '', value_text: '', decision: 'double_check', carrier: '', note: '', enabled: true };

const fieldDef = (f) => RULE_FIELDS.find(x => x.value === f) || RULE_FIELDS[0];
// A rule's outcome, in the same colours as the rate check badges.
const outcome = (r) => (r.decision === 'umbrella'
  ? { label: 'Counts toward PUP', cls: DECISION.quote_allstate_umbrella.cls }
  : { label: `${DECISION[r.decision]?.label || r.decision}${r.carrier ? ` — ${r.carrier}` : ''}`, cls: DECISION[r.decision]?.cls || '' });

// Strongest result wins, left to right.
const LADDER = [
  ['Refer', DECISION.refer.cls], ['Manual review', DECISION.manual_review.cls], ['Double check', DECISION.double_check.cls],
  ['Expanded market', DECISION.expanded_market.cls], ['+ Umbrella', DECISION.quote_allstate_umbrella.cls], ['Quote Allstate P&C', DECISION.quote_allstate.cls],
];

function Switch({ on, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      style={{ background: on ? 'var(--qs-success)' : 'var(--qs-border)' }}>
      <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform" style={{ transform: `translateX(${on ? 24 : 4}px)` }} />
    </button>
  );
}

export default function RulesTab({ agencyId, canEdit }) {
  const { data: rules = [], isLoading, error } = useRateCheckRules(agencyId);
  const save = useSaveRateCheckRule();
  const remove = useDeleteRateCheckRule();
  const seed = useSeedRateCheckRules();
  const reorder = useReorderRateCheckRules();
  const [editing, setEditing] = useState(null); // null | 'new' | rule id
  const [menu, setMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Drag to reorder: the order while dragging, by id.
  const [dragId, setDragId] = useState(null);
  const [order, setOrder] = useState(null);
  const refs = useRef({});
  const list = order ? order.map(id => rules.find(r => r.id === id)).filter(Boolean) : rules;

  const move = (ids, from, to) => { const next = [...ids]; next.splice(from, 1); next.splice(to, 0, ids[from]); return next; };
  const saveOrder = (ids) => {
    if (ids.join() !== rules.map(r => r.id).join()) reorder.mutate({ agencyId, rules: ids.map(id => rules.find(r => r.id === id)) });
  };
  const dragStart = (e, id) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setMenu(null);
    setDragId(id);
    setOrder(rules.map(r => r.id));
  };
  const dragMove = (e) => {
    if (!dragId || !order) return;
    const from = order.indexOf(dragId);
    let to = from;
    order.forEach((id, i) => {
      if (id === dragId) return;
      const box = refs.current[id]?.getBoundingClientRect();
      if (!box) return;
      const mid = box.top + box.height / 2;
      if (i < from && e.clientY < mid) to = Math.min(to, i);
      if (i > from && e.clientY > mid) to = Math.max(to, i);
    });
    if (to !== from) setOrder(move(order, from, to));
  };
  const dragEnd = () => {
    if (order) saveOrder(order);
    setDragId(null);
    setOrder(null);
  };
  const nudge = (id, dir) => {
    const ids = rules.map(r => r.id);
    const from = ids.indexOf(id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    saveOrder(move(ids, from, to));
  };

  const submit = (values) => {
    const priority = editing === 'new' ? Math.max(0, ...rules.map(r => r.priority || 0)) + 10 : undefined;
    save.mutate({ id: editing === 'new' ? null : editing, agencyId, values: priority ? { ...values, priority } : values },
      { onSuccess: () => setEditing(null) });
  };

  return (
    <div className="space-y-4">
      {/* Outcome ladder: the strongest result any rule gives wins. */}
      <div className="dark-card" style={{ padding: 14 }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>Strongest result wins</p>
        <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
          {LADDER.map(([label, cls], i) => (
            <li key={label} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" style={{ color: 'var(--qs-subtle)' }}>›</span>}
              <span className={`whitespace-nowrap rounded px-2 py-0.5 font-medium ${cls}`}>{label}</span>
            </li>
          ))}
        </ol>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-primary-600">How rules work</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5" style={{ color: 'var(--qs-text)' }}>
            <li>Every rule runs on every scan, top to bottom. The strongest result any rule gives is where the scan goes.</li>
            <li>Scans that can&apos;t be read always go to Manual review.</li>
            <li>It&apos;s a pre-screen from what the dec page shows, not underwriting.</li>
          </ul>
        </details>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>{rules.length} rule{rules.length === 1 ? '' : 's'}{rules.length > 1 && canEdit ? <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}> · drag to reorder</span> : null}</span>
        {canEdit && (
          <div className="flex gap-2">
            {rules.length === 0 && (
              <button onClick={() => seed.mutate(agencyId)} disabled={seed.isPending} className="min-h-[40px] rounded-lg px-3 text-sm" style={inputStyle}>
                {seed.isPending ? 'Adding…' : 'Add the starter rules'}
              </button>
            )}
            <button onClick={() => { setEditing('new'); setMenu(null); }} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" /> New rule
            </button>
          </div>
        )}
      </div>

      {editing === 'new' && <RuleEditor initial={BLANK} onCancel={() => setEditing(null)} onSave={submit} save={save} />}

      {isLoading ? (
        <div className="dark-card p-8 text-center text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading…</div>
      ) : error ? (
        <div className="dark-card p-8 text-center text-red-600">Error loading rules.</div>
      ) : rules.length === 0 ? (
        <div className="dark-card p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>No rules yet — every scan will say Quote Allstate P&amp;C.</div>
      ) : (
        <ol className="space-y-2">
          {list.map((r, i) => {
            if (editing === r.id) {
              return <li key={r.id}><RuleEditor initial={r} onCancel={() => setEditing(null)} onSave={submit} save={save} /></li>;
            }
            const o = outcome(r);
            const kind = fieldDef(r.field).kind;
            return (
              <li key={r.id} ref={el => { refs.current[r.id] = el; }}
                className={`dark-card relative transition-shadow ${dragId === r.id ? 'shadow-2xl ring-2 ring-primary-600' : ''}`}
                style={{ padding: 0, opacity: r.enabled ? 1 : 0.55 }}>
                <div className="flex items-start">
                  {canEdit && (
                    <button type="button" aria-label={`Drag to reorder ${r.name}`} title="Drag to reorder"
                      onPointerDown={e => dragStart(e, r.id)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}
                      className="flex w-9 shrink-0 cursor-grab touch-none flex-col items-center self-stretch pt-3 active:cursor-grabbing" style={{ color: 'var(--qs-subtle)' }}>
                      <span className="text-[11px] font-bold tabular-nums">{i + 1}</span>
                      <GripVertical className="mt-1 h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                  <div className={`min-w-0 flex-1 py-3 ${canEdit ? 'pr-2' : 'px-4'}`}>
                    <div className="flex items-center gap-2">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: 'var(--qs-elevated)', color: 'var(--qs-subtle)', border: '1px solid var(--qs-border)' }}>
                        {r.line ? POLICY_TYPE_LABEL[r.line] || r.line : 'Any'}
                      </span>
                      <span className={`ml-auto truncate rounded px-2 py-0.5 text-xs font-medium ${o.cls}`}>{o.label}</span>
                    </div>
                    <p className="mt-1.5 font-semibold" style={{ color: 'var(--qs-bright)' }}>{r.name}</p>
                    <p className="font-mono text-sm" style={{ color: 'var(--qs-text)' }}>{ruleFormula(r, kind)}</p>
                    {r.note && <p className="mt-0.5 text-sm italic" style={{ color: 'var(--qs-subtle)' }}>“{r.note}”</p>}
                    {confirmDelete === r.id && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg p-2.5 text-sm" style={{ background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)', color: 'var(--qs-bright)' }}>
                        <span className="flex-1">Delete this rule?</span>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-[36px] rounded-lg px-3" style={inputStyle}>Cancel</button>
                        <button type="button" onClick={() => { remove.mutate({ id: r.id, agencyId }); setConfirmDelete(null); }} className="min-h-[36px] rounded-lg bg-red-600 px-3 font-semibold text-white">Delete</button>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 flex-col items-center gap-1 py-2 pr-2">
                      <button type="button" aria-label={`More for ${r.name}`} aria-expanded={menu === r.id} onClick={() => setMenu(menu === r.id ? null : r.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ color: 'var(--qs-subtle)' }}>
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      <Switch on={r.enabled} label={`${r.name} ${r.enabled ? 'on' : 'off'}`} disabled={save.isPending}
                        onChange={(on) => save.mutate({ id: r.id, agencyId, values: { enabled: on } })} />
                    </div>
                  )}
                </div>
                {menu === r.id && (
                  <div className="absolute right-2 top-12 z-10 w-44 overflow-hidden rounded-lg shadow-xl" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)' }} role="menu">
                    {[
                      ['Edit', () => setEditing(r.id)],
                      ...(i > 0 ? [['Move up', () => nudge(r.id, -1)]] : []),
                      ...(i < list.length - 1 ? [['Move down', () => nudge(r.id, 1)]] : []),
                      ['Delete…', () => setConfirmDelete(r.id), 'text-red-500'],
                    ].map(([label, act, cls]) => (
                      <button key={label} type="button" role="menuitem" onClick={() => { act(); setMenu(null); }}
                        className={`block min-h-[44px] w-full px-4 text-left text-sm ${cls || ''}`} style={cls ? undefined : { color: 'var(--qs-bright)' }}>{label}</button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {(reorder.isError || remove.isError) && <p className="text-sm text-red-500">{(reorder.error || remove.error).message}</p>}
    </div>
  );
}

// ── Editor: active toggle on top, typed value, live preview of the card ──

function RuleEditor({ initial, onCancel, onSave, save }) {
  const [form, setForm] = useState(() => ({
    ...BLANK, ...initial, line: initial.line || '', value_num: initial.value_num != null ? String(initial.value_num) : '',
    value_text: initial.value_text || '', carrier: initial.carrier || '', note: initial.note || '',
  }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const kind = fieldDef(form.field).kind;
  const needsValue = form.op !== 'missing';
  const preview = {
    ...form,
    value_num: form.value_num === '' ? null : Number(form.value_num),
  };
  const o = outcome(form.decision === 'expanded_market' ? form : { ...form, carrier: '' });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      line: form.line || null,
      field: form.field,
      op: form.op,
      value_num: needsValue && kind !== 'text' && form.value_num !== '' ? Number(form.value_num) : null,
      value_text: needsValue && kind === 'text' ? form.value_text.trim() || null : null,
      decision: form.decision,
      carrier: form.decision === 'expanded_market' ? form.carrier.trim() || null : null,
      note: form.note.trim() || null,
      enabled: form.enabled,
    });
  };

  const field = 'w-full rounded-lg px-3 py-2 text-sm';
  const label = (t) => <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--qs-subtle)' }}>{t}</span>;

  return (
    <form onSubmit={submit} className="dark-card space-y-3" style={{ padding: 16 }}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{initial.id ? 'Edit rule' : 'New rule'}</span>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--qs-text)' }}>
          Rule active <Switch on={form.enabled} label="Rule active" onChange={(on) => set('enabled', on)} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">{label('Rule name')}
          <input className={field} style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="High-value home" required />
        </label>
        <label>{label('Applies to')}
          <select className={field} style={inputStyle} value={form.line} onChange={e => set('line', e.target.value)}>
            {LINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>{label('When')}
          <select className={field} style={inputStyle} value={form.field}
            onChange={e => { const f = fieldDef(e.target.value); setForm(x => ({ ...x, field: f.value, op: RULE_OPS[f.kind][0][0], value_num: '', value_text: '' })); }}>
            {RULE_FIELDS.filter(f => !form.line || !f.lines || f.lines.includes(form.line)).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label>{label('Condition')}
          <select className={field} style={inputStyle} value={form.op} onChange={e => set('op', e.target.value)}>
            {RULE_OPS[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {needsValue && (
          <label>{label(kind === 'text' && form.op.includes('in') ? 'Values (comma-separated)' : 'Value')}
            {kind === 'text' ? (
              <input className={field} style={inputStyle} value={form.value_text} onChange={e => set('value_text', e.target.value)} placeholder={form.field === 'zip' ? '300' : 'State Farm, GEICO'} />
            ) : kind === 'money' ? (
              <span className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--qs-subtle)' }}>$</span>
                <input className={`${field} pl-7`} style={inputStyle} inputMode="numeric" value={withCommas(form.value_num)}
                  onChange={e => set('value_num', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="1,000,000" />
              </span>
            ) : (
              <input className={field} style={inputStyle} inputMode="numeric" value={form.value_num}
                onChange={e => set('value_num', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="3" />
            )}
          </label>
        )}
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
        <label className="sm:col-span-2">{label('Shown on the rate check')}
          <input className={field} style={inputStyle} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Confirm every car and driver before quoting" />
        </label>
      </div>

      {/* How it will read on the rate check. */}
      <div className="rounded-lg p-3" style={{ background: 'var(--qs-elevated)', border: '1px dashed var(--qs-border)' }}>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>Preview</p>
        <p className="text-sm" style={{ color: 'var(--qs-bright)' }}>
          <span className={`mr-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${o.cls}`}>{o.label}</span>
          {form.note.trim() || <span style={{ color: 'var(--qs-subtle)' }}>Add the message staff will see</span>}
        </p>
        <p className="mt-1 font-mono text-xs" style={{ color: 'var(--qs-subtle)' }}>When {ruleFormula(preview, kind)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={save.isPending || !form.name.trim()} className="min-h-[44px] rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save rule'}
        </button>
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg px-4 text-sm" style={inputStyle}>Cancel</button>
        {save.isError && <span className="text-sm text-red-600">{save.error.message}</span>}
      </div>
    </form>
  );
}
