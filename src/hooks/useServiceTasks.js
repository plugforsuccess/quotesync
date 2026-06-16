// src/hooks/useServiceTasks.js
// First-class admin/service task queue — the batchable work behind the
// Operating Playbook's "Afternoon — SERVICE BATCH". Tasks are logged the moment
// a call lands and cleared later in one protected block, grouped by type and
// sorted by due date. Backed by the service_tasks table.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// task_type is the batch key. `lane` groups types by who can do the work and in
// what order: licensed coverage/price questions first, licensed policy changes
// next, then the quick front-desk tasks to close out.
export const TASK_TYPES = [
  { value: 'mortgagee', label: 'Mortgagee / Lienholder', icon: '🏦', lane: 'portal',    color: '#3B82F6' },
  { value: 'vehicle',   label: 'Add / Remove Vehicle',   icon: '🚗', lane: 'portal',    color: '#0EA5E9' },
  { value: 'billing',   label: 'Billing Change',         icon: '💳', lane: 'portal',    color: '#F59E0B' },
  { value: 'address',   label: 'Address Update',         icon: '📍', lane: 'portal',    color: '#14B8A6' },
  { value: 'premium',   label: 'Premium Question',       icon: '💲', lane: 'licensed',  color: '#EF4444' },
  { value: 'coverage',  label: 'Coverage Change',        icon: '🛡️', lane: 'licensed',  color: '#8B5CF6' },
  { value: 'id_cards',  label: 'ID Cards / Docs',        icon: '🪪', lane: 'clerical',  color: '#10B981' },
  { value: 'document',  label: 'Document Request',       icon: '📄', lane: 'clerical',  color: '#22C55E' },
  { value: 'other',     label: 'Other',                  icon: '📌', lane: 'clerical',  color: '#94A3B8' },
];

export const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map(t => [t.value, t]));

// Line of business a task touches — same vocabulary as
// household_directory.active_products, so a task names its product the way the
// household header reads it. Drives the form dropdown and the per-line badges.
export const PRODUCTS = [
  { value: 'auto',           label: 'Auto',          short: 'AUTO' },
  { value: 'ho',             label: 'Homeowners',    short: 'HO' },
  { value: 'renters',        label: 'Renters',       short: 'RENTERS' },
  { value: 'condo',          label: 'Condo',         short: 'CONDO' },
  { value: 'landlord',       label: 'Landlord',      short: 'LANDLORD' },
  { value: 'pup',            label: 'Umbrella',      short: 'UMBRELLA' },
  { value: 'boat',           label: 'Boat',          short: 'BOAT' },
  { value: 'specialty_auto', label: 'Specialty Auto',short: 'SPEC AUTO' },
  { value: 'life',           label: 'Life',          short: 'LIFE' },
  { value: 'manufactured',   label: 'Manufactured',  short: 'MFG HOME' },
  { value: 'other',          label: 'Other',         short: 'OTHER' },
];
export const PRODUCT_MAP = Object.fromEntries(PRODUCTS.map(p => [p.value, p]));
// Short uppercase code for a badge, e.g. 'ho' → 'HO'. Null when unset.
export const productShort = p => p ? (PRODUCT_MAP[p]?.short || String(p).toUpperCase()) : null;

// Lanes in work-order. `licensed: true` means only a licensed agent can WORK the
// task (anyone, including the front desk, can still log it). Plain labels so any
// employee can tell at a glance who does what.
export const LANES = [
  { value: 'licensed', label: 'Coverage & Price', licensed: true,  hint: 'Premium questions & coverage changes — a licensed agent must do these. Work them first, while fresh.' },
  { value: 'portal',   label: 'Policy Changes',   licensed: true,  hint: 'Add/remove a car, mortgage company, billing, address — a licensed agent must make these changes.' },
  { value: 'clerical', label: 'Quick Tasks',      licensed: false, hint: 'ID cards, documents, confirmations — the front desk can do these. Close out last.' },
];

export const LANE_MAP = Object.fromEntries(LANES.map(l => [l.value, l]));

export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

const ACTIVE_STATUSES = ['open', 'in_progress', 'blocked'];

// Service-task SLA: the culture is "finish within 24h, faster if possible." We
// run a 24h timer from creation rather than a manual due date.
export const SLA_HOURS = 24;
export function slaMsLeft(createdAt) {
  if (!createdAt) return null;
  return new Date(createdAt).getTime() + SLA_HOURS * 3600000 - Date.now();
}

// Sort inside a group: priority, then oldest first — the oldest task is closest
// to breaching its 24h SLA, so it's worked first.
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });
}

// Work-scope filter for the batch — "mine" routes licensed work to the rep it's
// assigned to, "unassigned" surfaces the cold pool to claim, "all" is the shop view.
export const SCOPES = [
  { value: 'all',        label: 'All' },
  { value: 'mine',       label: 'Mine' },
  { value: 'unassigned', label: 'Unassigned' },
];

// The batch view. Returns the flat active list plus a type-grouped, due-sorted
// structure ready to render as the Service Batch.
export function useServiceTasks(agencyId, { assignedTo, includeDone = false, scope = 'all', employeeId } = {}) {
  const query = useQuery({
    queryKey: ['service_tasks', agencyId, assignedTo, includeDone, scope, employeeId],
    enabled: !!agencyId,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase.from('service_tasks').select('*').eq('agency_id', agencyId);
      if (assignedTo) q = q.eq('assigned_to_id', assignedTo);
      if (scope === 'mine' && employeeId) q = q.eq('assigned_to_id', employeeId);
      if (scope === 'unassigned') q = q.is('assigned_to_id', null);
      if (!includeDone) q = q.in('status', ACTIVE_STATUSES);
      const { data, error } = await q.order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const tasks = query.data || [];

  // Group by task_type, each group sorted; groups ordered by lane work-order
  // then by type within the lane.
  const groups = (() => {
    const byType = {};
    for (const t of tasks) {
      (byType[t.task_type] ||= []).push(t);
    }
    return TASK_TYPES
      .filter(t => byType[t.value]?.length)
      .map(t => ({ ...t, tasks: sortTasks(byType[t.value]) }))
      .sort((a, b) => {
        const la = LANES.findIndex(l => l.value === a.lane);
        const lb = LANES.findIndex(l => l.value === b.lane);
        return la - lb;
      });
  })();

  // Past the 24h SLA = overdue.
  const overdue = tasks.filter(t => { const ms = slaMsLeft(t.created_at); return ms != null && ms < 0; }).length;

  return { ...query, tasks, groups, overdue };
}

export function useCreateServiceTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task) => {
      // Resolve the customer to a household at log time — creating one on the
      // spot if they're not on any work list — so the customer is immediately
      // searchable and the task links to the exact household (no waiting on a
      // principal rebuild). Later uploads canonicalize the name by policy number.
      let householdId = task.householdId ?? null;
      if (!householdId && task.customerName && task.agencyId) {
        const { data } = await supabase.rpc('get_or_create_household', {
          p_agency_id: task.agencyId, p_name: task.customerName, p_phone: task.customerPhone ?? null,
        });
        householdId = data ?? null;
      }
      const { error } = await supabase.from('service_tasks').insert({
        agency_id: task.agencyId,
        task_type: task.taskType || 'other',
        title: task.title,
        detail: task.detail ?? null,
        status: task.status || 'open',
        priority: task.priority || 'normal',
        requires_license: task.requiresLicense ?? false,
        policy_no: task.policyNo ?? null,
        product: task.product ?? null,
        customer_name: task.customerName ?? null,
        customer_phone: task.customerPhone ?? null,
        household_id: householdId,
        due_date: task.dueDate ?? null,
        assigned_to_id: task.assignedTo ?? null,
        source: task.source || 'inbound_call',
        // Link back to the renewal/cancel call this came off, and flag when it
        // was resolved live on that call (vs. queued cold for the batch).
        source_case_type: task.sourceCaseType ?? null,
        source_case_id: task.sourceCaseId ?? null,
        resolved_on_call: task.resolvedOnCall ?? false,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_tasks'] }),
  });
}

// Reverse link: the service tasks that came off a given renewal/cancel case.
// service_tasks already stamps source_case_type/source_case_id at log time, so
// the case detail can show "what was raised here" without any new schema.
export function useCaseServiceTasks(caseType, caseId) {
  return useQuery({
    queryKey: ['case_service_tasks', caseType, caseId],
    enabled: !!caseType && !!caseId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select('id, task_type, title, status, priority, created_at, completed_at, resolved_on_call')
        .eq('source_case_type', caseType)
        .eq('source_case_id', caseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpdateServiceTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase.from('service_tasks').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_tasks'] }),
  });
}

// Front-desk callback intake. Reads a compliance-safe projection (name, phone,
// rep, coarse reason — no premium/coverage) via a SECURITY DEFINER function, so
// even the unlicensed front desk can identify an inbound caller and route them.
export function useExpectedCallbacks(agencyId) {
  return useQuery({
    queryKey: ['expected_callbacks', agencyId],
    enabled: !!agencyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fd_expected_callbacks');
      if (error) throw error;
      return data || [];
    },
  });
}

// Completion velocity — how fast service tasks get cleared, so the agency can
// watch the curve bend over time. Pulls every task completed in the window with
// its created/completed stamps; the UI buckets them into a per-day median
// time-to-done. The whole point of the live SLA timer is to drive this down.
export function useServiceTaskVelocity(agencyId, days = 14) {
  return useQuery({
    queryKey: ['service_task_velocity', agencyId, days],
    enabled: !!agencyId,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from('service_tasks')
        .select('created_at, completed_at')
        .eq('agency_id', agencyId)
        .eq('status', 'done')
        .gte('completed_at', since)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

// Log a returned call → routes a high-priority callback task to the rep who left
// the voicemail and clears the awaiting-callback flag (all definer-side).
export function useLogCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseType, caseId, note }) => {
      const { error } = await supabase.rpc('fd_log_callback', {
        p_case_type: caseType, p_case_id: caseId, p_note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expected_callbacks'] });
      qc.invalidateQueries({ queryKey: ['service_tasks'] });
    },
  });
}
