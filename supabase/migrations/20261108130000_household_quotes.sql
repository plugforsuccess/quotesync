-- Sales workspace: a household's policies quoted the same day are ONE quote, with a line
-- per policy (auto 6-month, home 12-month), instead of one quote per policy.
-- Each line carries its rate_check_id so it can be updated or removed on its own.
-- Rate Checks bound with Allstate still become binds, as before.
create or replace function public.rate_check_to_sales()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  product text := coalesce(new.policy_type, 'auto');
  items int := case when coalesce(new.policy_type, 'auto') = 'auto' then greatest(coalesce(new.vehicle_count, 1), 1) else 1 end;
  -- Rate Checks keep premium annual; Allstate auto is a 6-month term.
  term int := case when coalesce(new.policy_type, 'auto') = 'auto' then 6 else 12 end;
  q uuid; b uuid; day date; line jsonb; qday date;
begin
  if coalesce(new.is_test, false) then return null; end if;

  -- The quote this policy is already on (its own, or as a line on the household's).
  select id into q from sales_quotes
    where rate_check_id = new.id or lines @> jsonb_build_array(jsonb_build_object('rate_check_id', new.id::text))
    limit 1;

  if new.allstate_premium is not null and new.quoted_at is not null then
    qday := (new.quoted_at at time zone 'America/New_York')::date;
    line := jsonb_build_object('product', product, 'term_months', term,
      'premium', round(new.allstate_premium * term / 12, 2), 'rate_check_id', new.id::text);
    -- Not on a quote yet: join the household's open quote from the same day, if there is one.
    if q is null and new.lead_id is not null then
      select id into q from sales_quotes
        where lead_id = new.lead_id and status = 'open' and quoted_on = qday and rate_check_id is not null
        order by created_at limit 1;
    end if;
    if q is null then
      insert into sales_quotes (agency_id, logged_by, lead_id, rate_check_id, customer_name, quoted_on, products, lines)
      values (new.agency_id, new.quoted_by, new.lead_id, new.id, new.first_name, qday, array[product], jsonb_build_array(line))
      returning id into q;
    else
      update sales_quotes set
        lines = coalesce((select jsonb_agg(l) from jsonb_array_elements(lines) l
                          where coalesce(l->>'rate_check_id', '') <> new.id::text
                            and not (rate_check_id = new.id and l->>'rate_check_id' is null)), '[]'::jsonb)
                || jsonb_build_array(line),
        lead_id = coalesce(lead_id, new.lead_id)
      where id = q;
    end if;
  elsif tg_op = 'UPDATE' and old.allstate_premium is not null and new.allstate_premium is null and q is not null then
    -- Quote taken back: drop this policy's line; an open quote with nothing left goes.
    update sales_quotes set lines = coalesce((select jsonb_agg(l) from jsonb_array_elements(lines) l
                                              where coalesce(l->>'rate_check_id', '') <> new.id::text), '[]'::jsonb)
      where id = q and status = 'open';
    delete from sales_quotes where id = q and status = 'open' and jsonb_array_length(lines) = 0;
    select id into q from sales_quotes where id = q;
  end if;

  -- Bound with Allstate is a bind. One household's Rate Checks bound the same day
  -- share a bind, so Auto + Home reads as a preferred bundle.
  if new.bound_at is not null and new.bound_carrier ilike '%allstate%' then
    if not exists (select 1 from bound_items where rate_check_id = new.id) then
      day := (new.bound_at at time zone 'America/New_York')::date;
      if new.lead_id is not null then
        select id into b from sales_binds
          where lead_id = new.lead_id and bound_on = day and source = 'rate_check' limit 1;
      end if;
      if b is null then
        insert into sales_binds (agency_id, logged_by, lead_id, quote_id, customer_name, bound_on, source)
        values (new.agency_id, new.bound_by, new.lead_id, q, new.first_name, day, 'rate_check')
        returning id into b;
      end if;
      insert into bound_items (agency_id, bind_id, product, item_count, prior_policy_items, rate_check_id, premium, term_months)
      values (new.agency_id, b, product, items, items, new.id,
              case when new.bound_premium is null then null else round(new.bound_premium * term / 12, 2) end, term);
    end if;
    update sales_quotes set status = 'bound', closed_at = coalesce(closed_at, now()), lost_reason = null
      where id = q and status <> 'bound';
  elsif tg_op = 'UPDATE' and exists (select 1 from bound_items where rate_check_id = new.id) then
    -- Unbound, or bound elsewhere after all: take it back out.
    select bind_id into b from bound_items where rate_check_id = new.id;
    delete from bound_items where rate_check_id = new.id;
    delete from sales_binds sb where sb.id = b and not exists (select 1 from bound_items where bind_id = b);
    update sales_quotes set status = 'open', closed_at = null where id = q and status = 'bound';
  end if;
  return null;
end $$;

NOTIFY pgrst, 'reload schema';
