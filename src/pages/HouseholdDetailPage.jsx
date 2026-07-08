// src/pages/HouseholdDetailPage.jsx
// The household view — every policy-bearing record for one customer, across
// new business, renewals, pending cancels, and terminations. Reached by
// clicking a result in Customer Search.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useActiveEmployees } from '../hooks/useEmployees';
import { TASK_TYPE_MAP, productShort } from '../hooks/useServiceTasks';
import { EventDetailModal, RenewalDetailModal } from './components/retention/RetentionCancels';
import ServiceTaskDetailModal from '../components/ServiceTaskDetailModal';

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'HO', renters: 'Renters', condo: 'Condo', landlord: 'Landlord',
  pup: 'Umbrella', boat: 'Boat', specialty_auto: 'Specialty Auto', life: 'Life',
  manufactured: 'Manufactured',
};
const SOURCE_CONFIG = {
  new_business: { label: 'New Business', color: '#10B981' },
  renewal:      { label: 'Renewal',      color: '#3B82F6' },
  cancel:       { label: 'Cancel',       color: '#EF4444' },
  termination:  { label: 'Termination',  color: '#94A3B8' },
};
const TOUCH_CONFIG = {
  cancel:     { label: 'Cancel save',  color: '#EF4444' },
  renewal:    { label: 'Renewal call', color: '#3B82F6' },
  cross_sell: { label: 'Cross-sell',   color: '#10B981' },
  lead:       { label: 'Lead dial',    color: '#F59E0B' },
  service:    { label: 'Service task', color: '#22D3EE' },
};
const fmt$ = n => (n == null || isNaN(n)) ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const label = p => (PRODUCT_LABELS[p] || p || '—').toUpperCase();
const fmtDate = d => {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  return isNaN(date.getTime()) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Small inline icon button to copy a value (e.g. an email) to the clipboard.
function CopyButton({ text, label = 'email' }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / non-secure contexts where the
      // Clipboard API is unavailable.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={copied ? 'Copied!' : `Copy ${label}`}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, padding: 0, borderRadius: 6, cursor: 'pointer',
        border: '1px solid transparent',
        background: hovered ? 'var(--qs-hover, rgba(255,255,255,0.06))' : 'transparent',
        color: copied ? '#34D399' : (hovered ? 'var(--qs-bright)' : 'var(--qs-dim)'),
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}

export default function HouseholdDetailPage() {
  const { householdId } = useParams();
  const { currentAgencyId } = useAuth();
  const backTo = useLocation().pathname.startsWith('/my') ? '/my/customers' : '/agency/customers';
  const { data: employee } = useCurrentEmployee();
  const { data: employees = [] } = useActiveEmployees(currentAgencyId);
  const queryClient = useQueryClient();
  // A renewal/cancel record opened in its work-surface modal, in place.
  const [openCase, setOpenCase] = useState(null); // { kind: 'renewal'|'cancel', data }
  const [openTaskId, setOpenTaskId] = useState(null); // open a service request in its detail modal

  async function openRecord(r) {
    if (r.source !== 'renewal' && r.source !== 'cancel') return;
    const table = r.source === 'renewal' ? 'renewal_cases' : 'pending_cases';
    const { data } = await supabase.from(table).select('*').eq('id', r.id).maybeSingle();
    if (data) setOpenCase({ kind: r.source, data });
  }
  async function updateCase(table, id, updates) {
    await supabase.from(table).update(updates).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['household_records', householdId] });
    queryClient.invalidateQueries({ queryKey: ['household_service_tasks', householdId] });
  }

  const { data: household } = useQuery({
    queryKey: ['household_header', householdId],
    enabled: !!householdId && !!currentAgencyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_directory')
        .select('*')
        .eq('agency_id', currentAgencyId)
        .eq('household_id', householdId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['household_records', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('household_records', { p_household: householdId });
      if (error) throw error;
      return data || [];
    },
  });

  // Unified touch history — every logged human contact across all four work
  // surfaces (cancel saves, renewal calls, cross-sell pitches, lead dials).
  const { data: touches = [] } = useQuery({
    queryKey: ['household_touches', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('household_touches', { p_household: householdId });
      if (error) throw error;
      return data || [];
    },
  });
  const lastTouch = touches[0] || null;

  // Open admin/service work for this customer (billing changes, ID cards, a
  // coverage question…) so a rep sees it the moment they pull the household up.
  const { data: serviceTasks = [] } = useQuery({
    queryKey: ['household_service_tasks', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('household_service_tasks', { p_household: householdId });
      if (error) throw error;
      return data || [];
    },
  });
  const openTasks = serviceTasks.filter(t => !t.resolved);
  const resolvedTasks = serviceTasks.filter(t => t.resolved);
  const [showResolved, setShowResolved] = useState(false);

  // History at a glance: how many times this household renewed / was saved.
  const renewedCount = records.filter(r => r.source === 'renewal' && (r.status === 'confirmed' || r.status === 'auto_resolved')).length;
  const cancelSavedCount = records.filter(r => r.source === 'cancel' && r.status === 'saved').length;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '8px 0' }}>
      <Link to={backTo} style={{ fontSize: 13, color: '#3B82F6', textDecoration: 'none' }}>
        ← Customer Search
      </Link>

      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)' }}>
          {household?.display_name || 'Household'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {household?.phone && <span>{household.phone}</span>}
          {household?.email && (
            <>
              {household?.phone && <span style={{ color: 'var(--qs-muted)' }}>·</span>}
              <span>{household.email}</span>
              <CopyButton text={household.email} label="email" />
            </>
          )}
          {household?.zip && (
            <>
              {(household?.phone || household?.email) && <span style={{ color: 'var(--qs-muted)' }}>·</span>}
              <span>{household.zip}</span>
            </>
          )}
          {!household?.phone && !household?.email && !household?.zip && 'No contact on file'}
        </div>
        <div style={{ fontSize: 12, marginTop: 4, color: lastTouch ? 'var(--qs-dim)' : 'var(--qs-muted)' }}>
          {lastTouch
            ? <>Last touched {new Date(lastTouch.touched_at).toLocaleDateString()}{lastTouch.employee_name ? ` by ${lastTouch.employee_name}` : ''} · {lastTouch.source.replace('_', '-')}{lastTouch.result ? ` (${lastTouch.result.replace(/_/g, ' ')})` : ''}{lastTouch.direction === 'inbound' ? ' · customer called in' : ''}</>
            : 'Never touched — no logged contact on any queue.'}
        </div>
        {household && (
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}>
            <span>
              <span style={{ color: 'var(--qs-muted)' }}>Active: </span>
              {household.active_products?.length
                ? <span style={{ color: '#34D399', fontWeight: 600 }}>{household.active_products.map(label).join(', ')}</span>
                : <span style={{ color: 'var(--qs-muted)' }}>none</span>}
            </span>
            {household.lost_products?.length > 0 && (
              <span>
                <span style={{ color: 'var(--qs-muted)' }}>Lost: </span>
                <span style={{ color: '#F87171' }}>{household.lost_products.map(label).join(', ')}</span>
              </span>
            )}
          </div>
        )}
        {(renewedCount > 0 || cancelSavedCount > 0) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {renewedCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 11px', borderRadius: 999,
                background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.35)', color: '#34D399' }}>
                ✅ {renewedCount} renewed
              </span>
            )}
            {cancelSavedCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 11px', borderRadius: 999,
                background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.35)', color: '#34D399' }}>
                💚 {cancelSavedCount} cancel save{cancelSavedCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Open service requests — actionable admin work for this customer */}
      {serviceTasks.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
          }}>
            Service requests ({openTasks.length} open)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(showResolved ? serviceTasks : openTasks).map(t => {
              const cfg = TASK_TYPE_MAP[t.task_type] || { label: t.task_type, icon: '📌', color: '#94A3B8' };
              const prio = t.priority === 'urgent' ? { l: 'URGENT', c: '#FCA5A5', b: '#EF444433' }
                         : t.priority === 'high'   ? { l: 'HIGH',   c: '#FCD34D', b: '#F59E0B33' } : null;
              return (
                <div key={t.id} onClick={() => setOpenTaskId(t.id)} title="Open service request" style={{
                  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                  borderLeft: `3px solid ${t.resolved ? 'var(--qs-border)' : cfg.color}`, borderRadius: 8,
                  padding: '12px 16px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', cursor: 'pointer',
                  opacity: t.resolved ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontSize: 14 }}>{cfg.icon}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: `${cfg.color}1a`, border: `1px solid ${cfg.color}40`, color: cfg.color,
                    }}>{cfg.label}</span>
                    {productShort(t.product) && (
                      <span title="Line of business" style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                        background: '#22D3EE1a', border: '1px solid #22D3EE40', color: '#67E8F9',
                        letterSpacing: '0.05em', fontFamily: "'DM Mono', monospace",
                      }}>{productShort(t.product)}</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>{t.title}</span>
                    {t.requires_license && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#C4B5FD' }}>🔒</span>
                    )}
                    {prio && !t.resolved && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: prio.b, color: prio.c, letterSpacing: '0.05em' }}>{prio.l}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--qs-dim)', flexShrink: 0 }}>
                    <span>{t.resolved ? 'Resolved' : t.status.replace(/_/g, ' ')}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace" }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {resolvedTasks.length > 0 && (
            <button
              onClick={() => setShowResolved(s => !s)}
              style={{ marginTop: 8, background: 'none', border: 'none', color: '#3B82F6',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              {showResolved ? 'Hide resolved' : `+ ${resolvedTasks.length} resolved (last 90 days)`}
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div style={{ color: 'var(--qs-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Loading…</div>
      )}
      {!isLoading && records.length === 0 && (
        <div style={{ color: 'var(--qs-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          No records found for this household.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {records.map((r, i) => {
          const cfg = SOURCE_CONFIG[r.source] || { label: r.source, color: 'var(--qs-dim)' };
          const openable = r.source === 'renewal' || r.source === 'cancel';
          return (
            <div key={i} onClick={openable ? () => openRecord(r) : undefined} style={{
              background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
              borderLeft: `3px solid ${cfg.color}`, borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              cursor: openable ? 'pointer' : 'default',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: `${cfg.color}1a`, border: `1px solid ${cfg.color}40`, color: cfg.color,
                }}>{cfg.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)' }}>{label(r.product)}</span>
                <span style={{ fontSize: 12, color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace" }}>
                  {r.policy_no}
                </span>
                <span style={{ fontSize: 12, color: 'var(--qs-dim)' }}>{r.status}</span>
                {r.detail && (
                  <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>{r.detail}</span>
                )}
                {r.callback_at && (() => {
                  const overdue = new Date(r.callback_at) < new Date();
                  return (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                      background: overdue ? '#EF444422' : '#3B82F622', color: overdue ? '#FCA5A5' : '#60A5FA' }}>
                      📅 {overdue ? 'Callback due' : 'Call back'} {new Date(r.callback_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--qs-dim)', flexShrink: 0, alignItems: 'center' }}>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt$(r.premium)}</span>
                <span>{fmtDate(r.record_date)}</span>
                {openable && <span style={{ color: '#3B82F6' }}>Open →</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Touch history — every logged contact, any queue, newest first */}
      {touches.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
          }}>
            Touch history ({touches.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {touches.map((t, i) => {
              const cfg = TOUCH_CONFIG[t.source] || { label: t.source, color: 'var(--qs-dim)' };
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
                  borderRadius: 8, padding: '8px 14px', fontSize: 12,
                }}>
                  <span style={{ color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                    {new Date(t.touched_at).toLocaleDateString()}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                    background: `${cfg.color}1a`, border: `1px solid ${cfg.color}40`, color: cfg.color,
                  }}>{cfg.label}</span>
                  {t.product && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                      background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-dim)',
                    }}>
                      {label(t.product)}{t.policy_no ? ` · ${t.policy_no}` : ''}
                    </span>
                  )}
                  {/* Direction — who initiated the call. Only rendered when the
                      attempt recorded it (renewal/cancel calls since the
                      direction column landed); inbound is the standout. */}
                  {t.direction && (
                    <span title={t.direction === 'inbound' ? 'Customer called the agency' : 'Rep called the customer'}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                        background: t.direction === 'inbound' ? 'rgba(96,165,250,0.14)' : 'var(--qs-elevated)',
                        border: `1px solid ${t.direction === 'inbound' ? 'rgba(96,165,250,0.45)' : 'var(--qs-border)'}`,
                        color: t.direction === 'inbound' ? '#60A5FA' : 'var(--qs-dim)',
                      }}>
                      {t.direction === 'inbound' ? '↙ CALLED IN' : '↗ OUTBOUND'}
                    </span>
                  )}
                  <span style={{ color: 'var(--qs-text)' }}>
                    {(t.result || 'attempt').replace(/_/g, ' ')}
                    {t.method && t.method !== 'phone' ? ` · ${t.method}` : ''}
                  </span>
                  {t.employee_name && (
                    <span style={{ color: 'var(--qs-subtle)' }}>by {t.employee_name}</span>
                  )}
                  {/* Tactic tags — required on reached calls, so show them here:
                      a tagged call without a free-text note is not an empty one. */}
                  {(t.interventions || []).map(code => (
                    <span key={code} style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                      background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)',
                      color: '#A78BFA',
                    }}>🏷 {String(code).replace(/_/g, ' ')}</span>
                  ))}
                  {t.note && (
                    <span style={{ color: 'var(--qs-muted)', fontStyle: 'italic' }}>“{t.note}”</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {openCase?.kind === 'renewal' && createPortal(
        <RenewalDetailModal
          key={openCase.data.id}
          event={openCase.data}
          onClose={() => setOpenCase(null)}
          onUpdate={(id, updates) => updateCase('renewal_cases', id, updates)}
          agencyId={currentAgencyId}
          currentEmployeeId={employee?.id}
          producers={employees}
          canReassign={false}
          onOpenSibling={(row, kind) => setOpenCase({ kind, data: row })}
        />,
        document.body
      )}
      {openCase?.kind === 'cancel' && createPortal(
        <EventDetailModal
          key={openCase.data.id}
          event={openCase.data}
          onClose={() => setOpenCase(null)}
          onUpdate={(id, updates) => updateCase('pending_cases', id, updates)}
          agencyId={currentAgencyId}
          currentEmployeeId={employee?.id}
          producers={employees}
          canReassign={false}
          onOpenSibling={(row, kind) => setOpenCase({ kind, data: row })}
        />,
        document.body
      )}
      {openTaskId && (
        <ServiceTaskDetailModal
          taskId={openTaskId}
          agencyId={currentAgencyId}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['household_service_tasks', householdId] })}
        />
      )}
    </div>
  );
}
