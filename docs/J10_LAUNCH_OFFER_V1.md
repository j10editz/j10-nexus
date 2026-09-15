# J10 NEXUS — Launch Offer & Commercial Architecture V1

> **Document Version**: 1.0.0  
> **Status**: PROPOSAL FOR CTO & EXECUTIVE APPROVAL  
> **Target Product**: AI Receptionist + Lead Capture + Unified Inbox + CRM  
> **Effective Date**: Q4 2026

---

## 1. Executive Summary & Product Focus

J10 NEXUS is launching its first commercially sellable subscription offering. Rather than selling a diffuse collection of experimental AI agents or generic automation canvases, the core product delivers a singular, high-ROI business outcome:

$$\text{Inbound Lead Arrives} \longrightarrow \text{AI Receptionist Responds (11s)} \longrightarrow \text{Lead Qualified} \longrightarrow \text{Appointment Booked} \longrightarrow \text{Human Takes Over} \longrightarrow \text{Revenue Attributed}$$

The launch package tightly bundles four integrated modules:
1. **AI Receptionist**: 24/7 intelligent conversational response across Telegram and Web Chat with business knowledge retrieval.
2. **Lead Capture & Scoring**: Instant extraction of contact identity, service intent, and qualification scoring (0–100).
3. **Unified Inbox**: Real-time omnichannel message stream with seamless AI-to-human handoff, sentiment analysis, and unread management.
4. **Revenue CRM**: Automated pipeline progression from New Lead $\rightarrow$ Contacted $\rightarrow$ Qualified $\rightarrow$ Appointment $\rightarrow$ Proposal $\rightarrow$ Closed Won with Stripe payment link reconciliation.

---

## 2. Current Billing Capabilities Audit

An audit of the existing codebase confirms the following foundational billing infrastructure:

- **Stripe Checkout Integration** (`lib/stripe.ts`): Server-side Stripe Checkout Session creation for proposals and one-click invoice payment links.
- **Webhook Reconciliation** (`lib/integrations/webhooks/verification.ts`, `lib/revenue/loop-orchestrator.ts`): Verifies `stripe-signature` headers, parses `checkout.session.completed` events, updates deal stages to "Won", and logs entries in `payment_ledger`.
- **Workspace Entitlement Architecture** (`workspace_subscriptions` table): Supports tracking `tier`, `status` (`active`, `past_due`, `trialing`), `current_period_end`, and usage quotas.
- **Safety Boundary**: This proposal maintains existing Stripe production configuration unchanged. No production products or prices are modified without CTO sign-off.

---

## 3. Recommended Primary Launch Package: "J10 Growth" (PROPOSAL ONLY)

> **Important**: The $297/month price is an executive recommendation for future general availability. It is NOT implemented in Stripe. The provisional active pilot offer is the **Founder's 3 at $149/month**.

| Commercial Attribute | Specification | Rationale |
| :--- | :--- | :--- |
| **Package Name** | **J10 Growth (Revenue Core)** | Clear positioning for growing service businesses (clinics, consultancies, agencies, contractors). |
| **Monthly Subscription** | **$297 / month** (Proposal only — billed monthly) or **$237 / month** ($2,844 billed annually, 20% discount) | Sweet spot for SMBs where replacing or augmenting a single receptionist hour ($15–$25/hr) pays for itself in < 15 days. |
| **Optional Setup Fee** | **$495 one-time** (Standard Onboarding) | Covers custom knowledge base indexing, business tone tuning, and live Telegram connection verification. |
| **Included Workspaces** | **1 Workspace** | Standard single-tenant workspace. |
| **Team Member Seats** | **3 Included Members** (Owner, Receptionist, Sales/Provider) | Extra seats at $29/seat/month. |
| **Monthly AI Conversations** | **1,000 Active Conversations / month** | Ample for 30–50 customer inquiries per day. |
| **Monthly Lead Allowance** | **250 Captured & Qualified Leads / month** | High capacity before requiring tier expansion. |
| **Connected Channels** | **2 Active Channels** (Telegram Bot/Business + Web Chat Widget) | WhatsApp Business connection available as an add-on ($99/mo) upon carrier approval (Coming Later). |

---

## 4. Special Pilot Offer: "Founder's 3"

To secure initial client case studies, verified testimonials, and operational data, J10 NEXUS will offer a restricted pilot package for the first three paying businesses:

- **Pilot Subscription**: **$149 / month** (Lifetime grandfathered rate for the duration of continuous subscription).
- **Setup & Onboarding Fee**: **$0 (Waived)** in exchange for:
  - 1 weekly 20-minute feedback interview during Month 1.
  - Written case study permission and verified ROI metrics.
  - Video testimonial upon booking their first 10 appointments through J10.
- **Pilot Guarantee**: If J10 AI Receptionist fails to capture and qualify at least 15 leads in the first 30 days, 100% money-back guarantee.

---

## 5. Usage Quotas, Overage & Upgrade Rules

### A. Overage Handling & Soft Caps
To protect paying clients from catastrophic lead loss while guarding J10 against abuse:
- **Never Hard-Drop Leads**: When a client reaches 100% of their conversation allowance, the AI Receptionist continues responding.
- **Threshold Notifications**:
  - At **80% usage**: In-dashboard warning banner and email notification to workspace owner.
  - At **100% usage**: Grace period warning with 1-click upgrade button.
- **Overage Rate**: Additional conversations billed at **$0.15 / conversation** or automatic pro-rated upgrade to the Scale tier.

### B. Tier Upgrade Path

| Tier | Price | AI Convos | Leads | Channels | Seats |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Starter (Self-Serve)** | $99/mo | 300 | 75 | 1 (Web only) | 1 |
| **Growth (Launch Core)** | **$297/mo** | **1,000** | **250** | **2 (Telegram + Web)** | **3** |
| **Scale (Multi-Location)** | $597/mo | 3,000 | 1,000 | 4 (Telegram + Web + WhatsApp) | 10 |

---

## 6. Cancellation & Retention Policy

- **Self-Serve Cancellation**: Workspace owners can cancel subscription anytime via `/dashboard/settings`.
- **Data Export & Integrity**: Upon cancellation, CRM contacts, conversation history, and revenue ledger remain exportable via CSV for 60 days.
- **Grace Period**: 7-day grace period on failed payments before bot pause is enforced. AI switches to "Needs Attention" state, and incoming leads trigger urgent email notifications to the owner.

---

## 7. Cost & Margin Economics

### Per-Client Monthly Cost Basis (Growth Tier @ 1,000 Convos)

| Cost Component | Unit Cost / Usage | Monthly Cost / Client |
| :--- | :--- | :--- |
| **Gemini 2.5 Flash LLM Tokens** | ~1,500 input + 300 output tokens / turn $\times$ 4 turns / convo = 7.2k tokens $\times$ 1,000 convos = 7.2M tokens @ $0.35/1M tokens | **$2.52** |
| **Supabase Database & Storage** | Database compute, connection pooling, and message row storage | **$3.80** |
| **Telegram Bot Webhook Ingestion** | Vercel Edge / Serverless compute (~4,000 invocations) | **$0.60** |
| **Stripe Processing Fees** | 2.9% + $0.30 on $297 subscription | **$8.91** |
| **Total Direct COGS** | — | **$15.83 / month** |

### Gross Margin Summary
- **Revenue per Client**: $297.00 / month
- **Direct COGS**: $15.83 / month
- **Gross Profit**: **$281.17 / month**
- **Gross Margin**: **94.7%**

---

## 8. Summary of Action Items for Launch

1. [ ] **Executive Sign-off**: Review and approve package parameters with CTO.
2. [ ] **Stripe Product Staging**: Create `prod_j10_growth_monthly` and `price_j10_growth_297` in Stripe Sandbox.
3. [ ] **Self-Serve Checkout Page**: Connect `/dashboard/settings` plan selector to Stripe Checkout.
4. [ ] **Pilot Outreach**: Onboard the first 3 service businesses under the Founder's 3 terms.
