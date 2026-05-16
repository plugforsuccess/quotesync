-- rate_limits is an internal rate-limiting table written only by the
-- create-lead edge function via the service-role key (service_role has
-- BYPASSRLS, so it is unaffected). No browser/client role has any reason
-- to read or write it. Enabling RLS with no policies denies anon and
-- authenticated entirely while leaving the edge function working.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
