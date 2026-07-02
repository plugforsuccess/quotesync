// src/lib/householdAssign.js
// Household-consistent renewal assignment. Renewal cases post ~45 days before
// the renewal date, so every ACTIVE renewal case is inside the proactive
// window by definition — and the agency rule is that a household's cases in
// that window are never split across reps (one customer, one caller). This
// module is the single source of the household identity used by import
// auto-assignment, manual reassignment, and the workload rebalancer.

export const RENEWAL_ACTIVE_EXCLUDED = ['confirmed', 'lost', 'auto_resolved', 'unreachable'];

// Primary household key: phone digits when available, else normalized name.
// (Shared with the renewal import's auto-assignment rotation.)
export function householdKey(name, phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length >= 10) return 'p:' + d.slice(-10);
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return n ? 'n:' + n : null;
}

// All candidate keys for a case — used for sibling MATCHING (as opposed to
// grouping), so an auto row carrying a phone still matches a property row
// that came in without one, via the shared name key.
function keysOf(name, phone) {
  const ks = [];
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length >= 10) ks.push('p:' + d.slice(-10));
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (n) ks.push('n:' + n);
  return ks;
}

// Ids of the household's OTHER active renewal cases (same agency, non-terminal),
// matched on phone digits or normalized name.
export async function findRenewalHouseholdSiblingIds(supabase, agencyId, { caseId, customerName, phone }) {
  const keys = keysOf(customerName, phone);
  if (!agencyId || keys.length === 0) return [];
  const { data, error } = await supabase
    .from('renewal_cases')
    .select('id, customer_name, phone')
    .eq('agency_id', agencyId)
    .not('status', 'in', `(${RENEWAL_ACTIVE_EXCLUDED.join(',')})`);
  if (error) throw error;
  return (data || [])
    .filter(r => r.id !== caseId && keysOf(r.customer_name, r.phone).some(k => keys.includes(k)))
    .map(r => r.id);
}

// Move the household's other active renewal cases to the same rep, so a manual
// reassignment can never split a household. No-op when unassigning (null) —
// pulling the whole household off a rep is a deliberate act, not an implied one.
// Returns how many sibling cases moved.
export async function reassignRenewalHousehold(supabase, agencyId, { caseId, customerName, phone, employeeId }) {
  if (!employeeId) return 0;
  const ids = await findRenewalHouseholdSiblingIds(supabase, agencyId, { caseId, customerName, phone });
  if (ids.length === 0) return 0;
  const { error } = await supabase
    .from('renewal_cases')
    .update({ assigned_to_id: employeeId })
    .in('id', ids);
  if (error) throw error;
  return ids.length;
}
