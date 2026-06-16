// src/pages/RetentionPage.jsx
// Retention Hub — unified page combining Book Health + Renewals functionality.

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useCurrentAgency } from "../hooks/useAgencyLeads";

// Extracted tab components
import UnifiedAtRiskTab from "./components/retention/RetentionCancels";
import { EventDetailModal, RenewalDetailModal } from "./components/retention/RetentionCancels";
import EscalationsInbox from "./components/retention/EscalationsInbox";
import RetentionImport from "./components/retention/RetentionImport";
import { ResolvedTab, TrendsTab, AttritionTab, NetGrowthTab } from "./components/retention/RetentionAnalytics";
import TerminationReasonTab from "./components/retention/TerminationReasonTab";
import { useFireRenewalQueue, useFireCancelQueue } from '../hooks/useAiQueue';
import { RefreshCw } from 'lucide-react';
import RetentionRenewals      from './components/retention/RetentionRenewals';
import RetentionAIPerformance from './components/retention/RetentionAIPerformance';
import { useUploadReminders } from '../hooks/useUploadReminders';
import UploadReminderBanner from './components/retention/UploadReminderBanner';
import WorkloadDistribution from './components/retention/WorkloadDistribution';
import BookMetricsPanel from './components/retention/BookMetricsPanel';
import SaveablePremiumTargeting from './components/retention/SaveablePremiumTargeting';
import ElasticityCurveChart from './components/retention/ElasticityCurveChart';
import NotesSearch from './components/retention/NotesSearch';
import { useAuth } from '../contexts/AuthContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--qs-elevated); } ::-webkit-scrollbar-thumb { background: var(--qs-muted); border-radius: 3px; } input, select { background: var(--qs-elevated) !important; color: var(--qs-text) !important; border: 1px solid var(--qs-border) !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: var(--qs-info) !important; } .card { background: var(--qs-card); border: 1px solid var(--qs-border); border-radius: 12px; padding: 20px; } .btn-primary { background: var(--qs-info); color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; } .btn-ghost { background: transparent; color: var(--qs-dim); border: 1px solid var(--qs-border); border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: var(--qs-elevated); color: var(--qs-text); border-color: var(--qs-info); } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: var(--qs-subtle); transition: all 0.15s; } .tab.active { background: var(--qs-elevated); color: var(--qs-text); } .upload-zone { border: 2px dashed var(--qs-border); border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: var(--qs-info); } label { font-size: 12px; color: var(--qs-subtle); font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--qs-subtle); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--qs-border); } td { padding: 9px 12px; border-bottom: 1px solid var(--qs-elevated); color: var(--qs-text); } .urgency-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; font-family: 'DM Mono', monospace; } .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; } .triage-row:hover td { background: var(--qs-elevated); cursor: pointer; } .scroll-hint-container { position: relative; } .scroll-hint-container::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 24px; background: linear-gradient(to right, transparent, var(--qs-dark)); pointer-events: none; opacity: 1; transition: opacity 0.2s; } @media (min-width: 840px) { .scroll-hint-container::after { opacity: 0; } }`;

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, urgent, urgentCount, onUrgentClick }) {
  return (
    <div className="card" style={{ position: "relative" }}>
      <div style={{ fontSize: 12, color: "var(--qs-subtle)", fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--qs-text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--qs-dim)", marginTop: 2 }}>{sub}</div>}
      {urgent && urgentCount > 0 && (
        <div
          onClick={onUrgentClick}
          style={{
            position: 'absolute', top: 8, right: 10,
            background: '#EF4444', color: '#fff',
            borderRadius: 10, padding: '1px 7px',
            fontSize: 10, fontWeight: 700,
            cursor: onUrgentClick ? 'pointer' : 'default',
            userSelect: 'none',
          }}
        >
          {urgentCount} urgent
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function RetentionPage() {
  const { data: currentAgency } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;
  const { currentAgencyRole } = useAuth();
  // Bulk case reassignment is a management action — principals/managers only.
  const canDistribute = currentAgencyRole === 'principal' || currentAgencyRole === 'manager';
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") || "at_risk"
  );
  const [urgentFilter, setUrgentFilter] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedRenewal, setSelectedRenewal] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Open a case straight from the Escalations inbox — fetch the row so the same
  // detail modal the queues use opens here too.
  const openEscalatedCase = useCallback(async (caseType, caseId) => {
    const table = caseType === 'renewal' ? 'renewal_cases' : 'pending_cases';
    const { data } = await supabase.from(table).select('*').eq('id', caseId).maybeSingle();
    if (!data) return;
    if (caseType === 'renewal') setSelectedRenewal(data);
    else setSelectedEvent(data);
  }, []);
  const hasFlaggedBroken = useRef(false);

  const { data: reminders = [] } = useUploadReminders(agencyId);

  // AI queue hooks
  const {
    fireQueue: fireRenewalQueue,
    isPending: isRenewalFiring,
    lastResult: renewalQueueResult,
    clearResult: clearRenewalResult,
  } = useFireRenewalQueue();

  const {
    fireQueue: fireCancelQueue,
    isPending: isCancelFiring,
    lastResult: cancelQueueResult,
    clearResult: clearCancelResult,
  } = useFireCancelQueue();

  const [showRenewalSuppressionOverride, setShowRenewalSuppressionOverride] = useState(false);
  const [showCancelSuppressionOverride, setShowCancelSuppressionOverride] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  async function handleSyncQueue() {
    if (syncing) return;
    setSyncing(true);
    try {
      await supabase.rpc('auto_resolve_stale_renewals');
      setLastSynced(new Date());
      queryClient.invalidateQueries({ queryKey: ['pending_cases', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['renewal_cases', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    } catch (err) {
      console.error('[sync queue]', err.message);
    } finally {
      setSyncing(false);
    }
  }

  const handleFireRenewalQueue = (override = false) => {
    setShowRenewalSuppressionOverride(false);
    clearRenewalResult();
    fireRenewalQueue(
      { overrideSuppression: override },
      {
        onSuccess: (data) => {
          if (data?.suppressed && !override) setShowRenewalSuppressionOverride(true);
        },
      }
    );
  };

  const handleFireCancelQueue = (override = false) => {
    setShowCancelSuppressionOverride(false);
    clearCancelResult();
    fireCancelQueue(
      { overrideSuppression: override },
      {
        onSuccess: (data) => {
          if (data?.suppressed && !override) setShowCancelSuppressionOverride(true);
        },
      }
    );
  };

  // ─── Fetch events ──────────────────────────────────────────────────────

  const { data: events = [], isLoading: loading } = useQuery({
    queryKey: ["pending_cases", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_cases")
        .select("*")
        .eq("agency_id", agencyId)
        .order("cancel_effective_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const loadEvents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pending_cases", agencyId] });
  }, [queryClient, agencyId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // ─── Current employee ─────────────────────────────────────────────────

  const { data: currentEmployee } = useQuery({
    queryKey: ["current_employee", agencyId, currentUserId],
    queryFn: async () => {
      if (!agencyId || !currentUserId) return null;
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, roles")
        .eq("org_id", agencyId)
        .eq("auth_user_id", currentUserId)
        .maybeSingle();
      return data || null;
    },
    enabled: !!agencyId && !!currentUserId,
    staleTime: 10 * 60 * 1000,
  });

  // ─── Producers ────────────────────────────────────────────────────────

  const { data: producers = [] } = useQuery({
    queryKey: ["producers", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .overlaps("roles", ["service_inbound", "service_outbound", "service"])
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Promise-Broken Auto-Flag ─────────────────────────────────────────

  useEffect(() => {
    if (hasFlaggedBroken.current) return;
    const today = new Date().toISOString().slice(0, 10);
    const broken = events.filter(e =>
      e.status === "promise_to_pay" &&
      e.promise_date &&
      e.promise_date < today
    );
    if (broken.length === 0) return;
    hasFlaggedBroken.current = true;
    Promise.all(
      broken.map(e =>
        supabase.from("pending_cases")
          .update({ status: "promise_broken" })
          .eq("id", e.id)
      )
    ).then(() => loadEvents());
  }, [events, loadEvents]);

  // ─── KPI Calculations ────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const active = events.filter(e =>
      !["saved", "rewritten", "lost", "auto_resolved", "requested_cancellation"].includes(e.status)
    );
    const saved = events.filter(e => ["saved", "rewritten"].includes(e.status));
    const lost = events.filter(e => ["lost", "promise_broken"].includes(e.status));
    const terminations = events.filter(e => e.status === "requested_cancellation");

    const premiumAtRisk = active.reduce((s, e) => s + (e.premium_at_risk || 0), 0);
    const premiumSaved = saved.reduce((s, e) => s + (e.premium_at_risk || 0), 0);

    const workable = saved.length + lost.length;
    const saveRate = workable > 0 ? saved.length / workable : null;
    // Contact rate = of the cases currently in the active queue, the share a
    // human has actually worked (≥1 outreach attempt). The old formula counted
    // auto-closed 'lost' cases (closed by the termination import, never
    // contacted) as contacts and double-mixed active+contacted in the
    // denominator — e.g. 12 auto-closed losses surfaced as a 32% contact rate
    // when no case had been touched.
    const contactedActive = active.filter(e => (e.attempt_count || 0) > 0);
    const contactRate = active.length > 0
      ? contactedActive.length / active.length : null;

    const today = new Date();
    const urgent = active.filter(e => {
      const d = new Date(e.cancel_effective_date);
      return (d - today) / 86400000 <= 3;
    });

    return {
      totalActive: active.length, premiumAtRisk,
      premiumSaved,
      saveRate, contactRate,
      terminations: terminations.length,
      urgentCount: urgent.length,
    };
  }, [events]);

  // ─── Resolved + Trends data ───────────────────────────────────────────

  const resolvedEvents = useMemo(() => {
    return events
      .filter(e => ["saved", "rewritten", "lost", "auto_resolved", "requested_cancellation", "promise_broken"].includes(e.status))
      .sort((a, b) => (b.resolution_date || b.updated_at || "").localeCompare(a.resolution_date || a.updated_at || ""));
  }, [events]);

  const trendsData = useMemo(() => {
    const months = {};
    for (const e of events) {
      const d = e.cancel_effective_date || e.created_at?.slice(0, 10);
      if (!d) continue;
      const key = d.slice(0, 7);
      if (!months[key]) months[key] = { month: key, cancels: 0, saves: 0, rewrites: 0, saveRate: 0 };
      months[key].cancels++;
      if (e.status === "saved") months[key].saves++;
      if (e.status === "rewritten") months[key].rewrites++;
    }
    const sorted = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    for (const m of sorted) {
      const totalSaves = m.saves + m.rewrites;
      m.saveRate = m.cancels > 0 ? Math.round((totalSaves / m.cancels) * 100) : 0;
    }
    return sorted;
  }, [events]);

  // ─── Event update handler ─────────────────────────────────────────────

  async function updateEvent(id, updates) {
    // Persist to the DB (the modal's Save relies on this), then refresh. Without
    // the write, a principal saving a case from here would silently lose it.
    if (updates && Object.keys(updates).length > 0) {
      const { error } = await supabase.from("pending_cases").update(updates).eq("id", id);
      if (error) return error;
    }
    queryClient.invalidateQueries({ queryKey: ["pending_cases", agencyId] });
    queryClient.invalidateQueries({ queryKey: ["open_escalations", agencyId] });
    return null;
  }

  async function updateRenewalCase(id, updates) {
    if (updates && Object.keys(updates).length > 0) {
      const { error } = await supabase.from("renewal_cases").update(updates).eq("id", id);
      if (error) return error;
    }
    queryClient.invalidateQueries({ queryKey: ["renewal_cases", agencyId] });
    queryClient.invalidateQueries({ queryKey: ["open_escalations", agencyId] });
    return null;
  }

  // ─── Page Render ──────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--qs-dark)", color: "var(--qs-text)", fontFamily: "'DM Sans', sans-serif", padding: "32px 24px" }}>
      <style>{GLOBAL_STYLES}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Retention Hub</h1>
          <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 2 }}>
            {currentAgency?.agencies?.name || 'Wiley-Wilson Agency'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Run AI Renewals */}
          <button
            onClick={() => handleFireRenewalQueue(false)}
            disabled={isRenewalFiring}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: 'none', cursor: isRenewalFiring ? 'not-allowed' : 'pointer',
              background: isRenewalFiring ? 'var(--qs-muted)' : 'var(--qs-info)',
              color: '#fff', opacity: isRenewalFiring ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isRenewalFiring ? (
              <>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Running...
              </>
            ) : '▶ Run AI Renewals'}
          </button>

          {/* Run AI Cancels */}
          <button
            onClick={() => handleFireCancelQueue(false)}
            disabled={isCancelFiring}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: 'none', cursor: isCancelFiring ? 'not-allowed' : 'pointer',
              background: isCancelFiring ? 'var(--qs-muted)' : 'var(--qs-warning)',
              color: '#fff', opacity: isCancelFiring ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isCancelFiring ? (
              <>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Running...
              </>
            ) : '▶ Run AI Cancels'}
          </button>

          {/* Sync Queue */}
          <button
            onClick={handleSyncQueue}
            disabled={syncing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, fontSize: 12,
              fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
              background: 'var(--qs-elevated)',
              border: '1px solid var(--qs-border)',
              color: syncing ? 'var(--qs-muted)' : 'var(--qs-text)',
              opacity: syncing ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            <RefreshCw
              className="w-3.5 h-3.5"
              style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}
            />
            {syncing ? 'Syncing…' : 'Sync Queue'}
          </button>

          {lastSynced && (
            <span style={{ fontSize: 11, color: 'var(--qs-muted)', display: 'flex', alignItems: 'center' }}>
              Last synced {lastSynced.toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true
              })}
            </span>
          )}
        </div>
      </div>

      {/* Queue result banners — renewals */}
      {renewalQueueResult && !renewalQueueResult.suppressed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', fontSize: 13 }}>
          <span style={{ color: 'var(--qs-text)' }}>
            <strong style={{ color: 'var(--qs-info)' }}>AI Renewals complete —</strong>{' '}
            {renewalQueueResult.queued} queued · {renewalQueueResult.blocked} blocked · {renewalQueueResult.skipped} skipped
            {renewalQueueResult.rate_limited ? ' · rate limited, retry later' : ''}
          </span>
          <button onClick={clearRenewalResult} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--qs-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}
      {showRenewalSuppressionOverride && renewalQueueResult?.suppressed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', fontSize: 13 }}>
          <span style={{ color: 'var(--qs-warning)', flex: 1 }}>
            <strong>AI Renewals suppressed</strong> — {renewalQueueResult.message}
          </span>
          <button onClick={() => { setShowRenewalSuppressionOverride(false); clearRenewalResult(); }} style={{ background: 'none', border: 'none', color: 'var(--qs-dim)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
          <button onClick={() => handleFireRenewalQueue(true)} style={{ padding: '4px 10px', borderRadius: 5, background: 'var(--qs-warning)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Override</button>
        </div>
      )}

      {/* Queue result banners — cancels */}
      {cancelQueueResult && !cancelQueueResult.suppressed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 13 }}>
          <span style={{ color: 'var(--qs-text)' }}>
            <strong style={{ color: 'var(--qs-warning)' }}>AI Cancels complete —</strong>{' '}
            {cancelQueueResult.queued} queued · {cancelQueueResult.blocked} blocked · {cancelQueueResult.skipped} skipped
            {cancelQueueResult.rate_limited ? ' · rate limited, retry later' : ''}
          </span>
          <button onClick={clearCancelResult} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--qs-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}
      {showCancelSuppressionOverride && cancelQueueResult?.suppressed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 8, background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)', fontSize: 13 }}>
          <span style={{ color: 'var(--qs-warning)', flex: 1 }}>
            <strong>AI Cancels suppressed</strong> — {cancelQueueResult.message}
          </span>
          <button onClick={() => { setShowCancelSuppressionOverride(false); clearCancelResult(); }} style={{ background: 'none', border: 'none', color: 'var(--qs-dim)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
          <button onClick={() => handleFireCancelQueue(true)} style={{ padding: '4px 10px', borderRadius: 5, background: 'var(--qs-warning)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Override</button>
        </div>
      )}

      {loading && (
        <div style={{ color: "var(--qs-subtle)", fontSize: 13, marginBottom: 12 }}>Loading events...</div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="At Risk" value={fmt$(kpis.premiumAtRisk)} sub={`${kpis.totalActive} policies`} color="#F59E0B" urgent={kpis.urgentCount > 0} urgentCount={kpis.urgentCount} onUrgentClick={() => { setActiveTab('at_risk'); setUrgentFilter(true); }} />
        <KpiCard label="Save Rate" value={kpis.saveRate !== null ? `${Math.round(kpis.saveRate * 100)}%` : "\u2014"} sub="saved / worked" color="#10B981" />
        <KpiCard label="Contact Rate" value={kpis.contactRate !== null ? `${Math.round(kpis.contactRate * 100)}%` : "\u2014"} sub="of active queue" color="#3B82F6" />
        <KpiCard label="Premium Saved" value={fmt$(kpis.premiumSaved)} sub="this period" color="#10B981" />
        <KpiCard label="Terminations" value={kpis.terminations} sub="requested cancel" color="var(--qs-subtle)" />
      </div>

      {/* Escalations hand-off inbox — principal only, hidden when empty */}
      {currentAgencyRole === 'principal' && (
        <EscalationsInbox
          agencyId={agencyId}
          producers={producers}
          onOpenCase={openEscalatedCase}
        />
      )}

      {/* Upload reminders — shown on all tabs */}
      <UploadReminderBanner reminders={reminders} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {["at_risk", "targeting", "renewals", "ai_perf", "resolved", "notes", "attrition", "reasons", "growth", "trends", "import", "book", ...(canDistribute ? ["distribute"] : [])].map(t => (
          <button key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
            {t === "at_risk"    ? "⚡ At Risk"        :
             t === "targeting"  ? "🎯 Targeting"      :
             t === "renewals"   ? "🔄 Renewals"       :
             t === "ai_perf"    ? "📊 AI Performance" :
             t === "resolved"   ? "✅ Outcomes"       :
             t === "notes"      ? "🗒 Notes"          :
             t === "attrition"  ? "📉 Terminations"   :
             t === "reasons"    ? "🔍 Reasons"        :
             t === "growth"     ? "📈 Net Growth"     :
             t === "trends"     ? "📋 Trends"         :
             t === "book"       ? "📖 Book Metrics"   :
             t === "distribute" ? "⚖️ Distribute"     :
                                  "⬆ Import"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "at_risk" && (
        <UnifiedAtRiskTab
          agencyId={agencyId}
          currentUserId={currentUserId}
          currentEmployeeId={currentEmployee?.id}
          urgentFilter={urgentFilter}
          onClearUrgentFilter={() => setUrgentFilter(false)}
        />
      )}
      {activeTab === "targeting" && (
        <>
          <ElasticityCurveChart agencyId={agencyId} />
          <SaveablePremiumTargeting agencyId={agencyId} />
        </>
      )}
      {activeTab === "renewals" && (
        <RetentionRenewals agencyId={agencyId} />
      )}

      {activeTab === "ai_perf" && (
        <RetentionAIPerformance agencyId={agencyId} />
      )}

      {activeTab === "resolved" && <ResolvedTab resolvedEvents={resolvedEvents} />}
      {activeTab === "notes" && <NotesSearch agencyId={agencyId} />}
      {activeTab === "trends" && <TrendsTab trendsData={trendsData} />}
      {activeTab === "attrition" && (
        <AttritionTab
          agencyId={agencyId}
          currentUserId={currentUserId}
        />
      )}
      {activeTab === "reasons" && <TerminationReasonTab agencyId={agencyId} />}
      {activeTab === "growth" && <NetGrowthTab agencyId={agencyId} />}
      {activeTab === "book" && (
        <BookMetricsPanel agencyId={agencyId} currentUserId={currentUserId} />
      )}
      {activeTab === "import" && (
        <RetentionImport
          agencyId={agencyId}
          currentUserId={currentUserId}
          currentEmployeeId={currentEmployee?.id ?? null}
        />
      )}
      {activeTab === "distribute" && canDistribute && (
        <WorkloadDistribution agencyId={agencyId} />
      )}

      {/* Detail Modal */}
      {selectedEvent && createPortal(
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdate={updateEvent}
          agencyId={agencyId}
          currentEmployeeId={currentEmployee?.id ?? null}
          producers={producers}
        />,
        document.body
      )}
      {selectedRenewal && createPortal(
        <RenewalDetailModal
          event={selectedRenewal}
          onClose={() => setSelectedRenewal(null)}
          onUpdate={updateRenewalCase}
          agencyId={agencyId}
          currentEmployeeId={currentEmployee?.id ?? null}
          producers={producers}
        />,
        document.body
      )}
    </div>
  );
}
