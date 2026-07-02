-- Stop prompting for "Premium you quoted them" on Company transfer calls.
--
-- A company transfer executes as the new renewal, so the offer becomes the
-- confirmed policy's premium: the case already carries the renewal offer
-- (premium) and the save flow captures what the customer actually paid
-- (saved_premium), making the at-call quote duplicate entry. The field's
-- unique value — preserving the quote on calls that DON'T end in a confirmed
-- save (lost / no decision) — doesn't apply to transfers, so the prompt stays
-- on the re-quote / bundle / competitor tactics where that gap is real.
--
-- The prompt is data-driven (InterventionPicker shows it when a selected
-- tactic has captures_premium), so this is config, not code.
-- (Applied to the hosted project on 2026-07-02; kept here so the migration
-- lineage matches the live config.)

UPDATE public.intervention_types
SET captures_premium = false
WHERE code = 'company_transfer';
