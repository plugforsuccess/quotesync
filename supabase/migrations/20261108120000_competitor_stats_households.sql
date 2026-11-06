-- Competing agents: "We've seen N of their customers" counted every uploaded page,
-- so one household that sent an auto and a home policy, then sent both again twice,
-- showed as 6 customers. Count households instead (by phone number, else by lead),
-- and leave repeat uploads (duplicate_of) out of every figure.
create or replace view public.competitor_agent_stats with (security_invoker = true) as
 SELECT c.id, c.agency_id, c.carrier, c.agent_name, c.agency_name, c.phone, c.email, c.address, c.agent_code,
    c.book_ownership, c.starred, c.notes, c.first_seen_at, c.last_seen_at,
    count(DISTINCT coalesce(r.phone, r.lead_id::text, r.id::text)) AS rate_checks,
    array_remove(array_agg(DISTINCT "left"(r.zip, 5)), NULL::text) AS zips,
    array_remove(array_agg(DISTINCT r.policy_type), NULL::text) AS policy_types,
    round(avg(r.annual_premium), 2) AS avg_annual_premium,
    count(r.id) FILTER (WHERE r.status = ANY (ARRAY['won'::text, 'lost'::text])) AS quoted,
    count(r.id) FILTER (WHERE r.status = 'won'::text) AS wins,
    round(100.0 * count(r.id) FILTER (WHERE r.status = 'won'::text)::numeric / NULLIF(count(r.id) FILTER (WHERE r.status = ANY (ARRAY['won'::text, 'lost'::text])), 0)::numeric, 1) AS win_rate_pct,
    round(avg(r.delta) FILTER (WHERE r.status = 'won'::text), 2) AS avg_savings_when_won,
    COALESCE(sum(r.annual_premium), 0::numeric) AS total_annual_premium_seen
   FROM competitor_agents c
     LEFT JOIN rate_checks r ON r.competitor_agent_id = c.id AND NOT r.is_test AND r.duplicate_of IS NULL
  WHERE NOT c.is_test
  GROUP BY c.id;

NOTIFY pgrst, 'reload schema';
