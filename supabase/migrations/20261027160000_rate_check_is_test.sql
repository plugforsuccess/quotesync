-- Rate Checks: test and QA records stay in the database but out of every staff
-- view and count. is_test on scans, links sent and competing agents; the views
-- behind the scoreboard, events, win map and competing agents skip flagged rows.

alter table public.rate_checks        add column if not exists is_test boolean not null default false;
alter table public.rate_check_invites add column if not exists is_test boolean not null default false;
alter table public.competitor_agents  add column if not exists is_test boolean not null default false;

-- The QA records made while building Rate Check (555 test numbers, "QA" names).
update public.rate_checks set is_test = true
 where first_name ~* '^qa (dup )?test \(ignore\)$' and phone like '404555%';
update public.rate_check_invites set is_test = true
 where first_name = 'Testy' and producer_name = 'QA Probe';
update public.competitor_agents set is_test = true
 where agent_name = 'Jordan Placeholder';

create or replace view public.competitor_agent_stats with (security_invoker = true) as
 SELECT c.id, c.agency_id, c.carrier, c.agent_name, c.agency_name, c.phone, c.email, c.address, c.agent_code,
    c.book_ownership, c.starred, c.notes, c.first_seen_at, c.last_seen_at,
    count(r.id) AS rate_checks,
    array_remove(array_agg(DISTINCT "left"(r.zip, 5)), NULL::text) AS zips,
    array_remove(array_agg(DISTINCT r.policy_type), NULL::text) AS policy_types,
    round(avg(r.annual_premium), 2) AS avg_annual_premium,
    count(r.id) FILTER (WHERE r.status = ANY (ARRAY['won'::text, 'lost'::text])) AS quoted,
    count(r.id) FILTER (WHERE r.status = 'won'::text) AS wins,
    round(100.0 * count(r.id) FILTER (WHERE r.status = 'won'::text)::numeric / NULLIF(count(r.id) FILTER (WHERE r.status = ANY (ARRAY['won'::text, 'lost'::text])), 0)::numeric, 1) AS win_rate_pct,
    round(avg(r.delta) FILTER (WHERE r.status = 'won'::text), 2) AS avg_savings_when_won,
    COALESCE(sum(r.annual_premium), 0::numeric) AS total_annual_premium_seen
   FROM competitor_agents c
     LEFT JOIN rate_checks r ON r.competitor_agent_id = c.id AND NOT r.is_test
  WHERE NOT c.is_test
  GROUP BY c.id;

create or replace view public.rate_check_events with (security_invoker = true) as
 SELECT agency_id, event_name, max(created_at) AS last_used_at, count(*) AS invites
   FROM rate_check_invites
  WHERE event_name IS NOT NULL AND NOT is_test
  GROUP BY agency_id, event_name;

create or replace view public.rate_check_invite_stats with (security_invoker = true) as
 WITH inv AS (
         SELECT rate_check_invites.agency_id,
            COALESCE(rate_check_invites.event_name, ''::text) AS event_name,
            COALESCE(rate_check_invites.producer_name, ''::text) AS producer_name,
            count(*) AS invites,
            count(*) FILTER (WHERE rate_check_invites.opened_at IS NOT NULL) AS opened,
            count(*) FILTER (WHERE rate_check_invites.upload_count > 0) AS uploaded
           FROM rate_check_invites
          WHERE NOT rate_check_invites.is_test
          GROUP BY rate_check_invites.agency_id, (COALESCE(rate_check_invites.event_name, ''::text)), (COALESCE(rate_check_invites.producer_name, ''::text))
        ), rc AS (
         SELECT rate_checks.agency_id,
            COALESCE(rate_checks.event_name, ''::text) AS event_name,
            COALESCE(rate_checks.producer_name, ''::text) AS producer_name,
            count(*) AS rate_checks,
            count(*) FILTER (WHERE rate_checks.status = ANY (ARRAY['quoted'::text, 'won'::text, 'lost'::text, 'bound'::text])) AS quoted,
            count(*) FILTER (WHERE rate_checks.status = ANY (ARRAY['won'::text, 'bound'::text])) AS won,
            count(*) FILTER (WHERE rate_checks.status = 'bound'::text) AS bound,
            COALESCE(sum(rate_checks.bound_premium) FILTER (WHERE rate_checks.status = 'bound'::text), 0::numeric) AS bound_premium
           FROM rate_checks
          WHERE (rate_checks.invite_id IS NOT NULL OR rate_checks.producer_id IS NOT NULL OR rate_checks.event_name IS NOT NULL)
            AND rate_checks.duplicate_of IS NULL AND NOT rate_checks.is_test
          GROUP BY rate_checks.agency_id, (COALESCE(rate_checks.event_name, ''::text)), (COALESCE(rate_checks.producer_name, ''::text))
        )
 SELECT COALESCE(inv.agency_id, rc.agency_id) AS agency_id,
    COALESCE(inv.event_name, rc.event_name) AS event_name,
    COALESCE(inv.producer_name, rc.producer_name) AS producer_name,
    COALESCE(inv.invites, 0::bigint) AS invites,
    COALESCE(inv.opened, 0::bigint) AS opened,
    COALESCE(inv.uploaded, 0::bigint) AS uploaded,
    COALESCE(rc.rate_checks, 0::bigint) AS rate_checks,
    COALESCE(rc.quoted, 0::bigint) AS quoted,
    COALESCE(rc.won, 0::bigint) AS won,
    COALESCE(rc.bound, 0::bigint) AS bound,
    COALESCE(rc.bound_premium, 0::numeric) AS bound_premium
   FROM inv
     FULL JOIN rc ON inv.agency_id = rc.agency_id AND inv.event_name = rc.event_name AND inv.producer_name = rc.producer_name;

create or replace view public.rate_check_win_map with (security_invoker = true) as
 SELECT agency_id, carrier, policy_type, "left"(zip, 5) AS zip5,
    count(*) FILTER (WHERE status = ANY (ARRAY['won'::text, 'lost'::text])) AS quoted,
    count(*) FILTER (WHERE status = 'won'::text) AS wins,
    round(100.0 * count(*) FILTER (WHERE status = 'won'::text)::numeric / NULLIF(count(*) FILTER (WHERE status = ANY (ARRAY['won'::text, 'lost'::text])), 0)::numeric, 1) AS win_rate_pct,
    round(avg(delta) FILTER (WHERE status = 'won'::text), 2) AS avg_savings_when_won
   FROM rate_checks
  WHERE NOT is_test
  GROUP BY agency_id, carrier, policy_type, ("left"(zip, 5));

notify pgrst, 'reload schema';
