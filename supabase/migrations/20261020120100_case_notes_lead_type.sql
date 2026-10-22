-- Rate Check: allow lead-scoped case notes.
-- rate-check-outcome writes a "Rate check WON: ..." note against the lead
-- (case_type = 'lead', case_id = leads.id). Existing case types unchanged.
alter table public.case_notes drop constraint if exists case_notes_case_type_check;
alter table public.case_notes add constraint case_notes_case_type_check
  check (case_type = any (array['renewal'::text, 'cancel'::text, 'service'::text, 'lead'::text]));
