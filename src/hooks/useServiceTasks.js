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
  // Policy Changes (portal — a licensed agent makes the change)
  { value: 'mortgagee', label: 'Mortgagee / Lienholder', icon: '🏦', lane: 'portal',    color: '#3B82F6' },
  { value: 'vehicle',   label: 'Add / Remove Vehicle',   icon: '🚗', lane: 'portal',    color: '#0EA5E9' },
  { value: 'driver',    label: 'Add / Remove Driver',    icon: '🧑', lane: 'portal',    color: '#06B6D4' },
  { value: 'billing',   label: 'Billing Change',         icon: '💳', lane: 'portal',    color: '#F59E0B' },
  { value: 'payment',   label: 'Payment / Make a Payment', icon: '💵', lane: 'portal',  color: '#84CC16' },
  { value: 'address',   label: 'Address / Contact Update', icon: '📍', lane: 'portal',  color: '#14B8A6' },
  // Coverage & Price (licensed — work first)
  { value: 'premium',   label: 'Premium Question',       icon: '💲', lane: 'licensed',  color: '#EF4444' },
  { value: 'coverage',  label: 'Coverage Change',        icon: '🛡️', lane: 'licensed',  color: '#8B5CF6' },
  { value: 'insurance_review', label: 'Insurance Review', icon: '🧐', lane: 'licensed', color: '#6366F1' },
  { value: 'reinstatement', label: 'Reinstatement',      icon: '♻️', lane: 'licensed',  color: '#F97316' },
  { value: 'terminate', label: 'Cancel / Terminate Policy', icon: '🚫', lane: 'licensed', color: '#DC2626' },
  // Quick Tasks (clerical — the front desk can close these out)
  { value: 'claim',     label: 'Claim / FNOL',           icon: '📋', lane: 'clerical',  color: '#EAB308' },
  { value: 'id_cards',  label: 'ID Cards / Proof of Ins.', icon: '🪪', lane: 'clerical', color: '#10B981' },
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
// Time left on the 24h SLA. Accepts a task (preferred — so the timer can be
// paused while 'waiting on customer') or a bare created_at string. While a task
// is paused (sla_paused_at set), the live pause grows with the clock, freezing
// the time-left; banked pause (sla_pause_ms) pushes the deadline out.
export function slaMsLeft(taskOrCreatedAt) {
  const t = typeof taskOrCreatedAt === 'string' ? { created_at: taskOrCreatedAt } : (taskOrCreatedAt || {});
  if (!t.created_at) return null;
  const banked = Number(t.sla_pause_ms || 0);
  const livePause = t.sla_paused_at ? (Date.now() - new Date(t.sla_paused_at).getTime()) : 0;
  return new Date(t.created_at).getTime() + SLA_HOURS * 3600000 + banked + livePause - Date.now();
}

// Sort inside a group: a follow-up that's come due floats to the very top
// (soonest first) — a scheduled promise that's now due is the most
// time-sensitive work in the group, mirroring how the lead queue surfaces due
// follow-ups. After that: priority, then oldest first — the oldest task is
// closest to breaching its 24h SLA, so it's worked first.
function sortTasks(tasks) {
  const now = Date.now();
  const followUpDue = t => t.follow_up_at && new Date(t.follow_up_at).getTime() <= now;
  return [...tasks].sort((a, b) => {
    const da = followUpDue(a);
    const db = followUpDue(b);
    if (da !== db) return da ? -1 : 1;
    if (da && db) {
      const fa = new Date(a.follow_up_at).getTime();
      const fb = new Date(b.follow_up_at).getTime();
      if (fa !== fb) return fa - fb; // soonest-due first
    }
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

// Contact-attempt logging on a service task — so the team can see a task is
// being actively worked (e.g. "left a voicemail at 10am") before it's done.
export const TASK_ATTEMPT_METHODS = [
  { value: 'phone',     label: 'Phone' },
  { value: 'text',      label: 'Text' },
  { value: 'email',     label: 'Email' },
  { value: 'in_person', label: 'In person' },
  { value: 'portal',    label: 'Portal' },
  { value: 'other',     label: 'Other' },
];
export const TASK_ATTEMPT_RESULTS = [
  { value: 'no_answer',     label: 'No answer' },
  { value: 'left_voicemail',label: 'Left voicemail' },
  { value: 'reached',       label: 'Reached customer' },
  { value: 'sent',          label: 'Sent (text/email)' },
  { value: 'in_progress',   label: 'Working on it' },
  { value: 'wrong_number',  label: 'Wrong number' },
  { value: 'busy',          label: 'Busy' },
  { value: 'disconnected',  label: 'Disconnected' },
  { value: 'other',         label: 'Other' },
];
export const TASK_ATTEMPT_RESULT_MAP = Object.fromEntries(TASK_ATTEMPT_RESULTS.map(r => [r.value, r.label]));

// Quick-pick follow-up offsets (days from today) for the "set a follow-up"
// shortcuts on a task — covers the common cadence (tomorrow, a few days, a
// week, two weeks) so a rep doesn't have to hand-pick a date.
export const FOLLOW_UP_QUICK_DAYS = [1, 3, 7, 14];

// Build a <input type="datetime-local"> value (YYYY-MM-DDTHH:mm) for N days
// from now at a sensible default hour (9am local), so the quick-picks land on
// a workable morning slot. Uses local time components — datetime-local is
// timezone-naive and rendered in the user's local zone.
export function followUpInDays(days, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

  // Past the 24h SLA = overdue. Parked ('waiting on customer') tasks are paused,
  // so they never count as overdue — the clock is on the customer, not us.
  const overdue = tasks.filter(t => {
    if (t.status === 'blocked') return false;
    const ms = slaMsLeft(t); return ms != null && ms < 0;
  }).length;

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
        // Full policy list for tasks that span more than one (e.g. an insurance
        // review across auto + home). Defaults to the single primary policy.
        policy_nos: (task.policyNos && task.policyNos.length)
          ? task.policyNos
          : (task.policyNo ? [task.policyNo] : []),
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
    // Refresh every surface that lists tasks — the batch, the per-case list on
    // the case detail (so a just-logged task shows immediately), and the
    // per-household list — not just the Service Batch query.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_tasks'] });
      qc.invalidateQueries({ queryKey: ['service_tasks_done'] });
      qc.invalidateQueries({ queryKey: ['case_service_tasks'] });
      qc.invalidateQueries({ queryKey: ['household_service_tasks'] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_tasks'] });
      qc.invalidateQueries({ queryKey: ['service_tasks_done'] });
      qc.invalidateQueries({ queryKey: ['case_service_tasks'] });
      qc.invalidateQueries({ queryKey: ['household_service_tasks'] });
    },
  });
}

// The contact-attempt log for one task — newest first. Employee names are
// resolved by the caller (the modal already has the member roster).
export function useServiceTaskAttempts(taskId) {
  return useQuery({
    queryKey: ['service_task_attempts', taskId],
    enabled: !!taskId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_task_attempts')
        .select('id, method, result, note, attempted_at, employee_id')
        .eq('service_task_id', taskId)
        .order('attempted_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

// Log a contact attempt on a task. Records the attempt and denormalizes the
// count / last result onto the task (so the batch list shows activity), and
// flips an untouched 'open' task to 'in_progress' to signal it's being worked.
export function useLogServiceTaskAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, agencyId, employeeId, method, result, note, prevCount = 0, prevStatus, followUpAt, waiting, task }) => {
      const attemptedAt = new Date().toISOString();
      const { error } = await supabase.from('service_task_attempts').insert({
        service_task_id: taskId, agency_id: agencyId, employee_id: employeeId ?? null,
        method: method || 'phone', result, note: (note || '').trim() || null, attempted_at: attemptedAt,
      });
      if (error) throw error;
      const taskUpdate = {
        attempt_count: (prevCount || 0) + 1,
        last_attempt_at: attemptedAt,
        last_attempt_result: result,
      };
      // Optional: schedule the next try, and/or park the task 'waiting on
      // customer' (pauses the SLA). Otherwise an untouched task starts working.
      if (followUpAt !== undefined) taskUpdate.follow_up_at = followUpAt || null;
      if (waiting) {
        taskUpdate.status = 'blocked';
        if (!task?.sla_paused_at) taskUpdate.sla_paused_at = attemptedAt;
      } else if (prevStatus === 'open') {
        taskUpdate.status = 'in_progress';
      }
      const { error: uerr } = await supabase.from('service_tasks').update(taskUpdate).eq('id', taskId);
      if (uerr) throw uerr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service_task_attempts', vars.taskId] });
      qc.invalidateQueries({ queryKey: ['service_task', vars.taskId] });
      qc.invalidateQueries({ queryKey: ['service_tasks'] });
      qc.invalidateQueries({ queryKey: ['service_tasks_done'] });
      qc.invalidateQueries({ queryKey: ['household_service_tasks'] });
    },
  });
}

// Park a task 'waiting on customer' (pauses the SLA) or resume it. Resuming
// banks the paused time so the 24h deadline shifts out by however long it waited.
export function useSetServiceTaskWaiting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, waiting, task }) => {
      const updates = {};
      if (waiting) {
        updates.status = 'blocked';
        if (!task?.sla_paused_at) updates.sla_paused_at = new Date().toISOString();
      } else {
        updates.status = (task?.attempt_count > 0) ? 'in_progress' : 'open';
        if (task?.sla_paused_at) {
          updates.sla_pause_ms = Number(task.sla_pause_ms || 0) + (Date.now() - new Date(task.sla_paused_at).getTime());
          updates.sla_paused_at = null;
        }
      }
      const { error } = await supabase.from('service_tasks').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_tasks'] });
      qc.invalidateQueries({ queryKey: ['service_task'] });
      qc.invalidateQueries({ queryKey: ['household_service_tasks'] });
    },
  });
}

// Set or clear a task's follow-up time without logging an attempt.
export function useSetServiceTaskFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, followUpAt }) => {
      const { error } = await supabase.from('service_tasks').update({ follow_up_at: followUpAt || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_tasks'] });
      qc.invalidateQueries({ queryKey: ['service_task'] });
    },
  });
}

// Per-person service activity for a date — attempts logged, tasks in progress,
// tasks cleared, and median time-to-done. The principal's "is the desk being
// actively worked" view, mirroring the retention rep-activity panel.
export function useServiceActivity(agencyId, dateStr) {
  return useQuery({
    queryKey: ['service_activity', agencyId, dateStr],
    enabled: !!agencyId && !!dateStr,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date(dateStr + 'T00:00:00');
      const end = new Date(start); end.setDate(start.getDate() + 1);
      const startIso = start.toISOString(); const endIso = end.toISOString();

      const [{ data: attempts }, { data: doneToday }, { data: active }] = await Promise.all([
        supabase.from('service_task_attempts')
          .select('employee_id, result')
          .eq('agency_id', agencyId).gte('attempted_at', startIso).lt('attempted_at', endIso),
        supabase.from('service_tasks')
          .select('completed_by_id, created_at, completed_at')
          .eq('agency_id', agencyId).eq('status', 'done')
          .gte('completed_at', startIso).lt('completed_at', endIso),
        supabase.from('service_tasks')
          .select('assigned_to_id, status')
          .eq('agency_id', agencyId).in('status', ['open', 'in_progress', 'blocked']),
      ]);

      const byRep = {};
      const rep = (id) => (byRep[id] ||= { attempts: 0, reached: 0, cleared: 0, inProgress: 0, _ttd: [] });
      for (const a of attempts || []) { if (!a.employee_id) continue; const r = rep(a.employee_id); r.attempts++; if (a.result === 'reached') r.reached++; }
      for (const t of doneToday || []) {
        if (!t.completed_by_id) continue; const r = rep(t.completed_by_id); r.cleared++;
        if (t.created_at && t.completed_at) r._ttd.push(new Date(t.completed_at) - new Date(t.created_at));
      }
      for (const t of active || []) { if (!t.assigned_to_id) continue; if (t.status !== 'blocked') rep(t.assigned_to_id).inProgress++; }

      for (const r of Object.values(byRep)) {
        if (r._ttd.length) { const s = [...r._ttd].sort((a, b) => a - b); r.medianMs = s[Math.floor(s.length / 2)]; }
        delete r._ttd;
      }
      return byRep; // keyed by employee id
    },
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
