# J10 NEXUS — Production Forward Migration Preflight Audit

**Audit Target:** Production Supabase Database  
**Target Forward Migration Chain:** `20260913_remote_tenant_activation.sql` through `20260924_align_channel_metrics_and_atomic_reservations.sql` (13 migrations)  
**Certification Baseline:** Commit `8f746c4` (420 tests, 65 test files, 152 routes, 5 distinct backend PIDs certified)  
**Protocol Invariant:** Strictly **NON-DESTRUCTIVE / READ-ONLY**.  
**Prohibited Operations:** Zero `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `CREATE`, `DO` blocks, temporary objects, or transaction-state mutations.

---

## 1. Outcome Classification Guide

Every preflight query evaluates the database against one of four deterministic states:

| Outcome | Meaning | Action Required |
|---|---|---|
| **`PASS`** | The object, constraint, column, or signature already exists and strictly satisfies the architectural contract. | No action needed for this check. |
| **`MIGRATION PENDING`** | The table or column does not exist yet because the corresponding forward migration has not been applied. | Normal expected state before forward rollout. Migration will create it cleanly. |
| **`BLOCKER — DATA REPAIR REQUIRED`** | Data in an existing table will actively violate an upcoming constraint, check, or non-null assertion. | **HALT ROLLOUT.** Data must be cleaned/repaired in production before applying the migration. |
| **`MANUAL REVIEW REQUIRED`** | Environmental prerequisite (e.g. founder account UUID or external credentials) requires manual verification. | Verify target account IDs or confirm if specific migration was already completed manually. |

---

## 2. Expected 13-Migration Forward Sequence

The production forward chain must be applied in this exact alphabetical/chronological order:

| Step | Migration Filename | Target Subsystem / Core Scope |
|---|---|---|
| **01** | `20260913_remote_tenant_activation.sql` | Workspaces, memberships, contacts, inbox threads/messages, and multi-tenant RLS |
| **02** | `20260914_financial_integrity_ledger_hardening.sql` | `payment_ledger` RESTRICT constraints, checkout isolation, and `provider_mode` |
| **03** | `20260915_identity_platform_roles_invitations.sql` | Profiles, platform roles, invitations, and workspace ownership safety guard |
| **04** | `20260915b_atomic_founder_ownership_transfer.sql` | Dedicated CEO account transfer for J10 NEXUS HQ |
| **05** | `20260916_global_tenantization_launch_integrity.sql` | `workspace_subscriptions`, RLS purge, atomic `increment_workspace_usage` |
| **06** | `20260917_tier0f_runtime_tenant_certification.sql` | Subscription provenance, legacy CRM compatibility view, webhook RLS hardening |
| **07** | `20260918_tier0g_saas_billing.sql` | `workspace_usage_records`, FOR UPDATE concurrency locking, trial activation |
| **08** | `20260919_tier1_revenue_loop.sql` | CRM proposals, bookings, `revenue_ledger`, and deal stage constraints |
| **09** | `20260920_tier2_agency_commercialization.sql` | Multi-client workspace isolation, agency branding, and custom domain routing |
| **10** | `20260921_tier3_omnichannel_operations.sql` | 9-channel inbox routing, SLA policies, and collision lease locking |
| **11** | `20260922_tier4_governed_ai_agent_platform.sql` | AI agent versions, execution budgets, execution traces, and approval gates |
| **12** | `20260923_canonical_authorization_and_cross_tenant_integrity_repair.sql` | Canonical authorization repair, composite foreign keys on traces and gates |
| **13** | `20260924_align_channel_metrics_and_atomic_reservations.sql` | 9-channel usage metric check, atomic quota pre-reservation & spend admission |

---

## 3. PHASE A — Always-Safe Catalog Queries (System Catalogs Only)

> **Safety Notice:** Phase A queries inspect only PostgreSQL system catalogs (`information_schema` and `pg_catalog`). They **cannot fail** with `relation does not exist`, even if none of the forward-migration tables have been created yet.

### A1. Applied Migration Ledger Audit
Inspect which migrations are recorded in the Supabase schema migration tracking table:

```sql
-- Query A1.1: List all recorded migration versions in chronological order
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version ASC;

-- Query A1.2: Check forward chain application count (20260913 through 20260924)
SELECT 
  count(*) AS applied_forward_count,
  array_agg(version ORDER BY version ASC) AS applied_versions
FROM supabase_migrations.schema_migrations
WHERE version >= '20260913';
```
- **Outcome Assessment:**
  - If `applied_forward_count = 13`: `PASS` (All forward migrations already recorded).
  - If `applied_forward_count < 13`: `MIGRATION PENDING` (Apply missing migrations in sequence).

---

### A2. Core Table Existence Audit
Inspect whether target forward-chain tables exist in the `public` schema:

```sql
SELECT 
  t_req.table_name,
  CASE WHEN t_act.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MIGRATION PENDING' END AS status
FROM (
  VALUES 
    ('workspaces'),
    ('workspace_memberships'),
    ('profiles'),
    ('platform_roles'),
    ('workspace_invitations'),
    ('workspace_subscriptions'),
    ('workspace_usage_records'),
    ('workspace_quota_reservations'),
    ('contacts'),
    ('crm_contacts'),
    ('crm_deals'),
    ('crm_proposals'),
    ('crm_bookings'),
    ('payment_checkouts'),
    ('payment_ledger'),
    ('revenue_ledger'),
    ('inbox_threads'),
    ('inbox_messages'),
    ('inbox_channel_locks'),
    ('omnichannel_routing_rules'),
    ('omnichannel_sla_policies'),
    ('ai_agent_versions'),
    ('ai_agent_budgets'),
    ('ai_agent_traces'),
    ('ai_agent_trace_steps'),
    ('ai_agent_approval_gates'),
    ('ai_agent_evaluations'),
    ('ai_agent_roi_attributions'),
    ('agency_branding'),
    ('agency_custom_domains'),
    ('agency_portal_tokens')
) AS t_req(table_name)
LEFT JOIN information_schema.tables t_act
  ON t_act.table_schema = 'public' 
 AND t_act.table_name = t_req.table_name
ORDER BY t_req.table_name;
```

---

### A3. Required Column Existence & Data Type Audit
Verify whether required columns and defaults exist across target tables without querying user rows:

```sql
SELECT 
  c_req.table_name,
  c_req.column_name,
  COALESCE(c_act.data_type, 'NOT PRESENT') AS data_type,
  COALESCE(c_act.is_nullable, 'N/A') AS is_nullable,
  CASE WHEN c_act.column_name IS NOT NULL THEN 'PASS' ELSE 'MIGRATION PENDING' END AS status
FROM (
  VALUES 
    ('workspaces', 'id'),
    ('workspaces', 'owner_user_id'),
    ('workspaces', 'workspace_type'),
    ('workspaces', 'plan'),
    ('workspace_subscriptions', 'workspace_id'),
    ('workspace_subscriptions', 'status'),
    ('workspace_subscriptions', 'provenance'),
    ('workspace_subscriptions', 'monthly_message_limit'),
    ('workspace_subscriptions', 'messages_used_this_period'),
    ('workspace_usage_records', 'workspace_id'),
    ('workspace_usage_records', 'metric_name'),
    ('workspace_usage_records', 'quantity'),
    ('workspace_quota_reservations', 'workspace_id'),
    ('workspace_quota_reservations', 'reservation_id'),
    ('workspace_quota_reservations', 'reserved_units'),
    ('workspace_quota_reservations', 'settled_units'),
    ('workspace_quota_reservations', 'status'),
    ('payment_ledger', 'checkout_id'),
    ('payment_ledger', 'provider_mode'),
    ('payment_checkouts', 'provider_mode'),
    ('ai_agent_budgets', 'daily_spend_limit_cents'),
    ('ai_agent_budgets', 'monthly_spend_limit_cents')
) AS c_req(table_name, column_name)
LEFT JOIN information_schema.columns c_act
  ON c_act.table_schema = 'public' 
 AND c_act.table_name = c_req.table_name 
 AND c_act.column_name = c_req.column_name
ORDER BY c_req.table_name, c_req.column_name;
```

---

### A4. Integrity Constraints & Critical Indexes Audit
Verify presence of database check constraints, unique constraints, and indexes:

```sql
-- Query A4.1: Constraints Audit
SELECT 
  c_req.constraint_name,
  COALESCE(con.conrelid::regclass::text, 'NOT PRESENT') AS table_name,
  CASE WHEN con.oid IS NOT NULL THEN 'PASS' ELSE 'MIGRATION PENDING' END AS status,
  COALESCE(pg_get_constraintdef(con.oid), 'N/A') AS constraint_definition
FROM (
  VALUES 
    ('chk_workspace_usage_metric_name'),
    ('chk_workspace_usage_records_quantity'),
    ('chk_workspace_subscriptions_provenance'),
    ('uq_workspace_reservation'),
    ('payment_ledger_checkout_id_fkey'),
    ('ai_agent_budgets_workspace_id_agent_id_key')
) AS c_req(constraint_name)
LEFT JOIN pg_constraint con
  ON con.connamespace = 'public'::regnamespace
 AND con.conname = c_req.constraint_name;

-- Query A4.2: Critical Indexes Audit
SELECT 
  idx_req.index_name,
  COALESCE(idx.tablename, 'NOT PRESENT') AS table_name,
  CASE WHEN idx.indexname IS NOT NULL THEN 'PASS' ELSE 'MIGRATION PENDING' END AS status
FROM (
  VALUES 
    ('idx_workspace_subscriptions_ws'),
    ('idx_workspace_subscriptions_status'),
    ('idx_workspace_usage_records_period'),
    ('idx_workspace_quota_reservations_lookup'),
    ('idx_ai_agent_budgets_lookup')
) AS idx_req(index_name)
LEFT JOIN pg_indexes idx
  ON idx.schemaname = 'public'
 AND idx.indexname = idx_req.index_name;
```

---

### A5. Atomic RPC & Stored Function Signatures Audit
Verify that required functions exist with expected security attributes (`SECURITY DEFINER`):

```sql
SELECT 
  f_req.function_name,
  CASE WHEN p.oid IS NOT NULL THEN 'PASS' ELSE 'MIGRATION PENDING' END AS status,
  COALESCE(pg_get_function_identity_arguments(p.oid), 'NOT PRESENT') AS arguments,
  COALESCE(pg_get_function_result(p.oid), 'NOT PRESENT') AS return_type,
  CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' WHEN false THEN 'SECURITY INVOKER' ELSE 'N/A' END AS security_type
FROM (
  VALUES 
    ('reserve_workspace_quota_atomic'),
    ('settle_workspace_quota_atomic'),
    ('release_workspace_quota_atomic'),
    ('record_agent_execution_spend_atomic'),
    ('record_verified_workspace_usage'),
    ('increment_workspace_usage'),
    ('has_workspace_role'),
    ('is_platform_admin'),
    ('is_platform_founder')
) AS f_req(function_name)
LEFT JOIN pg_proc p
  ON p.pronamespace = 'public'::regnamespace
 AND p.proname = f_req.function_name;
```

---

### A6. Row-Level Security (RLS) State & Grants Audit
Verify RLS enablement and execution privileges:

```sql
-- Query A6.1: Table RLS Status
SELECT 
  t_req.table_name,
  COALESCE(c.relrowsecurity, false) AS rls_enabled,
  COALESCE(c.relforcerowsecurity, false) AS rls_enforced,
  CASE 
    WHEN c.oid IS NULL THEN 'MIGRATION PENDING'
    WHEN c.relrowsecurity = true THEN 'PASS'
    ELSE 'BLOCKER — DATA REPAIR REQUIRED'
  END AS status
FROM (
  VALUES 
    ('workspaces'),
    ('workspace_subscriptions'),
    ('workspace_usage_records'),
    ('workspace_quota_reservations'),
    ('payment_ledger'),
    ('payment_checkouts'),
    ('ai_agent_budgets'),
    ('ai_agent_traces')
) AS t_req(table_name)
LEFT JOIN pg_class c
  ON c.relnamespace = 'public'::regnamespace
 AND c.relname = t_req.table_name;

-- Query A6.2: RPC Execution Grants for authenticated and service_role
SELECT 
  routine_name, 
  grantee, 
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'reserve_workspace_quota_atomic',
    'settle_workspace_quota_atomic',
    'release_workspace_quota_atomic',
    'record_agent_execution_spend_atomic',
    'record_verified_workspace_usage',
    'increment_workspace_usage'
  )
  AND grantee IN ('authenticated', 'service_role')
ORDER BY routine_name, grantee;
```

---

## 4. PHASE B — Conditional Data Integrity Pre-Scans (Table-Gated)

> **Execution Requirement:** Execute each query in Phase B **only** after Phase A confirms that the referenced table already exists. If the table is not present, skip the check (status is `MIGRATION PENDING`).

---

### B1. Ambiguous Active Workspace Memberships
> **Prerequisite:** Run only if Phase A confirms `public.workspace_memberships` exists.  
> **Source Migration:** `20260916_global_tenantization_launch_integrity.sql` (Lines 22–38)

```sql
SELECT 
  user_id,
  count(DISTINCT workspace_id) AS active_workspaces_count,
  array_agg(workspace_id) AS workspace_ids
FROM public.workspace_memberships
WHERE status = 'active'
GROUP BY user_id
HAVING count(DISTINCT workspace_id) > 1;
```
- **Outcome Assessment:**
  - `0 rows`: **`PASS`** (No users span multiple active workspaces; migration 20260916 will succeed).
  - `> 0 rows`: **`BLOCKER — DATA REPAIR REQUIRED`** (Migration 20260916 will raise an exception and abort rollout).

---

### B2. Nullable `payment_ledger.checkout_id` Orphan Scan
> **Prerequisite:** Run only if Phase A confirms `public.payment_ledger` exists.  
> **Source Migration:** `20260914_financial_integrity_ledger_hardening.sql` (Line 45)

```sql
SELECT count(*) AS orphan_payment_ledger_count
FROM public.payment_ledger
WHERE checkout_id IS NULL;
```
- **Outcome Assessment:**
  - `0 rows`: **`PASS`** (`ALTER COLUMN checkout_id SET NOT NULL` will succeed).
  - `> 0 rows`: **`BLOCKER — DATA REPAIR REQUIRED`** (Migration 20260914 will fail on null constraint violation).

---

### B3. Unsupported Metric Names in `workspace_usage_records`
> **Prerequisite:** Run only if Phase A confirms `public.workspace_usage_records` exists.  
> **Source Migration:** `20260924_align_channel_metrics_and_atomic_reservations.sql` (Lines 25–44)

```sql
SELECT 
  metric_name, 
  count(*) AS invalid_metric_count
FROM public.workspace_usage_records
WHERE metric_name NOT IN (
  'whatsapp_outbound',
  'whatsapp_inbound',
  'sms_outbound',
  'email_outbound',
  'instagram_outbound',
  'messenger_outbound',
  'webchat_outbound',
  'website_outbound',
  'crm_outbound',
  'whatsapp_group_outbound',
  'omnichannel_outbound',
  'ai_tokens',
  'ai_agent_run',
  'campaign_broadcast',
  'workflow_execution'
)
GROUP BY metric_name;
```
- **Outcome Assessment:**
  - `0 rows`: **`PASS`** (`chk_workspace_usage_metric_name` check constraint will apply cleanly).
  - `> 0 rows`: **`BLOCKER — DATA REPAIR REQUIRED`** (Migration 20260924 will fail on check constraint validation).

---

### B4. Zero-Quantity Records in `workspace_usage_records`
> **Prerequisite:** Run only if Phase A confirms `public.workspace_usage_records` exists.  
> **Source Migration:** `20260924_align_channel_metrics_and_atomic_reservations.sql` (Lines 54–60)

```sql
SELECT count(*) AS zero_quantity_count
FROM public.workspace_usage_records
WHERE quantity = 0;
```
- **Outcome Assessment:**
  - `0 rows`: **`PASS`** (`chk_workspace_usage_records_quantity` check constraint `CHECK (quantity != 0)` will succeed).
  - `> 0 rows`: **`BLOCKER — DATA REPAIR REQUIRED`** (Zero-quantity records will prevent constraint creation).

---

### B5. Founder Ownership-Transfer Account Prerequisites
> **Prerequisite:** Run only if Phase A confirms `auth.users` and `public.workspaces` exist.  
> **Source Migration:** `20260915b_atomic_founder_ownership_transfer.sql` (Lines 28–46)

```sql
SELECT 
  (SELECT count(*) FROM auth.users WHERE id = '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa') AS source_founder_in_auth,
  (SELECT count(*) FROM auth.users WHERE id = 'f44f4cc4-30bc-4d78-98e3-0b63ff63e08f') AS dest_ceo_in_auth,
  (SELECT count(*) FROM public.workspaces WHERE id = 'ce593364-2aaf-47e4-a1d2-2272775747c4') AS target_workspace_exists,
  (SELECT count(*) FROM public.workspaces WHERE id = 'ce593364-2aaf-47e4-a1d2-2272775747c4' AND owner_user_id = '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa') AS target_owned_by_source;
```
- **Outcome Assessment:**
  - All values = `1`: **`PASS`** (Environment matches 20260915b transfer prerequisites).
  - Any value = `0`: **`MANUAL REVIEW REQUIRED`** (Verify whether migration `20260915b` was already executed or should be skipped if target environment uses distinct user IDs).

---

### B6. Subscription Provenance Distribution Audit
> **Prerequisite:** Run only if Phase A confirms `public.workspace_subscriptions` exists.  
> **Source Migration:** `20260917_tier0f_runtime_tenant_certification.sql` (Lines 306–360)

```sql
SELECT 
  COALESCE(provenance, 'NULL') AS provenance,
  status,
  count(*) AS subscription_count
FROM public.workspace_subscriptions
GROUP BY provenance, status
ORDER BY count(*) DESC;
```
- **Outcome Assessment:**
  - Shows existing subscriptions categorized as `stripe`, `trial`, `internal_grant`, or `none`.
  - Notice: Any unverified subscriptions (`provenance = 'none'`) will be deactivated to `status = 'none'` by migration 20260917.

---

### B7. Quota Reservation Uniqueness & Idempotency Duplicate Scan
> **Prerequisite:** Run only if Phase A confirms `public.workspace_quota_reservations` exists.  
> **Source Migration:** `20260924_align_channel_metrics_and_atomic_reservations.sql`

```sql
SELECT 
  workspace_id, 
  reservation_id, 
  count(*) AS duplicate_count
FROM public.workspace_quota_reservations
GROUP BY workspace_id, reservation_id
HAVING count(*) > 1;
```
- **Outcome Assessment:**
  - `0 rows`: **`PASS`** (Composite key `(workspace_id, reservation_id)` is strictly unique).
  - `> 0 rows`: **`BLOCKER — DATA REPAIR REQUIRED`** (Duplicate reservation IDs must be deduplicated before enforcing uniqueness).
