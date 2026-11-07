-- Quick Send: the owner can now edit the asked-first script and the text (Texts & Scripts
-- page). Each send keeps the exact wording it used next to its version.
alter table public.rate_check_invites
  add column if not exists script_text  text,
  add column if not exists message_text text;

NOTIFY pgrst, 'reload schema';
