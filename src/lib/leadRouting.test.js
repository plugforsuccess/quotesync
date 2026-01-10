/**
 * Unit tests for Lead Routing Module
 * Run with: npx vitest src/lib/leadRouting.test.js
 */
import { describe, it, expect } from 'vitest';
import { routeLead, deterministicHash, findMatchingRules } from './leadRouting';

const DEFAULT_AGENCY_ID = 'default-agency-123';

describe('deterministicHash', () => {
  it('returns same hash for same input', () => {
    const hash1 = deterministicHash('pull-123');
    const hash2 = deterministicHash('pull-123');
    expect(hash1).toBe(hash2);
  });

  it('returns different hash for different input', () => {
    const hash1 = deterministicHash('pull-123');
    const hash2 = deterministicHash('pull-456');
    expect(hash1).not.toBe(hash2);
  });
});

describe('routeLead', () => {
  // Scenario 1: Exclusive match
  it('routes to exclusive agency first', () => {
    const routingRules = [
      { id: 'rule-1', agency_id: 'agency-A', state: 'GA', zip_prefix: null, exclusivity_level: 'state', priority_tier: 1, capacity_enabled: true },
      { id: 'rule-2', agency_id: 'agency-B', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 2, capacity_enabled: true },
    ];

    const result = routeLead({
      routingRules,
      state: 'GA',
      zip: '30301',
      pullId: 'pull-123',
      defaultAgencyId: DEFAULT_AGENCY_ID,
    });

    expect(result.agencyId).toBe('agency-A');
    expect(result.routingRuleId).toBe('rule-1');
    expect(result.viaFallback).toBe(false);
  });

  // Scenario 2: Priority tier ranking
  it('routes to highest priority tier when no exclusive', () => {
    const routingRules = [
      { id: 'rule-1', agency_id: 'agency-A', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
      { id: 'rule-2', agency_id: 'agency-B', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 3, capacity_enabled: true },
      { id: 'rule-3', agency_id: 'agency-C', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 2, capacity_enabled: true },
    ];

    const result = routeLead({
      routingRules,
      state: 'GA',
      zip: '30301',
      pullId: 'pull-123',
      defaultAgencyId: DEFAULT_AGENCY_ID,
    });

    expect(result.agencyId).toBe('agency-B');
    expect(result.routingRuleId).toBe('rule-2');
    expect(result.viaFallback).toBe(false);
  });

  // Scenario 3: Fallback when no rules match
  it('uses fallback when no rules match', () => {
    const routingRules = [
      { id: 'rule-1', agency_id: 'agency-A', state: 'FL', zip_prefix: null, exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
    ];

    const result = routeLead({
      routingRules,
      state: 'GA',
      zip: '30301',
      pullId: 'pull-123',
      defaultAgencyId: DEFAULT_AGENCY_ID,
    });

    expect(result.agencyId).toBe(DEFAULT_AGENCY_ID);
    expect(result.routingRuleId).toBeNull();
    expect(result.viaFallback).toBe(true);
  });

  // Scenario 4: ZIP prefix matching
  it('matches more specific ZIP prefix', () => {
    const routingRules = [
      { id: 'rule-1', agency_id: 'agency-A', state: 'GA', zip_prefix: '30', exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
      { id: 'rule-2', agency_id: 'agency-B', state: 'GA', zip_prefix: '303', exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
    ];

    const result = routeLead({
      routingRules,
      state: 'GA',
      zip: '30301',
      pullId: 'pull-123',
      defaultAgencyId: DEFAULT_AGENCY_ID,
    });

    // agency-B has more specific zip prefix (303 vs 30)
    expect(result.agencyId).toBe('agency-B');
  });

  // Scenario 5: Deterministic tie-breaking
  it('produces deterministic result for same pull_id', () => {
    const routingRules = [
      { id: 'rule-1', agency_id: 'agency-A', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
      { id: 'rule-2', agency_id: 'agency-B', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
      { id: 'rule-3', agency_id: 'agency-C', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
    ];

    const result1 = routeLead({
      routingRules,
      state: 'GA',
      zip: '30301',
      pullId: 'pull-same-id',
      defaultAgencyId: DEFAULT_AGENCY_ID,
    });

    const result2 = routeLead({
      routingRules,
      state: 'GA',
      zip: '30301',
      pullId: 'pull-same-id',
      defaultAgencyId: DEFAULT_AGENCY_ID,
    });

    // Same pull_id should always route to same agency
    expect(result1.agencyId).toBe(result2.agencyId);
    expect(result1.routingRuleId).toBe(result2.routingRuleId);
  });

  // Scenario 6: Disabled capacity skipped
  it('skips agencies with capacity_enabled=false', () => {
    const routingRules = [
      { id: 'rule-1', agency_id: 'agency-A', state: 'GA', zip_prefix: null, exclusivity_level: 'state', priority_tier: 2, capacity_enabled: false },
      { id: 'rule-2', agency_id: 'agency-B', state: 'GA', zip_prefix: null, exclusivity_level: 'none', priority_tier: 1, capacity_enabled: true },
    ];

    const result = routeLead({
      routingRules,
      state: 'GA',
      zip: '30301',
      pullId: 'pull-123',
      defaultAgencyId: DEFAULT_AGENCY_ID,
    });

    // agency-A has exclusive but capacity disabled, so agency-B wins
    expect(result.agencyId).toBe('agency-B');
  });
});
