# J10 NEXUS ROADMAP ACCEPTANCE MATRIX

## Acceptance Standards
Status values:
- Implemented: Code written with production route and persistence callers.
- Locally Verified: Verified through automated integration test suites and local execution.
- Provider-Test Verified: Verified against provider sandbox or test credentials.
- Production Verified: Verified in live production deployment with real external infrastructure.
- Blocked: Dependent on missing production credentials or pending remote cloud deployment.

## Capability Matrix

| Tier | Capability | Actual UI Entry Point | Production Handler | Persistence / Provider Integration | Test Evidence | Status |
|---|---|---|---|---|---|---|
| Tier 0G | Workspace Subscriptions & Checkout | /dashboard/settings/billing | app/api/billing/checkout/route.ts, app/api/billing/subscription/route.ts | public.workspace_subscriptions, Stripe Checkout API | tests/billing/subscription-api.test.ts | Locally Verified |
| Tier 0G | Single-Use Free Trial Enforcement | /dashboard/settings/billing | app/api/billing/trial/route.ts | public.workspace_subscriptions (has_used_trial) | tests/billing/tier0g-saas-billing.test.ts | Locally Verified |
| Tier 0G | Plan Entitlements & Feature Flags | /dashboard/settings/billing | lib/billing/entitlements.ts (isWorkspaceFeatureEntitled, assertWorkspaceFeature) | public.workspace_subscriptions, lib/billing/plans.ts | tests/billing/entitlements.test.ts | Locally Verified |
| Tier 0G | Quota Pre-Reservation & Atomic Deductions | /dashboard/settings/billing | lib/billing/entitlements.ts (reserveWorkspaceQuota, releaseWorkspaceQuota) | public.workspace_quota_reservations, record_verified_workspace_usage RPC | tests/billing/tier0g-saas-billing.test.ts | Locally Verified |
| Tier 0G | Stripe Customer Portal & Payment Recovery | /dashboard/settings/billing | app/api/billing/portal/route.ts | Stripe Billing Portal API, customer session | tests/billing/subscription-api.test.ts | Locally Verified |
| Tier 0G | Dunning Lifecycle & Grace Period Enforcement | /dashboard/settings/billing | lib/billing/dunning.ts, app/api/webhooks/stripe/route.ts | public.workspace_subscriptions (dunning_status, grace_period_end) | tests/billing/stripe-webhook.test.ts | Locally Verified |
| Tier 0G | Verified Usage with Concurrent Transaction Locks | /dashboard/settings/billing | app/api/billing/usage/route.ts, lib/billing/entitlements.ts | public.workspace_usage_records, PostgreSQL FOR UPDATE locking | tests/billing/independent-session-concurrency.test.ts | Blocked (Multi-session PostgreSQL database required; PGlite is single-instance in Node) |
| Tier 1 | Inbound WhatsApp Lead Webhook | /dashboard/inbox | app/api/webhooks/whatsapp/[endpointKey]/route.ts | public.inbox_threads, public.inbox_messages | tests/whatsapp/inbound-webhook.test.ts | Locally Verified |
| Tier 1 | Autonomous Conversation Qualification | /dashboard/inbox | app/api/integrations/[id]/whatsapp/conversations/[sender]/qualify/route.ts | lib/whatsapp/lead-qualification.ts, public.crm_contacts | tests/whatsapp/lead-qualification.test.ts | Locally Verified |
| Tier 1 | CRM Contact & Deal Pipeline Creation | /dashboard/crm | app/api/crm/route.ts, app/api/revenue/loop/route.ts | public.crm_contacts, public.crm_deals | tests/revenue/tier1-revenue-loop.test.ts | Locally Verified |
| Tier 1 | Proposal & Booking Generation | /dashboard/crm | app/api/crm/proposals/route.ts, app/api/crm/bookings/route.ts | public.crm_proposals, public.crm_bookings | tests/revenue/tier1-revenue-loop.test.ts | Locally Verified |
| Tier 1 | External Calendar Reservation Separation | /dashboard/crm | lib/revenue/bookings.ts (confirmExternalCalendarReservation) | public.crm_bookings (external_reservation_status) | tests/revenue/tier1-revenue-loop.test.ts | Locally Verified |
| Tier 1 | Stripe Checkout & Idempotent Retry Webhook | /dashboard/commerce | app/api/commerce/checkout/route.ts, app/api/webhooks/stripe/route.ts | Stripe Checkout API, public.revenue_ledger | tests/revenue/tier1-revenue-loop.test.ts | Locally Verified |
| Tier 1 | Revenue Ledger & Financial Attribution | /dashboard/finance | app/api/revenue/reporting/route.ts, app/api/finance/invoices/route.ts | public.revenue_ledger, public.finance_invoices | tests/revenue/tier1-revenue-loop.test.ts | Locally Verified |
| Tier 2 | Multi-Client Workspace Provisioning & Isolation | /dashboard/settings/agency | app/api/agency/clients/route.ts | public.workspaces, public.workspace_memberships | tests/agency/tier2-agency-commercialization.test.ts | Locally Verified |
| Tier 2 | Agency White-Label Branding & Themes | /dashboard/settings/agency | app/api/agency/branding/route.ts | public.agency_branding | tests/agency/tier2-agency-commercialization.test.ts | Locally Verified |
| Tier 2 | Custom Domain DNS Verification & SSL Gate | /dashboard/settings/agency | app/api/agency/domains/route.ts, app/api/agency/domains/verify/route.ts | public.agency_custom_domains, lib/agency/domains.ts | tests/agency/tier2-agency-commercialization.test.ts | Locally Verified |
| Tier 2 | Client Read-Only Secure Portal Access | /portal | app/api/agency/portal/route.ts | public.agency_portal_tokens | tests/agency/tier2-agency-commercialization.test.ts | Locally Verified |
| Tier 3 | 9-Channel Omnichannel Outbound Dispatch | /dashboard/inbox | app/api/omnichannel/dispatch/route.ts, lib/omnichannel/dispatch.ts | public.inbox_threads, public.inbox_messages | tests/omnichannel/tier3-omnichannel.test.ts | Locally Verified |
| Tier 3 | Server-Side Integration Credential Resolution | /dashboard/settings/integrations | lib/omnichannel/dispatch.ts (resolveWorkspaceChannelCredentials) | public.integrations, platform environment fallback | tests/omnichannel/tier3-omnichannel.test.ts | Locally Verified |
| Tier 3 | Shared Platform Fallback with Pre-Reservation | /dashboard/inbox | lib/omnichannel/dispatch.ts (executeOutboundDispatch) | reserveWorkspaceQuota, public.workspace_usage_records | tests/omnichannel/tier3-omnichannel.test.ts | Locally Verified |
| Tier 3 | Concurrent Reply Collision Locking | /dashboard/inbox | app/api/omnichannel/collision/route.ts, lib/omnichannel/collision.ts | public.inbox_channel_locks | tests/omnichannel/tier3-omnichannel.test.ts | Locally Verified |
| Tier 3 | Omnichannel Response SLA & Escalation | /dashboard/inbox | app/api/omnichannel/sla/route.ts, lib/omnichannel/sla.ts | public.inbox_sla_records | tests/omnichannel/tier3-omnichannel.test.ts | Locally Verified |
| Tier 3 | Delivery Callbacks & Honest Channel Availability | /dashboard/inbox | lib/omnichannel/dispatch.ts (updateOmnichannelDeliveryStatus) | public.inbox_messages (status, delivery_metadata) | tests/omnichannel/tier3-omnichannel.test.ts | Locally Verified |
| Tier 4 | Route-Connected Tool Permission Checks | /dashboard/settings/integrations | app/api/integrations/[id]/actions/route.ts, lib/governance/permissions.ts | public.ai_agent_permissions | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Route-Connected Agent Budget Enforcement | /dashboard/ai-employees | app/api/ai-tasks/[id]/run/route.ts, lib/governance/budgets.ts | public.ai_agent_budgets | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Model & Provider Passthrough to Inference | /dashboard/ai-employees | lib/ai/runtime.ts, lib/ai/providers/gemini.ts, lib/ai/providers/openai.ts | Google Gemini API, OpenAI API | tests/governance/tier4-governance.test.ts | Locally Verified |
| Tier 4 | Provider Usage Capture vs Labeled Estimates | /dashboard/ai-employees | lib/governance/runner.ts (executeGovernedAgentTask) | public.ai_agent_traces, public.ai_agent_trace_steps | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Atomic Spend Pre-Reservation Before Execution | /dashboard/ai-employees | lib/governance/runner.ts, lib/governance/budgets.ts | public.ai_agent_budgets, record_agent_execution_spend_atomic RPC | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Single-Use Payload-Bound Human Approval Gates | /dashboard/notifications | app/api/governance/approvals/route.ts, lib/governance/runner.ts | public.ai_agent_approval_gates | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Versioned Autonomous Evaluations | /dashboard/ai-employees | app/api/governance/evals/route.ts, lib/governance/evals.ts | public.ai_agent_evaluations, public.ai_agent_versions | tests/governance/tier4-governance.test.ts | Locally Verified |
| Tier 4 | Genuine ROI Attribution (Won Deals vs Labor) | /dashboard/overview | app/api/governance/roi/route.ts, lib/governance/roi.ts | public.ai_agent_roi_attributions | tests/governance/actual-routes-governance.test.ts | Locally Verified |

## Actual Repository Migration Manifest

All migrations are located in supabase/migrations/. Remote status is labeled Unknown because remote database credentials (DATABASE_URL / SUPABASE_URL) are not configured in the local execution environment.

| Sequence | Migration Filename | Prerequisite | Remote Applied Status |
|---|---|---|---|
| 01 | 20260820_day14b_integrations.sql | Base schema | Unknown |
| 02 | 20260820_day14c_integration_credentials.sql | 20260820_day14b | Unknown |
| 03 | 20260820_day14e_integration_catalog.sql | 20260820_day14c | Unknown |
| 04 | 20260820_day14g_webhook_foundation.sql | 20260820_day14e | Unknown |
| 05 | 20260820_day14h_external_trigger_adapter.sql | 20260820_day14g | Unknown |
| 06 | 20260820_day14i_external_action_adapter.sql | 20260820_day14h | Unknown |
| 07 | 20260821_day14j_integration_event_trigger.sql | 20260820_day14i | Unknown |
| 08 | 20260821_day14l_integration_observability_retry.sql | 20260821_day14j | Unknown |
| 09 | 20260824_day15h_provider_subscriptions.sql | 20260821_day14l | Unknown |
| 10 | 20260826_day16c_automation_versions.sql | 20260824_day15h | Unknown |
| 11 | 20260827_day16e_atomic_runtime_switch.sql | 20260826_day16c | Unknown |
| 12 | 20260829_day16f_workflow_lifecycle.sql | 20260827_day16e | Unknown |
| 13 | 20260829_day16g_runtime_step_history_fk.sql | 20260829_day16f | Unknown |
| 14 | 20260829_day16h_pgcrypto_checksum_schema.sql | 20260829_day16g | Unknown |
| 15 | 20260904_subscriptions_entitlements.sql | 20260829_day16h | Unknown |
| 16 | 20260905_company_knowledge.sql | 20260904 | Unknown |
| 17 | 20260906_marketing_campaigns.sql | 20260905 | Unknown |
| 18 | 20260907_finance_invoices.sql | 20260906 | Unknown |
| 19 | 20260908_workforce_hr.sql | 20260907 | Unknown |
| 20 | 20260909_website_funnels.sql | 20260908 | Unknown |
| 21 | 20260910_commerce_catalog_orders.sql | 20260909 | Unknown |
| 22 | 20260911_multi_tenant_persistence_ledger.sql | 20260910 | Unknown |
| 23 | 20260912_adversarial_tenant_integrity_recovery.sql | 20260911 | Unknown |
| 24 | 20260913_remote_tenant_activation.sql | 20260912 | Unknown |
| 25 | 20260914_financial_integrity_ledger_hardening.sql | 20260913 | Unknown |
| 26 | 20260915_identity_platform_roles_invitations.sql | 20260914 | Unknown |
| 27 | 20260915b_atomic_founder_ownership_transfer.sql | 20260915 | Unknown |
| 28 | 20260916_global_tenantization_launch_integrity.sql | 20260915b | Unknown |
| 29 | 20260917_tier0f_runtime_tenant_certification.sql | 20260916 | Unknown |
| 30 | 20260918_tier0g_saas_billing.sql | 20260917 | Unknown |
| 31 | 20260919_tier1_revenue_loop.sql | 20260918 | Unknown |
| 32 | 20260920_tier2_agency_commercialization.sql | 20260919 | Unknown |
| 33 | 20260921_tier3_omnichannel_operations.sql | 20260920 | Unknown |
| 34 | 20260922_tier4_governed_ai_agent_platform.sql | 20260921 | Unknown |
| 35 | 20260923_canonical_authorization_and_cross_tenant_integrity_repair.sql | 20260922 | Unknown |
| 36 | 20260924_align_channel_metrics_and_atomic_reservations.sql | 20260923 | Unknown |

## Read-Only Preflight Procedure

To inspect applied migration status on remote PostgreSQL without executing modifications, run the following read-only SQL queries:

```sql
-- 1. Check Supabase migration tracking table
SELECT version, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY version ASC;

-- 2. Check channel metric check constraint on workspace_usage_records
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_workspace_usage_metric_name';

-- 3. Check presence of atomic quota reservation and spend admission functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'record_verified_workspace_usage',
    'release_workspace_quota_atomic',
    'record_agent_execution_spend_atomic'
  );

-- 4. Check presence of workspace_quota_reservations table
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'workspace_quota_reservations';
```

## External Verification and Deployment Blockers

1. Remote PostgreSQL and Supabase Cloud: Forward migrations in supabase/migrations/ must be applied to the remote target database.
2. Live Stripe Webhook Secrets: STRIPE_WEBHOOK_SECRET and live Stripe API keys must be provisioned in the hosting environment for live checkout sessions.
3. WhatsApp Cloud API Live Webhook: Meta webhook subscription and permanent system user access token must be registered in Meta Developer Portal.
4. Hosting SSL Certificate Authority: Vercel or Cloudflare custom domain certificate API integration required to transition custom domain SSL from pending to verified.
5. Multi-Client PostgreSQL Connection Pooling: Independent concurrent transaction verification requires a live PostgreSQL instance with connection pooling.
