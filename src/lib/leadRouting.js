/**
 * Deterministic Lead Routing Module
 * Routes leads to exactly one agency based on state/zip and routing rules
 */

/**
 * Generates a deterministic hash from a string
 * @param {string} str - Input string (e.g., pull_id)
 * @returns {number} - Positive integer hash
 */
export function deterministicHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Finds matching routing rules for a given state and zip
 * @param {Array} routingRules - All routing rules from database
 * @param {string} state - 2-letter state code
 * @param {string} zip - ZIP code
 * @returns {Array} - Matching rules sorted by specificity and priority
 */
export function findMatchingRules(routingRules, state, zip) {
  return routingRules
    .filter(rule => {
      if (!rule.capacity_enabled) return false;
      if (rule.state !== state) return false;
      // If zip_prefix is set, check if zip starts with it
      if (rule.zip_prefix && !zip.startsWith(rule.zip_prefix)) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort by: exclusivity first, then priority tier, then zip specificity
      const exclusivityOrder = { state: 3, zip: 2, none: 1 };
      const aExcl = exclusivityOrder[a.exclusivity_level] || 0;
      const bExcl = exclusivityOrder[b.exclusivity_level] || 0;
      if (bExcl !== aExcl) return bExcl - aExcl;

      // Higher priority_tier wins
      if (b.priority_tier !== a.priority_tier) return b.priority_tier - a.priority_tier;

      // More specific zip prefix wins
      const aZipLen = (a.zip_prefix || '').length;
      const bZipLen = (b.zip_prefix || '').length;
      return bZipLen - aZipLen;
    });
}

/**
 * Routes a lead to exactly one agency
 * @param {Object} params - Routing parameters
 * @param {Array} params.routingRules - All active routing rules
 * @param {string} params.state - 2-letter state code
 * @param {string} params.zip - ZIP code
 * @param {string} params.pullId - Canopy pull ID (used for deterministic tie-breaking)
 * @param {string} params.defaultAgencyId - Fallback agency ID
 * @returns {Object} - { agencyId, routingRuleId, viaFallback }
 */
export function routeLead({ routingRules, state, zip, pullId, defaultAgencyId }) {
  const matchingRules = findMatchingRules(routingRules, state, zip);

  if (matchingRules.length === 0) {
    return {
      agencyId: defaultAgencyId,
      routingRuleId: null,
      viaFallback: true
    };
  }

  // Check for exclusive match first
  const exclusiveRules = matchingRules.filter(
    r => r.exclusivity_level !== 'none'
  );

  if (exclusiveRules.length > 0) {
    // Pick highest priority exclusive rule
    const winner = exclusiveRules[0];
    return {
      agencyId: winner.agency_id,
      routingRuleId: winner.id,
      viaFallback: false
    };
  }

  // No exclusive - rank by priority tier with deterministic tie-breaker
  const topTier = matchingRules[0].priority_tier;
  const topTierRules = matchingRules.filter(r => r.priority_tier === topTier);

  if (topTierRules.length === 1) {
    const winner = topTierRules[0];
    return {
      agencyId: winner.agency_id,
      routingRuleId: winner.id,
      viaFallback: false
    };
  }

  // Multiple agencies at same tier - deterministic selection via pull_id hash
  const hash = deterministicHash(pullId);
  const winnerIndex = hash % topTierRules.length;
  const winner = topTierRules[winnerIndex];

  return {
    agencyId: winner.agency_id,
    routingRuleId: winner.id,
    viaFallback: false
  };
}

/**
 * Validates required lead input fields
 * @param {Object} input - Lead input data
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateLeadInput(input) {
  const errors = [];

  if (!input.pull_id) errors.push('pull_id is required');
  if (!input.state || input.state.length !== 2) errors.push('state must be 2-letter code');
  if (!input.zip || !/^\d{5}/.test(input.zip)) errors.push('zip must be valid 5-digit code');
  if (!input.session_id) errors.push('session_id is required');

  return {
    valid: errors.length === 0,
    errors
  };
}
