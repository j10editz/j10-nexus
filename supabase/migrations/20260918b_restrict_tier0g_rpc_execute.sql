BEGIN;

REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) TO authenticated, service_role;

COMMIT;
