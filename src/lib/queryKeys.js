// src/lib/queryKeys.js
// Centralized query key factory for React Query.
// All query keys should be defined here to ensure consistent naming,
// predictable invalidation, and namespace-level cache management.

export const queryKeys = {
  // ── Agencies ────────────────────────────────────────────────────────────────
  agencies: {
    all: () => ['agencies'],
    list: (statusFilter) => ['agencies', statusFilter],
    detail: (agencyId) => ['agency', agencyId],
    routingRules: (agencyId) => ['routing_rules', agencyId],
    users: (agencyId) => ['agency_users', agencyId],
    auditLog: (agencyId) => ['audit_log', agencyId],
    leadCount: (agencyId) => ['agency_lead_count', agencyId],
  },

  // ── Leads ───────────────────────────────────────────────────────────────────
  leads: {
    all: () => ['agency_leads'],
    currentAgency: (userId) => ['current_agency', userId],
    list: (agencyId, filters) => ['agency_leads', agencyId, filters],
    detail: (leadId) => ['lead_detail', leadId],
    auditLog: (leadId) => ['lead_audit_log', leadId],
    slaMetrics: (agencyId) => ['agency_sla_metrics', agencyId],
  },

  // ── Stories / Newsroom ──────────────────────────────────────────────────────
  stories: {
    all: () => ['stories'],
    list: (filter, page) => ['stories', filter, page],
    detail: (storyId) => ['story', storyId],
    published: (category, page) => ['published_stories', category, page],
    stats: () => ['story_stats'],
  },

  // ── Employees ───────────────────────────────────────────────────────────────
  employees: {
    all: () => ['employees'],
    roster: (orgId) => ['employees', 'roster', orgId],
    detail: (id) => ['employees', 'detail', id],
    verificationsDue: (orgId) => ['employees', 'verification-due', orgId],
    verificationHistory: (employeeId) => ['employee-verifications', employeeId],
    agentAliases: (orgId) => ['employees', 'agent-aliases', orgId],
    unmatchedAgents: (orgId) => ['employees', 'unmatched-agents', orgId],
    active: (orgId) => ['employees', 'active', orgId],
    serviceReps: (orgId) => ['employees', 'service-reps', orgId],
    rcMap: (orgId) => ['employees', 'rc-map', orgId],
  },

  // ── CS Performance ──────────────────────────────────────────────────────────
  csPerformance: {
    all: () => ['cs'],
    targets: (employeeId) => ['cs-targets', employeeId],
    proactivity: (employeeId, weekStart) => ['cs-proactivity', employeeId, weekStart],
    outboundBreakdown: (employeeId, weekStart) => ['cs-outbound-breakdown', employeeId, weekStart],
    trendData: (employeeId, weekStart) => ['cs-trend', employeeId, weekStart],
    teamData: (weekStart) => ['cs-team', weekStart],
    callLog: (employeeId, weekStart) => ['cs-call-log', employeeId, weekStart],
    queueData: (orgId, weekStart) => ['queue-data', orgId, weekStart],
  },

  // ── Time & Attendance ──────────────────────────────────────────────────────
  timeAttendance: {
    all: () => ['time'],
    timeEntries: (weekStart, employeeId) => ['time-entries', weekStart, employeeId || 'all'],
    rcData: (weekStart, employeeId) => ['rc-performance', weekStart, employeeId || 'all'],
    proactivity: (weekStart, employeeId) => ['cs-proactivity', weekStart, employeeId || 'all'],
    ytdEntries: (year) => ['time-entries-ytd', year],
  },

  // ── Funnel Metrics ─────────────────────────────────────────────────────────
  funnel: {
    all: () => ['funnel_metrics'],
    metrics: (agencyId, timeRange) => ['funnel_metrics', agencyId, timeRange],
  },

  // ── Renewals ───────────────────────────────────────────────────────────────
  renewals: {
    all: () => ['renewal_cases'],
    list: (agencyId, filters) => ['renewal_cases', agencyId, filters],
    detail: (policyId) => ['renewal_cases', 'detail', policyId],
    consent: (agencyId) => ['customer_consent', agencyId],
    consentMap: (agencyId) => ['customer_consent', 'map', agencyId],
    batches: (agencyId) => ['renewal_upload_batches', agencyId],
    aiCallLog: (agencyId, daysBack) => ['ai_call_log', agencyId, daysBack],
    webhookHealth: (agencyId) => ['ai_call_log', 'webhook_health', agencyId],
  },

  // ── Referral Rewards ───────────────────────────────────────────────────────
  referrals: {
    all: () => ['referrals'],
    entries: (agencyId, period) => ['referrals', 'entries', agencyId, period],
    draws: (agencyId) => ['referrals', 'draws', agencyId],
    giveaway: (slug) => ['referrals', 'giveaway', slug || 'default'],
  },

  // ── Compensation Model ─────────────────────────────────────────────────────
  compModel: {
    all: () => ['comp-model'],
    config: (agencyId, employeeId) => ['comp-model', 'config', agencyId, employeeId],
    productMix: (configId) => ['comp-model', 'product-mix', configId],
    producer: (employeeId) => ['comp-model', 'producer', employeeId],
    carrier: (carrierId) => ['comp-model', 'carrier', carrierId],
    actuals: (agencyId, employeeId, month) => ['comp-model', 'actuals', agencyId, employeeId, month],
    vcProducts: (agencyId) => ['comp-model', 'vc-products', agencyId],
    schedules: (agencyId) => ['comp-model', 'schedules', agencyId],
    scheduleRates: (scheduleId) => ['comp-model', 'schedule-rates', scheduleId],
    comparisonPair: (agencyId, stateCode, carrierName) =>
      ['comp-model', 'comparison-pair', agencyId, stateCode, carrierName],
  },

  // ── Weekly Operating Review ────────────────────────────────────────────────
  operatingReview: {
    all: () => ['operating-review'],
    whereWeStand: (agencyId, weekStart) =>
      ['operating-review', 'where-we-stand', agencyId, weekStart],
    slips: (agencyId, weekStart) =>
      ['operating-review', 'slips', agencyId, weekStart],
    focus: (agencyId) => ['operating-review', 'focus', agencyId],
    completions: (agencyId, monthsBack) =>
      ['operating-review', 'completions', agencyId, monthsBack],
    dismissedSlips: (agencyId, weekStart) =>
      ['operating-review', 'dismissed-slips', agencyId, weekStart],
  },

  // ── Book Composition ───────────────────────────────────────────────────────
  book: {
    all: () => ['book'],
    carriers: () => ['book', 'carriers'],
    snapshot: (agencyId) => ['book', 'snapshot', agencyId],
    policies: (agencyId) => ['book', 'policies', agencyId],
    buyoutTerms: () => ['book', 'buyout-terms'],
    scenario: (agencyId, scenarioId) => ['book', 'scenario', agencyId, scenarioId],
  },
};
