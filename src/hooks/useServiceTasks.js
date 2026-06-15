// src/hooks/useServiceTasks.js
// First-class admin/service task queue — the batchable work behind the
// Operating Playbook's "Afternoon — SERVICE BATCH". Tasks are logged the moment
// a call lands and cleared later in one protected block, grouped by type and
// sorted by due date. Backed by the service_tasks table.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// task_type is the batch key. `lane` groups types by where the work happens, so
// the block can be sequenced (judgment first, then mechanical, then clerical).
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

// Lanes in work-order: licensed judgment while fresh, mechanical portal edits
// for momentum, quick clerical to close out.
export const LANES = [
  { value: 'licensed', label: 'Licensed judgment',   hint: 'Needs a license — coverage & rate. Work these first, while fresh.' },
  { value: 'portal',   label: 'Carrier-portal edits', hint: 'Mechanical changes — batch all of one type back-to-back.' },
  { value: 'clerical', label: 'Quick clerical',       hint: 'Docs, ID cards, confirmations — close out with low energy.' },
];

export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

const ACTIVE_STATUSES = ['open', 'in_progress', 'blocked'];

// Sort inside a group: priority, then due date (soonest/past-due first, nulls
// last), then creation order.
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    const da = a.due_date || '9999-12-31';
    const db = b.due_date || '9999-12-31';
    if (da !== db) return da.localeCompare(db);
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
      const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false });
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

  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter(t => t.due_date && t.due_date < today).length;

  return { ...query, tasks, groups, overdue };
}

export function useCreateServiceTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task) => {
      const { error } = await supabase.from('service_tasks').insert({
        agency_id: task.agencyId,
        task_type: task.taskType || 'other',
        title: task.title,
        detail: task.detail ?? null,
        status: task.status || 'open',
        priority: task.priority || 'normal',
        requires_license: task.requiresLicense ?? false,
        policy_no: task.policyNo ?? null,
        customer_name: task.customerName ?? null,
        customer_phone: task.customerPhone ?? null,
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
