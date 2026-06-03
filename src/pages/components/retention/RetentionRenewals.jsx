// src/pages/components/retention/RetentionRenewals.jsx
// Renewal triage view — lifted from RenewalsPage.jsx

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw, Search, Phone, CheckCircle, AlertTriangle,
  Clock, ShieldAlert, Bot, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useRenewalPolicies } from '../../../hooks/useRenewalCases';
import { useRenewalStats, filterByBucket } from '../../../hooks/useRenewalStats';
import { useActiveEmployees } from '../../../hooks/useEmployees';
import ContactLogModal from '../renewals/ContactLogModal';
import FinalOutcomeModal from '../renewals/FinalOutcomeModal';

// ── Constants ───────────────────────────────────────────────────────────────

const POLICY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'auto', label: 'Auto' },
  { value: 'home', label: 'Home' },
  { value: 'condo', label: 'Condo' },
  { value: 'renters', label: 'Renters' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'pup', label: 'PUP' },
  { value: 'boat', label: 'Boat' },
  { value: 'manufactured', label: 'Manufactured' },
  { value: 'specialty_auto', label: 'Specialty Auto' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_STYLES = {
  critical: { background: 'rgba(239,68,68,0.15)',  color: '#F87171' },
  high:     { background: 'rgba(249,115,22,0.15)', color: '#FB923C' },
  medium:   { background: 'rgba(245,158,11,0.15)', color: '#FBBF24' },
  standard: { background: 'var(--qs-elevated)',    color: 'var(--qs-dim)' },
};

const OUTCOME_LABELS = {
  no_answer: 'No Answer',
  confirmed: 'Confirmed',
  hesitant: 'Hesitant',
  shopping: 'Shopping',
  escalated: 'Escalated',
  left_voicemail: 'Voicemail',
  wrong_number: 'Wrong #',
  third_party_answer: '3rd Party',
};

const FOLLOWUP_LABELS = {
  rate_shock: 'Rate Shock',
  shopping: 'Shopping',
  no_response: 'No Response',
  eft_lapse: 'EFT Lapse',
  multi_policy: 'Multi-Policy',
  hesitant: 'Hesitant',
  address_discrepancy: 'Address Discrepancy',
  amount_due: 'Amount Due',
  wrong_number: 'Wrong Number',
  manual: 'Manual',
};

const HUMAN_ONLY_REASON_LABELS = {
  dnc: 'Do Not Call',
  claim_activity: 'Claim Activity',
  multi_date_conflict: 'Multi-Date Conflict',
  premium_sanity: 'Premium Sanity',
  stale_upload: 'Stale Upload',
  amount_due: 'Amount Due',
  no_consent: 'No Consent',
  attempt_cap: 'Attempt Cap',
  manual: 'Manual',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}

function formatCurrency(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const COACHING_NOTES = {
  rate_shock: 'Customer received rate increase — they agreed to a callback. Lead with empathy, review options before pitching retention.',
  shopping: 'Customer mentioned shopping — they agreed to hear from us. Call today; window is open.',
  hesitant: 'Customer was uncertain — soft follow-up, no pressure. Confirm they are comfortable with the renewal.',
  manual: 'Customer had a question the AI could not answer — answer it first, then move to retention.',
};

const TENURE_HINTS = {
  long: 'Long-term customer — lead with relationship and loyalty',
  mid: 'Established customer — lead with coverage continuity',
  short: 'Newer customer — lead with value, savings, and service',
};

function getFollowupDueBadge(followupDueBy) {
  if (!followupDueBy) return null;
  const now = new Date();
  const due = new Date(followupDueBy);
  const hoursUntil = (due - now) / (1000 * 60 * 60);
  if (hoursUntil < 0) return { label: 'OVERDUE', style: { background: 'rgba(239,68,68,0.15)', color: '#F87171' } };
  if (hoursUntil < 4) return { label: 'DUE SOON', style: { background: 'rgba(245,158,11,0.15)', color: '#FBBF24' } };
  return null;
}

function getTenureHint(years) {
  if (years == null || years <= 0) return null;
  if (years >= 10) return TENURE_HINTS.long;
  if (years >= 5) return TENURE_HINTS.mid;
  return TENURE_HINTS.short;
}

// ── Renewal Card ────────────────────────────────────────────────────────────

function RenewalCard({ policy, onLogContact, onMarkComplete }) {
  const daysUntil = getDaysUntil(policy.renewal_date);
  const pctChange = policy.premium_change_pct;
  const isIncrease = pctChange != null && pctChange > 0;
  const isDecrease = pctChange != null && pctChange < 0;
  const dueBadge = getFollowupDueBadge(policy.followup_due_by);
  const tenureHint = getTenureHint(policy.customer_tenure_years);
  const coachingNote = policy.human_followup_required && policy.followup_reason
    ? COACHING_NOTES[policy.followup_reason]
    : null;

  const consentStyle = policy.consent?.autodial_consent
    ? { background: 'rgba(52,211,153,0.15)', color: '#34D399' }
    : { background: 'var(--qs-elevated)', color: 'var(--qs-muted)' };

  return (
    <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 10, padding: 16, marginBottom: 8 }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Left: Customer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/admin/renewals/${policy.id}`}
              style={{ fontWeight: 600, color: 'var(--qs-bright)', textDecoration: 'none' }}
            >
              {policy.customer_name}
            </Link>
            <span style={{ fontSize: 12, color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace" }}>{policy.policy_no}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.15)', color: '#60A5FA', textTransform: 'capitalize' }}>
              {policy.policy_type}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4, fontSize: 13, color: 'var(--qs-dim)', flexWrap: 'wrap' }}>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(policy.renewal_date)}
              {daysUntil != null && (
                <span style={{ fontWeight: 600, color: daysUntil < 21 ? '#F87171' : daysUntil <= 45 ? '#FBBF24' : 'var(--qs-dim)' }} title={daysUntil < 21 ? 'Bill is out — human save window' : daysUntil <= 45 ? 'Proactive window — call before the bill' : 'Not yet posted'}>
                  ({daysUntil} days)
                </span>
              )}
            </span>
            <span>
              {formatCurrency(policy.current_premium)} → {formatCurrency(policy.premium)}
              {pctChange != null && (
                <span style={{ fontWeight: 700, fontSize: 11, color: isIncrease ? '#F87171' : isDecrease ? '#34D399' : 'var(--qs-dim)', marginLeft: 4 }}>
                  {isIncrease ? '+' : ''}{pctChange}%
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Right: Badges and actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', ...(PRIORITY_STYLES[policy.priority_tier] || PRIORITY_STYLES.standard) }}>
            {policy.priority_tier}
          </span>

          {dueBadge && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, ...dueBadge.style }}>
              {dueBadge.label}
            </span>
          )}

          {policy.last_contact_outcome && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'var(--qs-elevated)', color: 'var(--qs-dim)' }}>
              {OUTCOME_LABELS[policy.last_contact_outcome] || policy.last_contact_outcome}
            </span>
          )}

          {policy.last_contact_channel === 'ai_voice' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>
              <Bot className="w-3 h-3" />
              AI Call
            </span>
          )}

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...consentStyle }}>
            <Phone className="w-3 h-3" />
            {policy.consent?.autodial_consent ? 'Consented' : 'No consent'}
          </span>

          {policy.human_only && policy.human_only_reason && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'rgba(249,115,22,0.15)', color: '#FB923C' }}>
              {HUMAN_ONLY_REASON_LABELS[policy.human_only_reason] || policy.human_only_reason}
            </span>
          )}

          {policy.human_followup_required && policy.followup_reason && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>
              {FOLLOWUP_LABELS[policy.followup_reason] || policy.followup_reason}
            </span>
          )}

          {policy.amount_due > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
              ${policy.amount_due} due
            </span>
          )}

          {policy.customer_tenure_years != null && policy.customer_tenure_years > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'rgba(168,85,247,0.15)', color: '#C084FC' }} title={tenureHint || 'Customer tenure'}>
              {policy.customer_tenure_years}yr tenure
            </span>
          )}

          <button
            onClick={() => onLogContact(policy)}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            Log Contact
          </button>
          {policy.human_followup_required && !policy.followup_completed_at && onMarkComplete && (
            <button
              onClick={() => onMarkComplete(policy)}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(52,211,153,0.15)', color: '#34D399', fontWeight: 600 }}
            >
              Mark Complete
            </button>
          )}
          <Link
            to={`/admin/renewals/${policy.id}`}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            View
          </Link>
        </div>
      </div>

      {coachingNote && !policy.followup_completed_at && (
        <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(59,130,246,0.1)', color: 'var(--qs-info)', border: '1px solid rgba(59,130,246,0.2)' }}>
          {coachingNote}
        </div>
      )}

      {tenureHint && policy.human_followup_required && !policy.followup_completed_at && (
        <div style={{ marginTop: 4, fontSize: 12, color: '#C084FC', fontStyle: 'italic' }}>
          {tenureHint}
        </div>
      )}
    </div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────────────────

const SECTION_COLORS = {
  red:    '#EF4444',
  orange: '#F97316',
  yellow: '#F59E0B',
  green:  '#10B981',
};

function TriageSection({ title, icon: Icon, color, count, policies, defaultOpen = true, onLogContact, onMarkComplete }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={{ border: '1px solid var(--qs-border)', borderLeft: `4px solid ${SECTION_COLORS[color] || 'var(--qs-border)'}`, borderRadius: 8, marginBottom: 8 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-elevated)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <div className="flex items-center gap-2">
          <Icon size={18} style={{ color: SECTION_COLORS[color] || 'var(--qs-dim)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>{title}</h3>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
            background: `${SECTION_COLORS[color] || 'var(--qs-border)'}22`,
            color: SECTION_COLORS[color] || 'var(--qs-dim)',
          }}>
            {count}
          </span>
        </div>
        {isOpen ? <ChevronDown size={18} style={{ color: 'var(--qs-subtle)' }} /> : <ChevronRight size={18} style={{ color: 'var(--qs-subtle)' }} />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-2">
          {Array.isArray(policies) && policies.length > 0 ? (
            policies.map((p) => <RenewalCard key={p.id} policy={p} onLogContact={onLogContact} onMarkComplete={onMarkComplete} />)
          ) : (
            <p style={{ fontSize: 13, color: 'var(--qs-muted)', padding: '8px 0' }}>No policies in this bucket.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────

const STAT_COLORS = {
  blue:   { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.2)',  text: '#60A5FA' },
  red:    { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   text: '#F87171' },
  orange: { bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.2)',  text: '#FB923C' },
  yellow: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  text: '#FBBF24' },
  green:  { bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)',  text: '#34D399' },
};

function StatCard({ label, value, color }) {
  const c = STAT_COLORS[color] || STAT_COLORS.blue;
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${c.border}`, padding: 16, background: c.bg }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: c.text, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: c.text }}>{value}</p>
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

export default function RetentionRenewals({ agencyId }) {
  const { currentAgencyRole } = useAuth();
  const { data: employees = [] } = useActiveEmployees(agencyId);

  const [policyType, setPolicyType] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [search, setSearch] = useState('');

  const filters = useMemo(() => ({
    policyType: policyType || undefined,
    assignedTo: assignedTo || undefined,
    search: search || undefined,
  }), [policyType, assignedTo, search]);

  const { data: policies = [], isLoading, error, refetch } = useRenewalPolicies(agencyId, filters);
  const stats = useRenewalStats(policies);

  const escalatedPolicies  = useMemo(() => filterByBucket(policies, 'escalated'),         [policies]);
  const humanOnlyPolicies  = useMemo(() => filterByBucket(policies, 'human_only'),         [policies]);
  const needsHumanPolicies = useMemo(() => filterByBucket(policies, 'needs_human_call'),   [policies]);
  const automationPolicies = useMemo(() => filterByBucket(policies, 'automation_cleared'), [policies]);

  const [contactPolicy, setContactPolicy] = useState(null);
  const [outcomePolicy, setOutcomePolicy] = useState(null);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '48px 0', color: 'var(--qs-dim)' }}>
        <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
        Loading renewals...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, borderRadius: 8, background: 'var(--qs-danger-subtle)', color: 'var(--qs-danger)', fontSize: 13 }}>
        Failed to load renewals: {error.message}
      </div>
    );
  }

  const isEmpty = !Array.isArray(policies) || policies.length === 0;

  if (isEmpty) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <RefreshCw size={40} style={{ color: 'var(--qs-border)', margin: '0 auto 16px' }} />
        <h2 style={{ color: 'var(--qs-bright)', marginBottom: 8 }}>No renewals uploaded yet</h2>
        <p style={{ color: 'var(--qs-dim)', fontSize: 13 }}>
          Upload your Allstate Renewal report using the Import tab.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <StatCard label="Proactive (21–45d)"  value={stats.proactiveWindow}   color="blue"   />
        <StatCard label="Escalated"           value={stats.escalated}         color="red"    />
        <StatCard label="Human Only"          value={stats.humanOnly}         color="orange" />
        <StatCard label="Needs Human Call"    value={stats.needsHumanCall}    color="yellow" />
        <StatCard label="Automation Cleared"  value={stats.automationCleared} color="green"  />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12, background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--qs-subtle)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or policy #..."
            style={{ width: '100%', paddingLeft: 30, background: 'var(--qs-elevated)', color: 'var(--qs-text)', border: '1px solid var(--qs-border)', borderRadius: 6, padding: '7px 10px 7px 30px', fontSize: 13 }}
          />
        </div>
        <select
          value={policyType}
          onChange={(e) => setPolicyType(e.target.value)}
          style={{ background: 'var(--qs-elevated)', color: 'var(--qs-text)', border: '1px solid var(--qs-border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}
        >
          {POLICY_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>{pt.label}</option>
          ))}
        </select>
        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          style={{ background: 'var(--qs-elevated)', color: 'var(--qs-text)', border: '1px solid var(--qs-border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">All Assignees</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.preferred_name || emp.first_name} {emp.last_name}
            </option>
          ))}
        </select>
      </div>

      {/* Triage sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TriageSection title="Escalated"          icon={AlertTriangle} color="red"    count={escalatedPolicies.length}  policies={escalatedPolicies}  defaultOpen={true}  onLogContact={setContactPolicy} onMarkComplete={setOutcomePolicy} />
        <TriageSection title="Human Only"          icon={ShieldAlert}   color="orange" count={humanOnlyPolicies.length}  policies={humanOnlyPolicies}  defaultOpen={true}  onLogContact={setContactPolicy} onMarkComplete={setOutcomePolicy} />
        <TriageSection title="Needs Human Call"    icon={Phone}         color="yellow" count={needsHumanPolicies.length} policies={needsHumanPolicies} defaultOpen={true}  onLogContact={setContactPolicy} onMarkComplete={setOutcomePolicy} />
        <TriageSection title="Automation Cleared"  icon={CheckCircle}   color="green"  count={automationPolicies.length} policies={automationPolicies} defaultOpen={false} onLogContact={setContactPolicy} onMarkComplete={setOutcomePolicy} />
      </div>

      {/* Modals */}
      <ContactLogModal  isOpen={!!contactPolicy} onClose={() => setContactPolicy(null)} policy={contactPolicy} onSuccess={refetch} />
      <FinalOutcomeModal isOpen={!!outcomePolicy} onClose={() => setOutcomePolicy(null)} policy={outcomePolicy} onSuccess={refetch} />
    </div>
  );
}
