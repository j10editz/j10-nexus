# J10 NEXUS — Founder’s 3 Billing & Entitlement Runbook

> **Document Version**: 2.0.0  
> **Classification**: Authoritative Operations Manual  
> **Effective Date**: Q4 2026  
> **Status**: STAGED FOR STRIPE TEST MODE CERTIFICATION  

---

## 1. Authoritative Commercial Terms

| Term | Specification | Operational Constraint |
| :--- | :--- | :--- |
| **Introductory Package** | **Founder’s 3** | Strictly limited to **exactly 3 active/reserved businesses**. |
| **Introductory Price** | **$99.00 USD / month** | `unit_amount = 9900`, `currency = usd`, `interval = month`. Lookup key: `j10_founders3_monthly_99`. |
| **Public Standard Price** | **$149.00 USD / month** | `unit_amount = 14900`, `currency = usd`, `interval = month`. Lookup key: `j10_standard_monthly_149`. |
| **Introductory Duration** | **First 12 successfully paid monthly cycles** | Transition occurs after the 12th successfully settled renewal. |
| **Post-12-Month Price** | **$149.00 USD / month** | Subscription automatically transitions to Standard Price. |
| **Setup Fee** | **$0.00 (Waived)** | No onboarding or implementation fees. |
| **Billing Frequency** | **Monthly recurring** | Billed on Stripe subscription cycle. |
| **Contract Terms** | **Month-to-month, cancel anytime** | Self-serve cancellation via Stripe Customer Portal or Settings. |
| **Onboarding** | **Concierge onboarding by J10** | Direct setup and business knowledge grounding. |
| **Availability** | **Invitation-only** | Requires cryptographically random single-use invitation code. |
| **Operational Inclusions** | AI Receptionist, Website Lead Capture, Telegram Messaging, Unified Inbox, CRM Persistence, Lead Qualification, Human Takeover, Booking Link Handoff, Knowledge Grounding, Concierge Support. | **No unoperational features (WhatsApp, Instagram, Voice calling, Missed-call text-back) are advertised or promised.** |

---

## 2. 12-Month Price Transition Lifecycle

### A. Cycle Counting Rules
1. **Cycle Increment Trigger**: The paid cycle count (`founder_cycle_count`) increments **only** upon verified receipt of a valid `invoice.paid` webhook where `amount_paid > 0` and `status = 'paid'`.
2. **Exclusions**:
   - Failed invoices (`invoice.payment_failed`) do **NOT** advance cycle count.
   - Refunded or disputed invoices do **NOT** advance cycle count.
   - Voided or uncollectible invoices do **NOT** advance cycle count.
   - Duplicate `invoice.paid` deliveries are deduplicated by `stripe_event_id` and cannot increment twice.
   - Out-of-order events cannot regress count or trigger premature transition.

### B. Transition Mechanism
- During cycles 1–12, `price_transition_status` is `'introductory'` and the billed price is `$99/mo`.
- Upon settlement of the 12th paid cycle (`founder_cycle_count >= 12`), `record_founder_paid_cycle_atomic` updates `price_transition_status = 'transitioned'`.
- The subscription is updated in Stripe to bill the Standard Price (`price_standard_monthly_149` / `$149/mo`) on the 13th billing cycle.
- The Billing UI discloses the exact paid cycle (e.g. `Cycle 1 of 12`) and expected transition date before and during the introductory term.

---

## 3. Founders 3 Access Control & Capacity Management

### A. Cryptographically Secure Invitations
- Invitation tokens are generated using cryptographically secure random bytes (`j10_inv_...`).
- **Zero Raw Token Storage**: Only the SHA-256 hash (`encode(sha256(token::bytea), 'hex')`) is persisted in `founders3_invitations.invitation_code_hash`.
- Raw tokens never appear in database tables, logs, analytics payloads, or Stripe metadata.

### B. Single-Use & Reservation Semantics
- Each invitation has a maximum use count of 1.
- Claiming an invitation is an atomic operation executed within `reserve_founders3_slot_atomic`:
  1. Validates token hash, expiration timestamp, and optional workspace binding.
  2. Acquires row locks (`SELECT ... FOR UPDATE`) on the invitations table.
  3. Checks global occupied capacity (`active + reserved < 3`).
  4. Creates a temporary reservation with a 30-minute TTL (`expires_at = NOW() + INTERVAL '30 minutes'`).
  5. Marks the invitation `is_consumed = TRUE`.

### C. Seat Reclamation Rules
1. **Abandoned Checkout**: If checkout fails or expires (`checkout.session.expired`), `release_founders3_slot_atomic` marks the reservation `released` and releases the slot.
2. **Expired Reservation Cleanup**: Automated sweeper queries `status = 'reserved' AND expires_at < NOW()` and releases orphaned seats.
3. **Completed Cancellation**: When a subscription reaches `stripe_status = 'canceled'` (period end reached), `release_founders3_slot_atomic` marks the enrollment `released` and decrements active seats.
4. **No Seat Reservation on Cancel**: Canceling does **not** preserve or reserve a seat. Re-enrolling requires a new valid invitation and available capacity.

---

## 4. Canonical State Model

J10 NEXUS maintains strict decoupling between Stripe raw subscription state and internal workspace entitlement state:

| Field | Allowed Values | Description |
| :--- | :--- | :--- |
| `stripe_status` | `active`, `past_due`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired`, `trialing`, `paused` | Exact mirror of Stripe's canonical subscription status. |
| `cancel_at_period_end` | `BOOLEAN` (`true` / `false`) | Indicates whether subscription will terminate at the end of current period. |
| `entitlement_state` | `active`, `grace_period`, `past_due_hold`, `suspended`, `canceled` | Internal J10 access state determining feature availability. |
| `billing_hold_reason` | `NULL`, `payment_failed`, `subscription_canceled`, `dispute_hold`, `quota_exceeded` | Specific operational reason for any active hold. |

> [!IMPORTANT]
> Non-Stripe terms like `canceled_at_period_end`, `refunded`, or `disputed` must **never** be written to `stripe_status`.

---

## 5. Dunning, Payment Failures & Grace Periods

### A. Dunning Lifecycle
1. When a renewal invoice fails (`invoice.payment_failed`):
   - `stripe_status` $\rightarrow$ `past_due`
   - `entitlement_state` $\rightarrow$ `grace_period` (for 7 days)
   - `billing_hold_reason` $\rightarrow$ `payment_failed`
2. **Lead Safety Guarantee**: Inbound leads and customer messages are **never dropped** during grace period or dunning.
3. **Recovery**: When the customer updates payment method and invoice settles (`invoice.paid`):
   - `stripe_status` $\rightarrow$ `active`
   - `entitlement_state` $\rightarrow$ `active`
   - `billing_hold_reason` $\rightarrow$ `NULL`
4. **Terminal Failure**: If Stripe cancels the unpaid subscription after retry attempts (`customer.subscription.deleted`):
   - `stripe_status` $\rightarrow$ `canceled`
   - `entitlement_state` $\rightarrow$ `canceled`
   - `billing_hold_reason` $\rightarrow$ `subscription_canceled`
   - Founder slot is reclaimed.

---

## 6. Refund, Dispute & 30-Day Satisfaction Policy

### A. 30-Day Satisfaction Guarantee (Manual Review Only)
- **Eligibility**: Workspace has been enrolled in Founder’s 3 for $\le 30$ calendar days from `founder_start_date`.
- **Request Method**: Direct written request via concierge onboarding channel or email to `support@j10nexus.com`.
- **Review Owner**: CTO / Principal Billing Engineer manual review.
- **Stripe Refund Procedure**:
  1. Locate Customer and Charge in Stripe Dashboard.
  2. Issue refund via Stripe API / Dashboard with reason `requested_by_customer`.
  3. Cancel Stripe subscription immediately.
- **Entitlement & Seat Effect**:
  - `entitlement_state` $\rightarrow$ `canceled`
  - `billing_hold_reason` $\rightarrow$ `subscription_canceled`
  - Founder seat is released and returned to public inventory.
- **No Automated Refunds**: Refunds are never automated via client APIs.

---

## 7. Operational Reconciliation & Sweeper Automation

### A. Abandoned Reservation Sweeper
- Cron trigger running every 10 minutes:
```sql
UPDATE founders3_reservations
SET status = 'expired', updated_at = NOW()
WHERE status = 'reserved'
  AND expires_at < NOW();
```
- Restores unconsumed slots for new invitation redemptions.

### B. Event Idempotency & Out-of-Order Defense
- All incoming Stripe webhooks check `stripe_webhook_events` table by `stripe_event_id`.
- Duplicate deliveries immediately return HTTP 200 `{ received: true, deduplicated: true }`.
- Subscriptions are reconciled against Stripe's object timestamp (`event.created`) to prevent stale updates from overwriting newer states.

---

## 8. Rollback Procedures & Support Responsibilities

### A. Rollback Protocol
1. **Migration Rollback**: Revert `20261004_founders3_strict_state_and_hash_isolation.sql` using staged down-migration script.
2. **Stripe Test Object Cleanup**: Archive test prices `j10_founders3_monthly_99` and test products in Stripe sandbox.
3. **Workspace Access Fallback**: If billing service experiences an outage, system fails open to `grace_period` to prevent service disruption to paying clients.

### B. Support Ownership Matrix
| Scenario | First Responder | Escalation | Target SLA |
| :--- | :--- | :--- | :--- |
| Failed Invitation Redemption | Concierge Support | Principal Billing Engineer | 15 minutes |
| Webhook Reconciliation Failure | On-Call Engineer | CTO | 30 minutes |
| Price Transition Discrepancy | Principal Billing Engineer | CTO | 1 hour |
| Satisfaction Refund Request | Customer Success | CTO / Finance Owner | 4 hours |
