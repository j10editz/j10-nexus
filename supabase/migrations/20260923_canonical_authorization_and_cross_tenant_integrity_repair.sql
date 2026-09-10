BEGIN;

-- Tier 3 and Tier 4 canonical authorization, FORCE RLS, grants, and
-- workspace-scoped integrity were incorporated directly into the corrected
-- 20260921 and 20260922 migrations before production rollout. This migration
-- intentionally records their historical reconciliation without recreating or
-- mutating the already-correct production objects.

COMMIT;
