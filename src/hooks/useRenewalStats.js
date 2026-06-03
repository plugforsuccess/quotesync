// src/hooks/useRenewalStats.js
// Derives bucketed counts for the renewal summary stat cards.
// Computed client-side from useRenewalPolicies data — no separate DB query.

import { useMemo } from 'react';

// ── Triage bucket logic ─────────────────────────────────────────────────────

function getDaysUntilRenewal(renewalDate) {
  if (!renewalDate) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);
  return Math.ceil((renewal - today) / (1000 * 60 * 60 * 24));
}

export function getTriageBucket(policy) {
  const daysUntil = getDaysUntilRenewal(policy.renewal_date);

  // Human Only — DNC, claim activity, stale upload, premium sanity, etc.
  if (policy.human_only) {
    return 'human_only';
  }

  // Escalated — Human Must Act Today
  if (
    policy.priority_tier === 'critical' ||
    policy.last_contact_outcome === 'shopping' ||
    (policy.human_followup_required && !policy.followup_completed_at)
  ) {
    return 'escalated';
  }

  // Contact attempt cap — >=3 no-answer or voicemail attempts → needs human call
  if (
    policy.attempt_count >= 3 &&
    ['no_answer', 'left_voicemail'].includes(policy.last_contact_outcome)
  ) {
    return 'needs_human_call';
  }

  // Not Yet Due — more than 60 days out
  if (daysUntil > 60) {
    return 'not_yet_due';
  }

  // Automation Cleared — must be at least 15 days out for AI call to be useful
  if (
    daysUntil >= 15 &&
    policy.consent?.autodial_consent === true &&
    !policy.consent?.dnc &&
    ['pending', 'contacted'].includes(policy.renewal_status) &&
    policy.priority_tier !== 'critical' &&
    policy.last_contact_outcome !== 'shopping' &&
    !(policy.human_followup_required && !policy.followup_completed_at)
  ) {
    return 'automation_cleared';
  }

  // Needs Human Call — no consent or consent denied, within 60 days
  return 'needs_human_call';
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRenewalStats(policies) {
  return useMemo(() => {
    if (!Array.isArray(policies)) {
      return {
        proactiveWindow: 0,
        escalated: 0,
        humanOnly: 0,
        needsHumanCall: 0,
        automationCleared: 0,
      };
    }

    // Proactive window = 21–45 days out: cases Allstate has posted but whose
    // bill hasn't been sent yet — the window to retain before the bill lands.
    let proactiveWindow = 0;
    let escalated = 0;
    let humanOnly = 0;
    let needsHumanCall = 0;
    let automationCleared = 0;

    policies.forEach((p) => {
      const daysUntil = getDaysUntilRenewal(p.renewal_date);
      if (daysUntil >= 21 && daysUntil <= 45) proactiveWindow++;

      const bucket = getTriageBucket(p);
      if (bucket === 'escalated') escalated++;
      else if (bucket === 'human_only') humanOnly++;
      else if (bucket === 'needs_human_call') needsHumanCall++;
      else if (bucket === 'automation_cleared') automationCleared++;
    });

    return { proactiveWindow, escalated, humanOnly, needsHumanCall, automationCleared };
  }, [policies]);
}

// ── Bucket filter helper ────────────────────────────────────────────────────

export function filterByBucket(policies, bucket) {
  if (!Array.isArray(policies)) return [];
  return policies.filter((p) => getTriageBucket(p) === bucket);
}
