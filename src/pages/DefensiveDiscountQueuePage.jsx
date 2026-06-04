// src/pages/DefensiveDiscountQueuePage.jsx
// "Defensive Drivers Discount List" — staff work queue (realtime).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  getQueueAccess, getQueueList, getAssignableStaff, updateQueueItem, getStaffCertUrl,
} from '../lib/ddApi';

const STATUSES = ['new', 'in_review', 'applied', 'completed', 'archived'];
const STATUS_STYLES = {
  new: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  in_review: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  applied: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  completed: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  archived: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function DefensiveDiscountQueuePage() {
  const { user, loading: authLoading } = useAuth();
  const [access, setAccess] = useState(null); // {isStaff, isPrincipal}
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const refetchTimer = useRef(null);

  const refetch = useCallback(async () => {
    try { setRows(await getQueueList()); } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    let live = true;
    (async () => {
      try {
        const acc = await getQueueAccess();
        if (!live) return;
        setAccess(acc);
        if (!acc.isStaff && !acc.isPrincipal) { setLoading(false); return; }
        const [list, st] = await Promise.all([
          getQueueList(),
          acc.isStaff ? getAssignableStaff() : Promise.resolve([]),
        ]);
        if (!live) return;
        setRows(list); setStaff(st);
      } catch (err) {
        if (live) setError(err.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [user, authLoading]);

  // Realtime: refetch (debounced) on any queue change.
  useEffect(() => {
    if (!access || (!access.isStaff && !access.isPrincipal)) return;
    const channel = supabase
      .channel('dd-discount-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dd_discount_queue' }, () => {
        clearTimeout(refetchTimer.current);
        refetchTimer.current = setTimeout(refetch, 400);
      })
      .subscribe();
    return () => { clearTimeout(refetchTimer.current); supabase.removeChannel(channel); };
  }, [access, refetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (statusFilter === 'all' || r.status === statusFilter) &&
      (assigneeFilter === 'all'
        || (assigneeFilter === 'unassigned' && !r.assigned_to)
        || r.assigned_to === assigneeFilter) &&
      (!q || (r.insured_name || '').toLowerCase().includes(q) || (r.certificate_uid || '').toLowerCase().includes(q))
    );
  }, [rows, statusFilter, assigneeFilter, search]);

  if (authLoading || loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Loader2 className="w-8 h-8 text-success-400 animate-spin" /></div>;
  }
  if (!user) return <Navigate to="/admin-access-8by2X" replace />;
  if (access && !access.isStaff && !access.isPrincipal) {
    return <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center p-6">You don’t have access to this queue.</div>;
  }
  const canEdit = !!access?.isStaff;

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4 mb-1">
          <h1 className="text-2xl font-black">Defensive Drivers Discount List</h1>
          <button onClick={refetch} className="text-gray-400 hover:text-gray-100 flex items-center gap-1.5 text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          {canEdit ? 'Work each certificate: download, apply the discount, record the policy, and advance the status.' : 'Read-only view.'}
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm">
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or cert ID"
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px]" />
        </div>

        {error && <p className="text-sm text-red-300 mb-3">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Insured</th>
                <th className="text-left px-4 py-3">Certificate</th>
                <th className="text-left px-4 py-3">Issued</th>
                <th className="text-left px-4 py-3">Age</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assignee</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No items.</td></tr>
              )}
              {filtered.map((r) => (
                <QueueRow
                  key={r.id} row={r} staff={staff} canEdit={canEdit}
                  expanded={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  onChanged={refetch}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function QueueRow({ row, staff, canEdit, expanded, onToggle, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(row.notes || '');
  const [policyRef, setPolicyRef] = useState(row.policy_ref || '');
  const [err, setErr] = useState(null);

  useEffect(() => { setNotes(row.notes || ''); setPolicyRef(row.policy_ref || ''); }, [row.notes, row.policy_ref]);

  const mutate = async (fields) => {
    setBusy(true); setErr(null);
    try { await updateQueueItem(row.id, fields); await onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true); setErr(null);
    try { const url = await getStaffCertUrl(row.certificate_id); if (url) window.open(url, '_blank', 'noopener'); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <tr className="border-t border-gray-800 hover:bg-gray-900/40">
        <td className="px-4 py-3 font-medium">{row.insured_name || '—'}</td>
        <td className="px-4 py-3 font-mono text-xs text-gray-300">{row.certificate_uid}</td>
        <td className="px-4 py-3 text-gray-300">{fmtDate(row.issued_at)}</td>
        <td className="px-4 py-3 text-gray-400">{row.age_days}d</td>
        <td className="px-4 py-3">
          {canEdit ? (
            <select value={row.status} disabled={busy} onChange={(e) => mutate({ status: e.target.value })}
              className={`text-xs rounded-full border px-2.5 py-1 bg-transparent ${STATUS_STYLES[row.status] || ''}`}>
              {STATUSES.map((s) => <option key={s} value={s} className="bg-gray-900 text-gray-100">{s.replace('_', ' ')}</option>)}
            </select>
          ) : (
            <span className={`text-xs rounded-full border px-2.5 py-1 ${STATUS_STYLES[row.status] || ''}`}>{row.status.replace('_', ' ')}</span>
          )}
        </td>
        <td className="px-4 py-3">
          {canEdit ? (
            <select value={row.assigned_to || ''} disabled={busy}
              onChange={(e) => mutate(e.target.value ? { assignedTo: e.target.value } : { clearAssignee: true })}
              className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 max-w-[150px]">
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <span className="text-xs text-gray-300">{row.assignee_name || '—'}</span>
          )}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <button onClick={download} disabled={busy} title="Download certificate" aria-label="Download certificate"
            className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-success-300 mr-3">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onToggle} aria-label={expanded ? 'Collapse details' : 'Expand details'} aria-expanded={expanded}
            className="inline-flex items-center text-gray-400 hover:text-gray-100">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-800/60 bg-gray-900/30">
          <td colSpan={7} className="px-4 py-4">
            {err && <p className="text-xs text-red-300 mb-2">{err}</p>}
            {canEdit ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">Policy reference</span>
                  <input value={policyRef} onChange={(e) => setPolicyRef(e.target.value)} placeholder="Policy # the discount was applied to"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">Notes</span>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
                </label>
                <div className="md:col-span-2">
                  <button onClick={() => mutate({ policyRef, notes })} disabled={busy}
                    className="rounded-full px-5 py-2 text-sm font-semibold bg-success-400 hover:bg-success-300 disabled:opacity-50 text-gray-950">
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-300 space-y-1">
                <p><span className="text-gray-500">Policy reference:</span> {row.policy_ref || '—'}</p>
                <p><span className="text-gray-500">Notes:</span> {row.notes || '—'}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
