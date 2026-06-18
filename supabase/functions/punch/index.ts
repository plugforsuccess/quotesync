import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const AGENCY_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ── Rate limiting (in-memory, resets on cold start) ─────────────────────────
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (rec.count >= MAX_ATTEMPTS) return false;
  rec.count++;
  return true;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function deriveStatus(
  entry: {
    start_time?: string | null;
    end_time?: string | null;
    lunch_out?: string | null;
    lunch_in?: string | null;
  } | null
) {
  if (!entry || !entry.start_time) return "not_clocked_in";
  if (entry.end_time) return "clocked_out";
  if (entry.lunch_out && !entry.lunch_in) return "on_lunch";
  if (entry.lunch_in) return "back_from_lunch";
  return "clocked_in";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(ip)) {
      return jsonResponse(
        { error: "Too many attempts. Try again in a minute." },
        429
      );
    }

    const { action, pin } = await req.json();

    // ── Validate PIN ──────────────────────────────────────────────────────
    if (!pin || !/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: "Invalid PIN format" }, 400);
    }

    const { data: employee, error: empErr } = await supabase
      .from("employees")
      .select(
        "id, first_name, preferred_name, last_name, employment_status, auth_user_id, org_id"
      )
      .eq("punch_pin", pin)
      .eq("org_id", AGENCY_ORG_ID)
      .single();

    if (empErr || !employee) {
      return jsonResponse({ error: "PIN not recognised" }, 401);
    }

    if (employee.employment_status !== "active") {
      return jsonResponse({ error: "Employee not active" }, 403);
    }

    if (!employee.auth_user_id) {
      return jsonResponse(
        { error: "Employee account not fully configured. Contact your admin." },
        403
      );
    }

    const displayName = (employee.preferred_name || employee.first_name || employee.last_name || "").trim();
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    }); // YYYY-MM-DD ET
    const nowTime = new Date().toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }); // HH:MM

    // Monday of current week
    const todayDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    const dayOfWeek = todayDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() + diff);
    const weekStartStr = weekStart.toLocaleDateString("en-CA");

    if (action === "status") {
      // Return current punch state for today
      const { data: entry } = await supabase
        .from("employee_time_entries")
        .select("start_time, lunch_out, lunch_in, end_time, hours_worked")
        .eq("employee_user_id", employee.auth_user_id)
        .eq("work_date", today)
        .maybeSingle();

      return jsonResponse({
        name: displayName,
        today,
        entry: entry || null,
        currentStatus: deriveStatus(entry),
      });
    }

    // ── Execute punch ─────────────────────────────────────────────────────
    const validActions = ["clock_in", "lunch_out", "lunch_in", "clock_out"];
    if (!validActions.includes(action)) {
      return jsonResponse({ error: "Invalid action" }, 400);
    }

    // Get or create today's entry
    const { data: existing } = await supabase
      .from("employee_time_entries")
      .select("*")
      .eq("employee_user_id", employee.auth_user_id)
      .eq("work_date", today)
      .maybeSingle();

    const fieldMap: Record<string, string> = {
      clock_in: "start_time",
      lunch_out: "lunch_out",
      lunch_in: "lunch_in",
      clock_out: "end_time",
    };
    const field = fieldMap[action];

    // Guard: prevent out-of-order punches
    const guards: Record<string, boolean> = {
      clock_in: !existing?.start_time,
      lunch_out: existing?.start_time && !existing?.lunch_out,
      lunch_in: existing?.lunch_out && !existing?.lunch_in,
      clock_out: existing?.start_time && !existing?.end_time,
    };
    if (!guards[action]) {
      const msg: Record<string, string> = {
        clock_in: "Already clocked in today",
        lunch_out: "Must be clocked in first",
        lunch_in: "Must clock out for lunch first",
        clock_out: "Must be clocked in first",
      };
      return jsonResponse({ error: msg[action] }, 409);
    }

    if (!existing) {
      // Create new entry row
      const { error: insertErr } = await supabase
        .from("employee_time_entries")
        .insert({
          org_id: employee.org_id,
          employee_user_id: employee.auth_user_id,
          week_start: weekStartStr,
          work_date: today,
          location: "OFFICE",
          code: "REG",
          [field]: nowTime,
        });
      if (insertErr) throw new Error(insertErr.message);
    } else {
      const { error: updateErr } = await supabase
        .from("employee_time_entries")
        .update({ [field]: nowTime })
        .eq("id", existing.id);
      if (updateErr) throw new Error(updateErr.message);
    }

    // Re-fetch to get computed hours_worked
    const { data: updated } = await supabase
      .from("employee_time_entries")
      .select("start_time, lunch_out, lunch_in, end_time, hours_worked")
      .eq("employee_user_id", employee.auth_user_id)
      .eq("work_date", today)
      .single();

    return jsonResponse({
      success: true,
      name: displayName,
      action,
      time: nowTime,
      entry: updated,
      currentStatus: deriveStatus(updated),
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
