// src/pages/components/retention/WorkloadDistribution.jsx
// Principal/manager tool to rebalance active retention work between reps.
// Moves a percentage of a source rep's ACTIVE cancel and/or renewal cases to a
// target rep. Selection is stratified across the urgency-sorted list so a split
// pulls a balanced mix (not just the soonest or the furthest-out cases).
//
// RLS: "Agency members can manage pending_cases / renewal_events" lets any
// active agency member update cases in their own agency, so these client-side
// reassignments succeed for a principal/manager.

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useActiveEmployees } from '../../../hooks/useEmployees';

// Statuses considered "closed" — mirrors the exclusions in MyQueuePage so the
// counts here match what reps actually see in their queue.
const PENDING_EXCLUDED = ['saved', 'rewritten', 'lost', 'auto_resolved', 'cancelled', 'requested_cancellation'];
const RENEWAL_EXCLUDED = ['confirmed', 'lost', 'auto_resolved', 'unreachable'];

function empName(e) {
  if (!e) return 'Unknown';
  return e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unknown';
}

// Pick k items spread evenly across the (already date-sorted) array, so a split
// takes a balanced mix of urgent and non-urgent cases rather than a contiguous
// slice from one end.
function stratifiedSample(arr, k) {
  if (k >= arr.length) return [...arr];
  if (k <= 0) return [];
  const out = [];
  const step = arr.length / k;
  for (let i = 0; i < k; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

export default function WorkloadDistribution({ agencyId }) {
  const queryClient = useQueryClient();
  const { data: employees = [] } = useActiveEmployees(agencyId);

  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [caseType, setCaseType] = useState('both'); // 'cancels' | 'renewals' | 'both'
  const [pct, setPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Active workload per assignee, computed from the live case tables.
  const { data: workload, isLoading } = useQuery({
    queryKey: ['workload_distribution', agencyId],
    queryFn: async () => {
      const [pc, rc] = await Promise.all([
        supabase.from('pending_cases').select('assigned_to_id')
          .eq('agency_id', agencyId)
          .not('status', 'in', `(${PENDING_EXCLUDED.join(',')})`),
        supabase.from('renewal_cases').select('assigned_to_id')
          .eq('agency_id', agencyId)
          .not('status', 'in', `(${RENEWAL_EXCLUDED.join(',')})`),
      ]);
      if (pc.error) throw pc.error;
      if (rc.error) throw rc.error;
      const byEmp = {};
      const bump = (id, key) => {
        const k = id || 'unassigned';
        byEmp[k] = byEmp[k] || { cancels: 0, renewals: 0 };
        byEmp[k][key] += 1;
      };
      (pc.data || []).forEach(r => bump(r.assigned_to_id, 'cancels'));
      (rc.data || []).forEach(r => bump(r.assigned_to_id, 'renewals'));
      return { byEmp, total: { cancels: pc.data?.length || 0, renewals: rc.data?.length || 0 } };
    },
    enabled: !!agencyId,
    staleTime: 60 * 1000,
  });

  const byEmp = useMemo(() => workload?.byEmp || {}, [workload]);

  // Default the source to whoever holds the most active cases.
  useEffect(() => {
    if (sourceId || !employees.length || !workload) return;
    let best = '';
    let bestN = -1;
    for (const e of employees) {
      const w = byEmp[e.id] || { cancels: 0, renewals: 0 };
      const n = w.cancels + w.renewals;
      if (n > bestN) { bestN = n; best = e.id; }
    }
    if (best) setSourceId(best);
  }, [employees, workload]); // eslint-disable-line react-hooks/exhaustive-deps

  const sourceCounts = byEmp[sourceId] || { cancels: 0, renewals: 0 };
  const previewCancels = (caseType === 'cancels' || caseType === 'both')
    ? Math.round(sourceCounts.cancels * pct / 100) : 0;
  const previewRenewals = (caseType === 'renewals' || caseType === 'both')
    ? Math.round(sourceCounts.renewals * pct / 100) : 0;

  const targetEmp = useMemo(() => employees.find(e => e.id === targetId), [employees, targetId]);

  async function moveCases(table, dateCol, excluded) {
    const { data, error } = await supabase.from(table).select('id')
      .eq('agency_id', agencyId)
      .eq('assigned_to_id', sourceId)
      .not('status', 'in', `(${excluded.join(',')})`)
      .order(dateCol, { ascending: true });
    if (error) throw error;
    const ids = (data || []).map(r => r.id);
    const picked = stratifiedSample(ids, Math.round(ids.length * pct / 100));
    for (let i = 0; i < picked.length; i += 200) {
      const chunk = picked.slice(i, i + 200);
      const { error: upErr } = await supabase.from(table)
        .update({ assigned_to_id: targetId }).in('id', chunk);
      if (upErr) throw upErr;
    }
    return picked.length;
  }

  async function handleApply() {
    setErr(''); setMsg('');
    if (!sourceId || !targetId) { setErr('Pick both a source and a target rep.'); return; }
    if (sourceId === targetId) { setErr('Source and target must be different reps.'); return; }
    if (previewCancels + previewRenewals === 0) { setErr('Nothing to move — adjust the percentage or case type.'); return; }
    setBusy(true);
    try {
      let movedC = 0;
      let movedR = 0;
      if (caseType === 'cancels' || caseType === 'both') {
        movedC = await moveCases('pending_cases', 'cancel_effective_date', PENDING_EXCLUDED);
      }
      if (caseType === 'renewals' || caseType === 'both') {
        movedR = await moveCases('renewal_cases', 'renewal_date', RENEWAL_EXCLUDED);
      }
      setMsg(`Moved ${movedC} cancel case${movedC !== 1 ? 's' : ''} and ${movedR} renewal${movedR !== 1 ? 's' : ''} to ${empName(targetEmp)}.`);
      queryClient.invalidateQueries({ queryKey: ['workload_distribution', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['my_cancel_cases'] });
      queryClient.invalidateQueries({ queryKey: ['my_renewal_cases'] });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Rows for the workload summary table, busiest first.
  const rows = useMemo(() => {
    const list = employees.map(e => ({
      id: e.id,
      name: empName(e),
      ...(byEmp[e.id] || { cancels: 0, renewals: 0 }),
    }));
    if (byEmp.unassigned) {
      list.push({ id: 'unassigned', name: 'Unassigned', ...byEmp.unassigned });
    }
    return list.sort((a, b) => (b.cancels + b.renewals) - (a.cancels + a.renewals));
  }, [employees, byEmp]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <div className="card">
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>
          Workload Distribution
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 16 }}>
          Move a share of one rep&apos;s active cases to another. Picks are spread across
          urgency so each rep gets a balanced mix.
        </div>

        {/* Current workload */}
        <table style={{ marginBottom: 20 }}>
          <thead>
            <tr><th>Rep</th><th style={{ textAlign: 'right' }}>Cancels</th><th style={{ textAlign: 'right' }}>Renewals</th><th style={{ textAlign: 'right' }}>Total</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} style={{ color: 'var(--qs-subtle)' }}>Loading…</td></tr>}
            {!isLoading && rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: r.id === 'unassigned' ? 400 : 600, color: r.id === 'unassigned' ? 'var(--qs-subtle)' : 'var(--qs-text)' }}>{r.name}</td>
                <td style={{ textAlign: 'right' }}>{r.cancels}</td>
                <td style={{ textAlign: 'right' }}>{r.renewals}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.cancels + r.renewals}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 170 }}>
            <label>From (source)</label>
            <select value={sourceId} onChange={e => setSourceId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select rep…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {empName(e)} ({(byEmp[e.id]?.cancels || 0) + (byEmp[e.id]?.renewals || 0)})
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 170 }}>
            <label>To (target)</label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select rep…</option>
              {employees.filter(e => e.id !== sourceId).map(e => (
                <option key={e.id} value={e.id}>{empName(e)}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 150 }}>
            <label>Case type</label>
            <select value={caseType} onChange={e => setCaseType(e.target.value)} style={{ width: '100%' }}>
              <option value="both">Cancels + Renewals</option>
              <option value="cancels">Cancels only</option>
              <option value="renewals">Renewals only</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <label>Share to move: {pct}%</label>
            <input type="range" min={0} max={100} step={5} value={pct}
              onChange={e => setPct(Number(e.target.value))}
              style={{ width: '100%', padding: 0, background: 'transparent' }} />
          </div>
        </div>

        {/* Preview */}
        <div style={{
          marginTop: 16, padding: '12px 14px', borderRadius: 8,
          background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
          fontSize: 13, color: 'var(--qs-dim)',
        }}>
          {sourceId
            ? <>Will move <strong style={{ color: 'var(--qs-bright)' }}>{previewCancels}</strong> cancel case{previewCancels !== 1 ? 's' : ''} and{' '}
                <strong style={{ color: 'var(--qs-bright)' }}>{previewRenewals}</strong> renewal{previewRenewals !== 1 ? 's' : ''}
                {targetEmp ? <> to <strong style={{ color: 'var(--qs-bright)' }}>{empName(targetEmp)}</strong></> : ''}.</>
            : 'Select a source rep to preview the move.'}
        </div>

        {err && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 12, marginBottom: 0 }}>{err}</p>}
        {msg && <p style={{ fontSize: 13, color: '#10B981', marginTop: 12, marginBottom: 0 }}>{msg}</p>}

        <div style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={handleApply}
            disabled={busy || !sourceId || !targetId || sourceId === targetId}>
            {busy ? 'Moving…' : 'Apply Reassignment'}
          </button>
        </div>
      </div>
    </div>
  );
}
