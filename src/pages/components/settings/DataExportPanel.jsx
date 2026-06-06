// src/pages/components/settings/DataExportPanel.jsx
// Self-serve data export — the agency can download its own retention data as
// CSV. Directly addresses the "is the data trapped?" lock-in question: it's the
// agency's data, portable on demand. RLS scopes every query to the agency.

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { downloadCSV } from '../../../lib/csvExport';

// Each dataset is RLS-scoped, so a plain agency_id filter returns only this
// agency's rows. Ordered roughly by how proprietary/valuable the data is.
const DATASETS = [
  { key: 'renewal_cases',           label: 'Renewals',                 desc: 'Renewal cases with rate change, status, outcome' },
  { key: 'pending_cases',           label: 'Pending Cancellations',    desc: 'At-risk cancel cases with premium at risk' },
  { key: 'lapse_events',            label: 'Terminations',             desc: 'Lost policies with categorized reason' },
  { key: 'renewal_attempts',        label: 'Renewal Call Log + Tactics', desc: 'Every renewal attempt incl. the save tactic captured' },
  { key: 'pending_cancel_attempts', label: 'Cancel Call Log + Tactics',  desc: 'Every cancel attempt incl. the save tactic captured' },
  { key: 'lead_attempts',           label: 'Lead Touches',             desc: 'New-business lead contact log' },
  { key: 'leads',                   label: 'Leads',                    desc: 'New-business leads' },
  { key: 'book_snapshots',          label: 'Book Snapshots',           desc: 'Monthly retention/PIF by product' },
  { key: 'policy_audit_snapshots',  label: 'Policy Audit Snapshots',   desc: 'Per-policy in-force census by month' },
];

export default function DataExportPanel({ agencyId }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  async function exportDataset(ds) {
    if (!agencyId) return;
    setBusy(ds.key); setErr('');
    try {
      // Page through in case a dataset exceeds the default row cap.
      const all = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from(ds.key)
          .select('*')
          .eq('agency_id', agencyId)
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      if (all.length === 0) { setErr(`No rows in ${ds.label} to export.`); return; }
      const today = new Date().toISOString().slice(0, 10);
      downloadCSV(`quotesync-${ds.key}-${today}.csv`, all);
    } catch (e) {
      setErr(e.message || 'Export failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card" style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 12, padding: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright, #fff)', margin: 0 }}>Export your data</h3>
      <p style={{ fontSize: 12, color: 'var(--qs-dim)', margin: '6px 0 16px' }}>
        Download your agency's data as CSV — it's yours, portable any time. Includes the proprietary
        retention layer: call logs with the save tactic, outcomes, and the monthly book snapshots.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {DATASETS.map((ds) => (
          <button
            key={ds.key}
            onClick={() => exportDataset(ds)}
            disabled={busy === ds.key}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)',
              opacity: busy === ds.key ? 0.6 : 1,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{ds.label}</span>
              <span style={{ color: 'var(--qs-info, #3B82F6)', fontSize: 12 }}>{busy === ds.key ? '…' : '↓ CSV'}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 3 }}>{ds.desc}</div>
          </button>
        ))}
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--qs-danger, #EF4444)', marginTop: 12 }}>{err}</div>}
    </div>
  );
}
