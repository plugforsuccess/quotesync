-- Drop the "Premium you quoted them" prompt from the remaining save tactics
-- (company_transfer was flipped in 20260702110000).
--
-- On the confirmed-save path the accepted quote IS saved_premium, so the
-- at-call field is duplicate entry. Its only unique value — preserving the
-- quote on calls that end lost/undecided, where saved_premium never gets
-- written — feeds a dataset nothing in the app reads today (offered_premium
-- has no consumers). Principal's call: remove the friction; if lost-quote
-- analytics are ever built, re-enable per-tactic (this is config, not code)
-- and build the report that reads it together.
--
-- competitor_match keeps captures_competitor, so the "Held vs. competitor
-- quote" tactic still records the competitor's name and quote — only the
-- redundant our-premium box goes away.
-- (Applied to the hosted project on 2026-07-02; kept here so the migration
-- lineage matches the live config.)

UPDATE public.intervention_types
SET captures_premium = false
WHERE code IN ('requote_deductible', 'requote_coverage', 'bundle', 'competitor_match');
