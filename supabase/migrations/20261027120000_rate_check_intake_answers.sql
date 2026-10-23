-- Rate Checks: answers to the "Still to ask" questions on the drawer's What to quote
-- card (tickets or accidents, loan payoff year, …), keyed by the question text:
--   { "Tickets or accidents in the last 3 years": { "answer": "no", "at": "…" },
--     "Loan payoff year for the 2021 Land Rover Velar": { "answer": "2027", "at": "…" } }
-- A "yes" may carry "details". Staff write it through the table's existing update grant.

alter table public.rate_checks
  add column if not exists intake_answers jsonb not null default '{}'::jsonb;

comment on column public.rate_checks.intake_answers is 'Producer''s answers to the Still to ask questions, keyed by question text.';

notify pgrst, 'reload schema';
