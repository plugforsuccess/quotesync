// src/pages/components/retention/BookMetricsPanel.jsx
// Ingests the Allstate book-health reports (Premium & Profitability, Policy
// Audit) and renders the principal retention scoreboard — the answer to
// "what % of the book are we retaining, and where is it leaking?"
//
// This is the first slice of the ingestion engine: upload → snapshot tables →
// derived scoreboard. Other reports (Portfolio Growth, Loss, Commission)
// follow the same pattern.

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useBookSnapshots } from '../../../hooks/useBookMetrics';
import { useSopGoLiveDate } from '../../../hooks/useSopGoLiveDate';
import { useChartTheme } from '../../../lib/chartTheme';
import { parsePremiumProfitability, parsePolicyAudit } from '../../../lib/bookMetricsParser';

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(1)}%`;
}
function fmtMonth(d) {
  if (!d) return '—';
  const [y, m] = d.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

const REPORTS = {
  premium_profitability: {
    label: 'Premium & Profitability',
    sheet: 'Premium And Profitability',
    parser: parsePremiumProfitability,
    table: 'book_snapshots',
    conflict: 'agency_id,production_month,product',
  },
  policy_audit: {
    label: 'Policy Audit',
    sheet: null, // first sheet
    parser: parsePolicyAudit,
    table: 'policy_audit_snapshots',
    conflict: 'agency_id,production_month,policy_no',
  },
};

function UploadZone({ agencyId, currentUserId, reportType }) {
  const cfg = REPORTS[reportType];
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function handleFile(file) {
    if (!file || !agencyId) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const ws = cfg.sheet ? (wb.Sheets[cfg.sheet] || wb.Sheets[wb.SheetNames[0]]) : wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const { productionMonth, records } = cfg.parser(rows);
      if (!productionMonth) throw new Error('Could not read the production month from the report header.');
      if (records.length === 0) throw new Error('No data rows found in the report.');

      // Audit row for the upload.
      const { data: upload, error: upErr } = await supabase
        .from('book_metric_uploads')
        .insert({
          agency_id: agencyId,
          report_type: reportType,
          production_month: productionMonth,
          uploaded_by: currentUserId,
          filename: file.name,
          rows_added: records.length,
          committed: false,
        })
        .select('id')
        .single();
      if (upErr) throw new Error(upErr.message);

      // Upsert the snapshot rows (chunked — Policy Audit can be hundreds).
      const withMeta = records.map((r) => ({
        ...r,
        agency_id: agencyId,
        upload_batch_id: upload.id,
        raw: r,
      }));
      const CHUNK = 500;
      for (let i = 0; i < withMeta.length; i += CHUNK) {
        const { error: insErr } = await supabase
          .from(cfg.table)
          .upsert(withMeta.slice(i, i + CHUNK), { onConflict: cfg.conflict });
        if (insErr) throw new Error(insErr.message);
      }

      await supabase.from('book_metric_uploads').update({ committed: true }).eq('id', upload.id);
      queryClient.invalidateQueries({ queryKey: ['book_snapshots', agencyId] });

      // Policy Audit is the observed in-force census — reconcile renewal
      // outcomes against it, replacing the inferred easy_pay guesses.
      let reconciledMsg = '';
      if (reportType === 'policy_audit') {
        const { data: n, error: rErr } = await supabase.rpc('reconcile_renewal_outcomes', { p_agency_id: agencyId });
        if (!rErr && n > 0) reconciledMsg = ` · ${n} renewal outcome${n === 1 ? '' : 's'} reconciled from observed data`;
        queryClient.invalidateQueries({ queryKey: ['elasticity_renewals', agencyId] });
        queryClient.invalidateQueries({ queryKey: ['renewal_cases', agencyId] });
      }
      setMsg(`${records.length} rows imported for ${fmtMonth(productionMonth)}.${reconciledMsg}`);
    } catch (e) {
      console.error('[book metric upload]', e.message);
      setErr(e.message || 'Upload failed.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 240 }}>
      <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 8 }}>{cfg.label}</div>
      <div className="upload-zone" style={{ padding: 24 }} onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])} />
        <div style={{ fontSize: 24, marginBottom: 6 }}>📖</div>
        <div style={{ fontSize: 13, color: 'var(--qs-dim)' }}>{busy ? 'Importing…' : 'Drop or click to upload'}</div>
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--qs-success, #10B981)', marginTop: 8 }}>{msg}</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--qs-danger, #EF4444)', marginTop: 8 }}>{err}</div>}
    </div>
  );
}

export default function BookMetricsPanel({ agencyId, currentUserId }) {
  const { data, isLoading } = useBookSnapshots(agencyId);
  const { data: goLive } = useSopGoLiveDate(agencyId);
  const ct = useChartTheme();
  const totals = data?.totals;
  const products = data?.products || [];
  const trend = data?.trend || [];

  const deltaColor = (v) => (v == null ? 'var(--qs-dim)' : v < 0 ? '#EF4444' : '#10B981');

  return (
    <div>
      {/* Cadence guidance */}
      <div style={{
        fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 12,
        background: 'var(--qs-elevated)', borderRadius: 8, padding: '10px 14px',
      }}>
        Upload <strong>monthly</strong>. The <strong>Policy Audit</strong> posts early —
        last month's audit is ready by ~the 5th. <strong>Premium &amp; Profitability</strong>
        lags ~a month (posts mid-month, so its scoreboard reflects a book about a month
        behind). They measure the outcome of the work the operating reports drive; order
        between the two below doesn't matter — they write to independent tables.
      </div>

      {/* Upload */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <UploadZone agencyId={agencyId} currentUserId={currentUserId} reportType="premium_profitability" />
        <UploadZone agencyId={agencyId} currentUserId={currentUserId} reportType="policy_audit" />
      </div>

      {/* Scoreboard */}
      {isLoading ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading book metrics…</div>
      ) : !totals ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>
          No book metrics yet. Upload the Premium &amp; Profitability report to see your book-retention scoreboard.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 12 }}>
            Book of business as of <strong>{fmtMonth(data.latestMonth)}</strong>
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}>Policies in Force</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.pifCurrent.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: deltaColor(totals.pifVariance), marginTop: 2 }}>
                {totals.pifVariance >= 0 ? '+' : ''}{totals.pifVariance} vs prior year
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}>Net Retention (blended)</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtPct(totals.blendedNetRetention)}</div>
              <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>counts rewrites/transfers as kept</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}>Policy Retention (blended)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-dim)' }}>{fmtPct(totals.blendedRetention)}</div>
              <div style={{ fontSize: 11, color: deltaColor(totals.retentionPointVariance), marginTop: 2 }}>
                {totals.retentionPointVariance >= 0 ? '+' : ''}{totals.retentionPointVariance?.toFixed(1)} pts vs prior year
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}>Prior-Year Retention</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-dim)' }}>{fmtPct(totals.blendedRetentionPy)}</div>
              <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>baseline</div>
            </div>
          </div>

          {/* Book retention trend — the "is it improving?" line */}
          {trend.length >= 2 ? (
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 10 }}>
                Book retention trend{goLive ? ' · SOP launch marked' : ''}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.structural.grid} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11, fill: ct.structural.axisTick }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: ct.structural.axisTick }} tickFormatter={(v) => `${Math.round(v)}%`} />
                  <Tooltip contentStyle={ct.tooltipStyle} labelStyle={ct.tooltipLabelStyle} labelFormatter={fmtMonth}
                    formatter={(v, n) => [v == null ? '—' : `${Number(v).toFixed(1)}%`, n]} />
                  <Line type="monotone" dataKey="retentionPy" name="Prior year" stroke={ct.structural.axisTick} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="retention" name="Policy retention" stroke={ct.data.blue} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="netRetention" name="Net retention" stroke={ct.data.green} strokeWidth={2} dot={{ r: 3 }} />
                  {goLive && trend.some((t) => t.month === goLive) && (
                    <ReferenceLine x={goLive} stroke={ct.data.green} strokeDasharray="3 3"
                      label={{ value: 'SOP', fontSize: 10, fill: ct.data.green, position: 'top' }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 24, fontSize: 12, color: 'var(--qs-subtle)' }}>
              Book-retention trend builds as you upload Premium &amp; Profitability monthly — needs at least 2 months.
            </div>
          )}

          {/* Per-product leak table */}
          <div className="scroll-hint-container" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>PIF</th>
                  <th style={{ textAlign: 'right' }}>Δ PY</th>
                  <th style={{ textAlign: 'right' }}>Net Ret</th>
                  <th style={{ textAlign: 'right' }}>Policy Ret</th>
                  <th style={{ textAlign: 'right' }}>Prior Yr</th>
                  <th style={{ textAlign: 'right' }}>Δ pts</th>
                  <th style={{ textAlign: 'right' }}>New (0–2 yr)</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} style={{ opacity: p.is_rollup ? 0.55 : 1 }}>
                    <td>{p.product}{p.is_rollup ? ' (rollup)' : ''}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{p.pif_current ?? '—'}</td>
                    <td style={{ textAlign: 'right', color: deltaColor(p.pif_variance) }}>
                      {p.pif_variance == null ? '—' : `${p.pif_variance >= 0 ? '+' : ''}${p.pif_variance}`}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtPct(p.net_retention_pct)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--qs-dim)' }}>{fmtPct(p.policy_retention_pct)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--qs-dim)' }}>{fmtPct(p.retention_py_pct)}</td>
                    <td style={{ textAlign: 'right', color: deltaColor(p.retention_point_variance) }}>
                      {p.retention_point_variance == null ? '—' : `${p.retention_point_variance >= 0 ? '+' : ''}${Number(p.retention_point_variance).toFixed(1)}`}
                    </td>
                    <td style={{ textAlign: 'right', color: (p.tenure_ret_0_2 != null && p.tenure_ret_0_2 < 75) ? '#F59E0B' : 'var(--qs-text)' }}>
                      {fmtPct(p.tenure_ret_0_2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
