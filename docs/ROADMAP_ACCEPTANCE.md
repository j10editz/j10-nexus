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
| Tier 0G | Plan Entitlements & Feature Flags | /dashboard/settings/billing | lib/billing/entitlements.ts (isWorkspaceFeatureEntitled) | public.workspace_subscriptions, lib/billing/plans.ts | tests/billing/entitlements.test.ts | Locally Verified |
| Tier 0G | Quota Pre-Reservation & Atomic Deductions | /dashboard/settings/billing | lib/billing/entitlements.ts (reserveWorkspaceQuota) | public.workspace_usage_records, record_verified_workspace_usage RPC | tests/billing/tier0g-saas-billing.test.ts | Locally Verified |
| Tier 0G | Stripe Customer Portal & Payment Recovery | /dashboard/settings/billing | app/api/billing/portal/route.ts | Stripe Billing Portal API, customer session | tests/billing/subscription-api.test.ts | Locally Verified |
| Tier 0G | Dunning Lifecycle & Grace Period Enforcement | /dashboard/settings/billing | lib/billing/dunning.ts, app/api/webhooks/stripe/route.ts | public.workspace_subscriptions (dunning_status, grace_period_end) | tests/billing/stripe-webhook.test.ts | Locally Verified |
| Tier 0G | Verified Usage with Concurrent Transaction Locks | /dashboard/settings/billing | app/api/billing/usage/route.ts, lib/billing/entitlements.ts | public.workspace_usage_records, PostgreSQL FOR UPDATE locking | tests/billing/independent-session-concurrency.test.ts | Locally Verified |
| Tier 1 | Inbound WhatsApp Lead Webhook | /dashboard/inbox | app/api/webhooks/whatsapp/[endpointKey]/route.ts | public.inbox_threads, public.inbox_messages | tests/whatsapp/inbound-webhook.test.ts | Locally Verified |
| Tier 1 | Autonomous Conversation Qualification | /dashboard/inbox | app/api/integrations/[id]/whatsapp/conversations/[sender]/qualify/route.ts | lib/whatsapp/qualification.ts, public.crm_contacts | tests/whatsapp/lead-qualification.test.ts | Locally Verified |
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
| Tier 4 | Provider Usage Capture vs Labeled Estimates | /dashboard/ai-employees | lib/governance/runner.ts (runGovernedInference) | public.ai_agent_traces, public.ai_agent_trace_steps | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Atomic Spend Pre-Reservation Before Execution | /dashboard/ai-employees | lib/governance/runner.ts, lib/governance/budgets.ts | public.ai_agent_budgets (recordAgentExecutionSpend) | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Single-Use Payload-Bound Human Approval Gates | /dashboard/notifications | app/api/governance/approvals/route.ts, lib/governance/runner.ts | public.ai_agent_approval_gates | tests/governance/actual-routes-governance.test.ts | Locally Verified |
| Tier 4 | Versioned Autonomous Evaluations | /dashboard/ai-employees | app/api/governance/evals/route.ts, lib/governance/evals.ts | public.ai_agent_evaluations, public.ai_agent_versions | tests/governance/tier4-governance.test.ts | Locally Verified |
| Tier 4 | Genuine ROI Attribution (Won Deals vs Labor) | /dashboard/overview | app/api/governance/roi/route.ts, lib/governance/roi.ts | public.ai_agent_roi_attributions | tests/governance/actual-routes-governance.test.ts | Locally Verified |

## External Verification and Deployment Blockers
1. Remote PostgreSQL and Supabase Cloud: Forward migrations in supabase/migrations/ must be applied to the remote target database.
2. Live Stripe Webhook Secrets: STRIPE_WEBHOOK_SECRET and live Stripe API keys must be provisioned in the hosting environment for live checkout sessions.
3. WhatsApp Cloud API Live Webhook: Meta webhook subscription and permanent system user access token must be registered in Meta Developer Portal.
4. Hosting SSL Certificate Authority: Vercel or Cloudflare custom domain certificate API integration required to transition custom domain SSL from pending to verified.
