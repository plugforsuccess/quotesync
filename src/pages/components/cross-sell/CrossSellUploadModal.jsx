// src/pages/components/cross-sell/CrossSellUploadModal.jsx
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { parseCrossSellReport } from '../../../lib/crossSellParser';
import { useQueryClient } from '@tanstack/react-query';

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'Homeowners', renters: 'Renters',
  condo: 'Condo', landlord: 'Landlord', pup: 'Umbrella/PUP',
  boat: 'Boat', specialty_auto: 'Specialty Auto', life: 'Life',
};

export default function CrossSellUploadModal({ agencyId, uploadedBy, onClose }) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState('idle');
  const [rows, setRows] = useState([]);
  const [matchSummary, setMatchSummary] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [filename, setFilename] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setStage('parsing');
    setErrorMsg('');

    try {
      const parsed = await parseCrossSellReport(file);
      if (parsed.length === 0) {
        setErrorMsg('No valid rows found in file.');
        setStage('error');
        return;
      }

      const matched = await runMatchEngine(parsed, agencyId);
      // Drop opportunities already live or won in the queue — only genuinely
      // new ones get committed, so monthly re-uploads don't pile up duplicates.
      const fresh = matched.filter(r => !r.duplicate);
      const skipped = matched.length - fresh.length;
      setRows(fresh);
      setMatchSummary({
        total:        fresh.length,
        renewal_only: fresh.filter(r => r.match_type === 'renewal_only').length,
        cancel_only:  fresh.filter(r => r.match_type === 'cancel_only').length,
        both:         fresh.filter(r => r.match_type === 'both').length,
        new_lead:     fresh.filter(r => r.match_type === 'new_lead').length,
        skipped,
      });
      if (fresh.length === 0) {
        setErrorMsg(skipped > 0
          ? `All ${skipped} rows are already in the cross-sell queue — nothing new to add.`
          : 'No valid rows found in file.');
        setStage('error');
        return;
      }
      setStage('preview');
    } catch (err) {
      setErrorMsg(err.message);
      setStage('error');
    }
  }

  async function runMatchEngine(parsedRows, agencyId) {
    const [{ data: renewals }, { data: cancels }, { data: existingXs }] = await Promise.all([
      supabase
        .from('renewal_cases')
        .select('id, customer_name, policy_no, product, renewal_date, status, multi_line, multi_policy')
        .eq('agency_id', agencyId)
        .not('status', 'in', '(confirmed,lost,auto_resolved)'),
      supabase
        .from('pending_cases')
        .select('id, customer_name, policy_no, product, cancel_effective_date, status, amount_due, stage')
        .eq('agency_id', agencyId)
        .not('status', 'in', '(saved,lost,auto_resolved,cancelled,requested_cancellation,rewritten)'),
      // Existing cross-sell cases still open or already won — used to skip
      // re-adding the same opportunity on each monthly upload. Declined/closed
      // cases are NOT in this set, so a previously-declined customer can be
      // re-pitched in a later cycle.
      supabase
        .from('cross_sell_cases')
        .select('policy_no, customer_name, recommended_product, status')
        .eq('agency_id', agencyId)
        .not('status', 'in', '(declined,closed)'),
    ]);

    // Skip keys: a customer already has a live or won pitch for this product.
    const xsKey = (policyNo, name, product) =>
      `${(policyNo || name || '').toString().toLowerCase().trim()}|${product || ''}`;
    const existingXsKeys = new Set(
      (existingXs || []).map(x => xsKey(x.policy_no, x.customer_name, x.recommended_product))
    );

    const renewalByPolicy = {};
    const renewalByName = {};
    (renewals || []).forEach(r => {
      if (r.policy_no) renewalByPolicy[r.policy_no] = r;
      const nameKey = r.customer_name?.toLowerCase().trim();
      if (nameKey) renewalByName[nameKey] = r;
    });

    const cancelByPolicy = {};
    const cancelByName = {};
    (cancels || []).forEach(p => {
      if (p.policy_no) cancelByPolicy[p.policy_no] = p;
      const nameKey = p.customer_name?.toLowerCase().trim();
      if (nameKey) cancelByName[nameKey] = p;
    });

    return parsedRows.map(row => {
      const nameKey = row.customer_name?.toLowerCase().trim() || null;

      const renewalMatch = (row.policy_no && renewalByPolicy[row.policy_no])
        || (nameKey && renewalByName[nameKey])
        || null;

      const cancelMatch = (row.policy_no && cancelByPolicy[row.policy_no])
        || (nameKey && cancelByName[nameKey])
        || null;

      let match_type = 'new_lead';
      let status = 'new';

      if (renewalMatch && cancelMatch) {
        match_type = 'both';
        status = 'hold';
      } else if (renewalMatch) {
        match_type = 'renewal_only';
        status = 'new';
      } else if (cancelMatch) {
        match_type = 'cancel_only';
        status = 'hold';
      }

      const duplicate = existingXsKeys.has(
        xsKey(row.policy_no, row.customer_name, row.recommended_product)
      );

      return {
        ...row,
        renewal_case_id: renewalMatch?.id || null,
        pending_case_id: cancelMatch?.id  || null,
        renewal_case:    renewalMatch,
        cancel_case:     cancelMatch,
        match_type,
        status,
        duplicate,
      };
    });
  }

  async function handleCommit() {
    setStage('committing');

    const { data: batch, error: batchError } = await supabase
      .from('cross_sell_uploads')
      .insert({
        agency_id:            agencyId,
        uploaded_by:          uploadedBy,
        filename,
        rows_parsed:          rows.length,
        rows_matched_renewal: matchSummary.renewal_only + matchSummary.both,
        rows_matched_cancel:  matchSummary.cancel_only + matchSummary.both,
        rows_new_leads:       matchSummary.new_lead,
        committed:            true,
      })
      .select('id')
      .single();

    if (batchError) { setErrorMsg(batchError.message); setStage('error'); return; }

    const batchId = batch.id;

    const csCases = rows.map(r => ({
      agency_id:           agencyId,
      upload_batch_id:     batchId,
      customer_name:       r.customer_name,
      policy_no:           r.policy_no,
      current_product:     r.current_product,
      recommended_product: r.recommended_product,
      opportunity_tier:    r.opportunity_tier,
      allstate_score:      r.allstate_score,
      renewal_case_id:     r.renewal_case_id,
      pending_case_id:     r.pending_case_id,
      match_type:          r.match_type,
      status:              r.status,
    }));

    const { data: insertedCases, error: casesError } = await supabase
      .from('cross_sell_cases')
      .insert(csCases)
      .select('id, renewal_case_id, pending_case_id, recommended_product, match_type');

    if (casesError) { setErrorMsg(casesError.message); setStage('error'); return; }

    const renewalUpdates = insertedCases.filter(c => c.renewal_case_id);
    for (const c of renewalUpdates) {
      await supabase
        .from('renewal_cases')
        .update({
          cross_sell_opportunity: true,
          cross_sell_product:     c.recommended_product,
          cross_sell_case_id:     c.id,
        })
        .eq('id', c.renewal_case_id);
    }

    const cancelUpdates = insertedCases.filter(c => c.pending_case_id);
    for (const c of cancelUpdates) {
      await supabase
        .from('pending_cases')
        .update({
          cross_sell_opportunity: true,
          cross_sell_product:     c.recommended_product,
          cross_sell_case_id:     c.id,
        })
        .eq('id', c.pending_case_id);
    }

    const newLeadRows = rows.filter(r => r.match_type === 'new_lead');
    if (newLeadRows.length > 0) {
      const leadInserts = newLeadRows.map(r => ({
        agency_id:      agencyId,
        first_name:     r.customer_name.split(' ')[0] || '',
        last_name:      r.customer_name.split(' ').slice(1).join(' ') || '',
        source:         'cross_sell_audit',
        product_intent: r.recommended_product,
        status:         'new',
      }));

      const { data: createdLeads } = await supabase
        .from('leads')
        .insert(leadInserts)
        .select('id');

      if (createdLeads) {
        const newLeadCases = insertedCases.filter(c => c.match_type === 'new_lead');
        for (let i = 0; i < newLeadCases.length; i++) {
          if (createdLeads[i]) {
            await supabase
              .from('cross_sell_cases')
              .update({ lead_id: createdLeads[i].id })
              .eq('id', newLeadCases[i].id);
          }
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ['cross_sell_cases', agencyId] });
    queryClient.invalidateQueries({ queryKey: ['cross_sell_uploads', agencyId] });
    queryClient.invalidateQueries({ queryKey: ['renewal_cases', agencyId] });
    queryClient.invalidateQueries({ queryKey: ['pending_cases', agencyId] });

    setStage('done');
  }

  const MATCH_TYPE_CONFIG = {
    renewal_only: { label: 'Renewal match',    color: '#3B82F6', note: 'Pitch during renewal call' },
    cancel_only:  { label: 'Cancel match',     color: '#F59E0B', note: 'On hold — resolve cancel first' },
    both:         { label: 'Renewal + Cancel', color: '#EF4444', note: 'On hold — cancel takes priority' },
    new_lead:     { label: 'New outbound lead',color: '#10B981', note: 'Will be created in Lead Manager' },
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}
    onClick={e => { if (e.target === e.currentTarget && stage !== 'committing') onClose(); }}
    >
      <div style={{
        background: 'var(--qs-card)',
        border: '1px solid var(--qs-border)',
        borderRadius: 14,
        width: '100%',
        maxWidth: stage === 'preview' ? 760 : 480,
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--qs-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)' }}>
              Cross-Sell Audit Upload
            </div>
            <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 2 }}>
              Allstate cross-sell audit report (.xlsx)
            </div>
          </div>
          {stage !== 'committing' && (
            <button onClick={onClose} style={{
              background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
              color: 'var(--qs-dim)', borderRadius: 8, width: 32, height: 32,
              cursor: 'pointer', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          )}
        </div>

        <div style={{ padding: '20px 24px' }}>

          {(stage === 'idle' || stage === 'error') && (
            <div>
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '40px 24px',
                border: '2px dashed var(--qs-border)',
                borderRadius: 10, cursor: 'pointer', gap: 8,
                background: 'var(--qs-elevated)',
              }}>
                <div style={{ fontSize: 32 }}>📊</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
                  Select Cross-Sell Audit Report
                </div>
                <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>
                  Excel (.xlsx) · from Allstate Agency Portal
                </div>
                <input type="file" accept=".xlsx,.xls"
                  onChange={handleFile} style={{ display: 'none' }} />
              </label>
              {errorMsg && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 8,
                  background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)',
                  fontSize: 13, color: 'var(--qs-danger)',
                }}>
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {stage === 'parsing' && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--qs-dim)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 14 }}>Parsing report and matching against your queue…</div>
            </div>
          )}

          {stage === 'preview' && matchSummary && (
            <div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
                gap: 8, marginBottom: 20,
              }}>
                {Object.entries(MATCH_TYPE_CONFIG).map(([key, cfg]) => (
                  <div key={key} style={{
                    background: 'var(--qs-elevated)',
                    border: `1px solid var(--qs-border)`,
                    borderTop: `3px solid ${cfg.color}`,
                    borderRadius: 8, padding: '10px 12px',
                  }}>
                    <div style={{
                      fontSize: 22, fontWeight: 800, color: cfg.color,
                      fontFamily: "'DM Mono', monospace",
                    }}>
                      {matchSummary[key]}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-dim)', marginTop: 2 }}>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--qs-muted)', marginTop: 3 }}>
                      {cfg.note}
                    </div>
                  </div>
                ))}
              </div>

              {matchSummary.skipped > 0 && (
                <div style={{
                  fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 16,
                  background: 'var(--qs-elevated)', borderRadius: 6, padding: '8px 12px',
                }}>
                  {matchSummary.skipped} already in the queue (open or won) — skipped, not re-added.
                </div>
              )}

              <div style={{
                border: '1px solid var(--qs-border)', borderRadius: 8,
                overflow: 'hidden', marginBottom: 16,
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px 120px',
                  padding: '8px 12px',
                  background: 'var(--qs-elevated)',
                  borderBottom: '1px solid var(--qs-border)',
                  fontSize: 11, fontWeight: 700,
                  color: 'var(--qs-subtle)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  <div>Customer</div>
                  <div>Has</div>
                  <div>Pitch</div>
                  <div>Routing</div>
                </div>
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {rows.map((row, i) => {
                    const cfg = MATCH_TYPE_CONFIG[row.match_type];
                    return (
                      <div key={i} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 80px 80px 120px',
                        padding: '9px 12px',
                        borderBottom: '1px solid var(--qs-border)',
                        fontSize: 12, alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--qs-bright)' }}>
                            {row.customer_name}
                          </div>
                          {row.policy_no && (
                            <div style={{ fontSize: 10, color: 'var(--qs-muted)' }}>
                              {row.policy_no}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--qs-dim)' }}>
                          {PRODUCT_LABELS[row.current_product] || row.current_product || '—'}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#3B82F6' }}>
                          {PRODUCT_LABELS[row.recommended_product] || row.recommended_product}
                        </div>
                        <div>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: cfg.color,
                            background: `${cfg.color}18`,
                            border: `1px solid ${cfg.color}33`,
                            borderRadius: 4, padding: '2px 7px',
                          }}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleCommit}
                style={{
                  width: '100%', padding: 13, borderRadius: 10,
                  border: 'none', background: '#10B981',
                  color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Commit {rows.length} rows
                {matchSummary.new_lead > 0 && ` · create ${matchSummary.new_lead} leads`}
              </button>
            </div>
          )}

          {stage === 'committing' && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--qs-dim)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💾</div>
              <div style={{ fontSize: 14 }}>Saving cross-sell cases and creating leads…</div>
            </div>
          )}

          {stage === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>
                Upload complete
              </div>
              <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginBottom: 20, lineHeight: 1.6 }}>
                {matchSummary.renewal_only + matchSummary.both} renewal cases flagged
                · {matchSummary.new_lead} leads created in Lead Manager
              </div>
              <button onClick={onClose} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: 'var(--qs-elevated)', color: 'var(--qs-dim)',
                fontSize: 14, cursor: 'pointer',
              }}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
