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

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  standard: 'bg-gray-100 text-gray-700',
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
  if (hoursUntil < 0) return { label: 'OVERDUE', color: 'bg-red-100 text-red-700' };
  if (hoursUntil < 4) return { label: 'DUE SOON', color: 'bg-amber-100 text-amber-700' };
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

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Left: Customer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/admin/renewals/${policy.id}`}
              className="font-semibold text-gray-900 hover:text-primary-600 truncate"
            >
              {policy.customer_name}
            </Link>
            <span className="text-xs text-gray-500 font-mono">{policy.policy_no}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
              {policy.policy_type}
            </span>
          </div>

          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(policy.renewal_date)}
              {daysUntil != null && (
                <span className={`font-medium ${daysUntil <= 14 ? 'text-red-600' : daysUntil <= 30 ? 'text-amber-600' : 'text-gray-600'}`}>
                  ({daysUntil} days)
                </span>
              )}
            </span>
            <span>
              {formatCurrency(policy.current_premium)} → {formatCurrency(policy.premium)}
              {pctChange != null && (
                <span className={`ml-1 text-xs font-semibold ${isIncrease ? 'text-red-600' : isDecrease ? 'text-green-600' : 'text-gray-500'}`}>
                  {isIncrease ? '+' : ''}{pctChange}%
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Right: Badges and actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${PRIORITY_COLORS[policy.priority_tier] || PRIORITY_COLORS.standard}`}>
            {policy.priority_tier}
          </span>

          {dueBadge && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${dueBadge.color}`}>
              {dueBadge.label}
            </span>
          )}

          {policy.last_contact_outcome && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
              {OUTCOME_LABELS[policy.last_contact_outcome] || policy.last_contact_outcome}
            </span>
          )}

          {policy.last_contact_channel === 'ai_voice' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
              <Bot className="w-3 h-3" />
              AI Call
            </span>
          )}

          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
            policy.consent?.autodial_consent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            <Phone className="w-3 h-3" />
            {policy.consent?.autodial_consent ? 'Consented' : 'No consent'}
          </span>

          {policy.human_only && policy.human_only_reason && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
              {HUMAN_ONLY_REASON_LABELS[policy.human_only_reason] || policy.human_only_reason}
            </span>
          )}

          {policy.human_followup_required && policy.followup_reason && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
              {FOLLOWUP_LABELS[policy.followup_reason] || policy.followup_reason}
            </span>
          )}

          {policy.amount_due > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
              ${policy.amount_due} due
            </span>
          )}

          {policy.customer_tenure_years != null && policy.customer_tenure_years > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700" title={tenureHint || 'Customer tenure'}>
              {policy.customer_tenure_years}yr tenure
            </span>
          )}

          <button
            onClick={() => onLogContact(policy)}
            className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
          >
            Log Contact
          </button>
          {policy.human_followup_required && !policy.followup_completed_at && onMarkComplete && (
            <button
              onClick={() => onMarkComplete(policy)}
              className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
            >
              Mark Complete
            </button>
          )}
          <Link
            to={`/admin/renewals/${policy.id}`}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            View
          </Link>
        </div>
      </div>

      {coachingNote && !policy.followup_completed_at && (
        <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700 border border-blue-100">
          {coachingNote}
        </div>
      )}

      {tenureHint && policy.human_followup_required && !policy.followup_completed_at && (
        <div className="mt-1 text-xs text-purple-600 italic">
          {tenureHint}
        </div>
      )}
    </div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────────────────

function TriageSection({ title, icon: Icon, color, count, policies, defaultOpen = true, onLogContact, onMarkComplete }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const borderColor = { red: 'border-l-red-500', orange: 'border-l-orange-500', yellow: 'border-l-yellow-500', green: 'border-l-green-500' }[color] || 'border-l-gray-300';

  return (
    <div className={`border rounded-lg ${borderColor} border-l-4`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-gray-600" />
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
            color === 'red' ? 'bg-red-100 text-red-700' :
            color === 'orange' ? 'bg-orange-100 text-orange-700' :
            color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
            {count}
          </span>
        </div>
        {isOpen ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-2">
          {Array.isArray(policies) && policies.length > 0 ? (
            policies.map((p) => <RenewalCard key={p.id} policy={p} onLogContact={onLogContact} onMarkComplete={onMarkComplete} />)
          ) : (
            <p className="text-sm text-gray-400 py-2">No policies in this bucket.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
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
        <StatCard label="Due in 60 Days"     value={stats.totalDue60Days}    color="blue"   />
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
            style={{ width: '100%', paddingLeft: 30 }}
          />
        </div>
        <select value={policyType} onChange={(e) => setPolicyType(e.target.value)}>
          {POLICY_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>{pt.label}</option>
          ))}
        </select>
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
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
