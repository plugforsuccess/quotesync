-- Atomic rate-limit counter.
--
-- The edge functions' checkRateLimit reads rate_limits, then writes count+1 in
-- a separate request, so concurrent requests lose updates (6 simultaneous
-- rate-check calls left count = 3 and none were limited). This does the
-- window reset + increment in one upsert and returns whether the caller is
-- still within the limit. Service role only.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count    = case when r.reset_at <= now() then 1 else r.count + 1 end,
    reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning count <= p_limit;
$$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
