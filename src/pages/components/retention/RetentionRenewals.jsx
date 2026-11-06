// src/pages/components/retention/RetentionRenewals.jsx
// Renewal triage view — lifted from RenewalsPage.jsx

import { T } from '../../../components/SiteCopy';
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
import { NEUTRAL_CHIP, DANGER_CHIP, SUCCESS_CHIP } from '../../../lib/statusChips';

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

// Only a critical tier is red; the rest read as neutral chips (lib/statusChips).
const PRIORITY_STYLES = {
  critical: DANGER_CHIP,
  high:     { ...NEUTRAL_CHIP, color: 'var(--qs-text)' },
  medium:   { ...NEUTRAL_CHIP, color: 'var(--qs-text)' },
  standard: NEUTRAL_CHIP,
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
  unreached_pre_bill: 'Call Before Bill',
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
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const COACHING_NOTES = {
  unreached_pre_bill: 'AI could not reach this >5% increase before the bill. Call NOW, before they see it — lead with "wanted to reach you ahead of your renewal," then review options.',
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
  if (hoursUntil < 0) return { label: 'OVERDUE', style: DANGER_CHIP };
  if (hoursUntil < 4) return { label: 'DUE SOON', style: { ...NEUTRAL_CHIP, color: 'var(--qs-text)' } };
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
  const dueBadge = getFollowupDueBadge(policy.followup_due_by);
  const tenureHint = getTenureHint(policy.customer_tenure_years);
  const coachingNote = policy.human_followup_required && policy.followup_reason
    ? COACHING_NOTES[policy.followup_reason]
    : null;

  const consentStyle = policy.consent?.autodial_consent
    ? { ...NEUTRAL_CHIP, color: 'var(--qs-text)' }
    : { ...NEUTRAL_CHIP, color: 'var(--qs-muted)' };

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
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, ...NEUTRAL_CHIP, textTransform: 'capitalize' }}>
              {policy.policy_type}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4, fontSize: 13, color: 'var(--qs-dim)', flexWrap: 'wrap' }}>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(policy.renewal_date)}
              {daysUntil != null && (
                <span style={{ fontWeight: 600, color: daysUntil <= 14 ? 'var(--qs-danger)' : 'var(--qs-text)' }} title={daysUntil < 21 ? 'Bill is out — human save window' : daysUntil <= 45 ? 'Proactive window — call before the bill' : 'Not yet posted'}>
                  ({daysUntil} <T k="pages.components.retention.retentionrenewals.e6d2be">days)</T>
                </span>
              )}
            </span>
            <span>
              {formatCurrency(policy.current_premium)} → {formatCurrency(policy.premium)}
              {pctChange != null && (
                <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--qs-text)', marginLeft: 4 }}>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...NEUTRAL_CHIP }}>
              <Bot className="w-3 h-3" />
              <T k="pages.components.retention.retentionrenewals.d3f361">AI Call</T>
            </span>
          )}

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...consentStyle }}>
            <Phone className="w-3 h-3" />
            {policy.consent?.autodial_consent ? <T k="pages.components.retention.retentionrenewals.9e6e15">{'Consented'}</T> : <T k="pages.components.retention.retentionrenewals.a22c7e">{'No consent'}</T>}
          </span>

          {policy.human_only && policy.human_only_reason && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...NEUTRAL_CHIP, color: 'var(--qs-text)' }}>
              {HUMAN_ONLY_REASON_LABELS[policy.human_only_reason] || policy.human_only_reason}
            </span>
          )}

          {policy.human_followup_required && policy.followup_reason && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...NEUTRAL_CHIP, color: 'var(--qs-text)' }}>
              {FOLLOWUP_LABELS[policy.followup_reason] || policy.followup_reason}
            </span>
          )}

          {policy.amount_due > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, ...NEUTRAL_CHIP, color: 'var(--qs-text)' }}>
              ${policy.amount_due} <T k="pages.components.retention.retentionrenewals.d6692d">due</T>
            </span>
          )}

          {policy.customer_tenure_years != null && policy.customer_tenure_years > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...NEUTRAL_CHIP }} title={tenureHint || 'Customer tenure'}>
              {policy.customer_tenure_years}<T k="pages.components.retention.retentionrenewals.48ecdd">yr tenure</T>
            </span>
          )}

          <button
            onClick={() => onLogContact(policy)}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            <T k="pages.components.retention.retentionrenewals.a8284d">Log Contact</T>
          </button>
          {policy.human_followup_required && !policy.followup_completed_at && onMarkComplete && (
            <button
              onClick={() => onMarkComplete(policy)}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--qs-info)', color: '#fff', fontWeight: 600 }}
            >
              <T k="pages.components.retention.retentionrenewals.7b9e53">Mark Complete</T>
            </button>
          )}
          <Link
            to={`/admin/renewals/${policy.id}`}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px' }}
          >
            <T k="pages.components.retention.retentionrenewals.4351cf">View</T>
          </Link>
        </div>
      </div>

      {coachingNote && !policy.followup_completed_at && (
        <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12, background: 'var(--qs-info-subtle)', color: 'var(--qs-info)', border: '1px solid var(--qs-info-border)' }}>
          {coachingNote}
        </div>
      )}

      {tenureHint && policy.human_followup_required && !policy.followup_completed_at && (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--qs-dim)', fontStyle: 'italic' }}>
          {tenureHint}
        </div>
      )}
    </div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────────────────

// Section accents: red for escalated, gold for cleared, neutral in between.
// Each entry carries its own chip style so nothing derives alpha from a hex.
const SECTION_COLORS = {
  red:    { color: 'var(--qs-danger)',  chip: DANGER_CHIP },
  orange: { color: 'var(--qs-text)',    chip: { ...NEUTRAL_CHIP, color: 'var(--qs-text)' } },
  yellow: { color: 'var(--qs-text)',    chip: { ...NEUTRAL_CHIP, color: 'var(--qs-text)' } },
  green:  { color: 'var(--qs-success)', chip: SUCCESS_CHIP },
};

function TriageSection({ title, icon: Icon, color, count, policies, defaultOpen = true, onLogContact, onMarkComplete }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const sc = SECTION_COLORS[color];
  // Only red/gold sections get a colored left edge; neutral ones use the hairline.
  const edge = sc && color !== 'orange' && color !== 'yellow' ? sc.color : 'var(--qs-border)';

  return (
    <div style={{ border: '1px solid var(--qs-border)', borderLeft: `4px solid ${edge}`, borderRadius: 8, marginBottom: 8 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-elevated)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <div className="flex items-center gap-2">
          <Icon size={18} style={{ color: sc?.color || 'var(--qs-dim)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>{title}</h3>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
            ...(sc?.chip || NEUTRAL_CHIP),
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
            <p style={{ fontSize: 13, color: 'var(--qs-muted)', padding: '8px 0' }}><T k="pages.components.retention.retentionrenewals.94bee1">No policies in this bucket.</T></p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────

// Stat tiles: neutral cards; the escalated count is the one red value, the
// cleared count the one gold value.
const STAT_COLORS = {
  blue:   { bg: 'var(--qs-card)', border: 'var(--qs-border)', text: 'var(--qs-bright)' },
  red:    { bg: 'var(--qs-card)', border: 'var(--qs-border)', text: 'var(--qs-danger)' },
  orange: { bg: 'var(--qs-card)', border: 'var(--qs-border)', text: 'var(--qs-bright)' },
  yellow: { bg: 'var(--qs-card)', border: 'var(--qs-border)', text: 'var(--qs-bright)' },
  green:  { bg: 'var(--qs-card)', border: 'var(--qs-border)', text: 'var(--qs-success)' },
};

function StatCard({ label, value, color }) {
  const c = STAT_COLORS[color] || STAT_COLORS.blue;
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${c.border}`, padding: 16, background: c.bg }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--qs-subtle)', marginBottom: 4 }}>{label}</p>
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
        <T k="pages.components.retention.retentionrenewals.dd5e79">Loading renewals...</T>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, borderRadius: 8, background: 'var(--qs-danger-subtle)', color: 'var(--qs-danger)', fontSize: 13 }}>
        <T k="pages.components.retention.retentionrenewals.8fdee3">Failed to load renewals:</T> {error.message}
      </div>
    );
  }

  const isEmpty = !Array.isArray(policies) || policies.length === 0;

  if (isEmpty) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <RefreshCw size={40} style={{ color: 'var(--qs-border)', margin: '0 auto 16px' }} />
        <h2 style={{ color: 'var(--qs-bright)', marginBottom: 8 }}><T k="pages.components.retention.retentionrenewals.b056df">No Renewals Uploaded Yet</T></h2>
        <p style={{ color: 'var(--qs-dim)', fontSize: 13 }}>
          <T k="pages.components.retention.retentionrenewals.49bedd">Upload your Allstate Renewal report using the Import tab.</T>
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
