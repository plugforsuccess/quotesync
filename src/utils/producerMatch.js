// src/utils/producerMatch.js
// Centralized attribution of revenue_entries rows to roster employees.
//
// revenue_entries carry a producer_id (employees.id, occasionally an
// auth_user_id) and/or a free-text producer_name. Several views need to answer
// "which producer does this entry belong to?" — the scorecard's monthly
// production and the Production Goals series among them. This is the single
// place that logic lives so the surfaces never drift apart.

import { normalizeAliasKey } from '../hooks/useEmployees';

/**
 * Build a matcher over a roster.
 * @param {Array} rosterEmployees - records from useActiveEmployees
 * @returns {(entry: object) => object|null} resolves an entry to its employee
 */
export function buildProducerMatcher(rosterEmployees = []) {
  const byId = new Map();   // employees.id AND auth_user_id → employee
  const byName = new Map(); // normalized display name → employee

  for (const emp of rosterEmployees) {
    if (!emp) continue;
    if (emp.id) byId.set(emp.id, emp);
    if (emp.auth_user_id) byId.set(emp.auth_user_id, emp);

    const last = emp.last_name || '';
    // first + last (lowest priority — set only if unseen)
    const fullKey = normalizeAliasKey(`${emp.first_name || ''} ${last}`);
    if (fullKey && !byName.has(fullKey)) byName.set(fullKey, emp);
    // preferred + last
    if (emp.preferred_name) {
      const prefKey = normalizeAliasKey(`${emp.preferred_name} ${last}`);
      if (prefKey && !byName.has(prefKey)) byName.set(prefKey, emp);
    }
    // rc_display_name (explicit override — always wins)
    if (emp.rc_display_name) {
      const rcKey = normalizeAliasKey(emp.rc_display_name);
      if (rcKey) byName.set(rcKey, emp);
    }
  }

  return function matchEntry(entry) {
    if (!entry) return null;
    // Prefer the explicit id. If it's set but unknown, return null rather than
    // falling through to a name guess — a wrong id shouldn't be re-attributed.
    if (entry.producerId) return byId.get(entry.producerId) || null;
    if (entry.producerName) return byName.get(normalizeAliasKey(entry.producerName)) || null;
    return null;
  };
}
