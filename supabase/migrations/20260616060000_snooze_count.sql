-- ============================================================================
-- snooze_count — track how many times a case has been snoozed
-- ============================================================================
-- Snooze guardrails: a case can only be deferred when its deadline is far
-- enough out, and a snooze can never park it within 14 days of that deadline.
-- This counter backs the remaining guardrail — surfacing repeatedly-snoozed
-- ("parked") cases to the principal so snooze can't become a quiet hiding place.
-- ============================================================================
alter table public.renewal_cases add column if not exists snooze_count integer not null default 0;
alter table public.pending_cases add column if not exists snooze_count integer not null default 0;
