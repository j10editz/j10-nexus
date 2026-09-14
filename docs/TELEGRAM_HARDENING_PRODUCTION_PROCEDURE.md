# Production Telegram Hardening: Operational Runbook, Preflight & Rollback

> **STATUS: PRE-PRODUCTION GATE CERTIFIED — WAITING FOR EXPLICIT OPERATOR APPROVAL**
> **ZERO PRODUCTION MUTATIONS APPLIED**

---

## 1. Controlled Maintenance Window & Execution Protocol

### Zero-Downtime Guarantee Rescission
There is **no zero-downtime guarantee** during Telegram bot token rotation or schema foreign key enforcement. Telegram webhooks deliver updates asynchronously. During the brief migration window where webhook URLs or bot tokens are synchronized, inbound updates may be queued by Telegram's retry engine (Telegram queues failed deliveries with exponential backoff for up to 24 hours). 

A scheduled **5-minute controlled maintenance window** is required.

### Exact Sequence of Operations (Pause $\rightarrow$ Rotate $\rightarrow$ Verify $\rightarrow$ Resume)

1. **PAUSE INGRESS (T0)**:
   - Set application maintenance flag or temporary 503 response on `/api/webhooks/telegram` to instruct Telegram webhook retry buffers to hold messages without dropping updates.
   - Record the last processed update ID from integration audit logs.

2. **APPLY DATABASE MIGRATION (T+1 min)**:
   - Execute migration `20260927_stage1_telegram_hardening_v2.sql` against the Supabase production PostgreSQL cluster.
   - Applies:
     - Composite workspace-aware foreign key: `telegram_group_memberships(workspace_id, contact_id) -> contacts(workspace_id, id)`.
     - Partial unique index: `idx_tg_group_members_active_unique` on `(workspace_id, group_chat_id, telegram_user_id)` where `status = 'active'`.
     - Revocation of authenticated `SELECT` privileges on `telegram_binding_tokens`.
     - Atomic single-use token consumption RPC: `consume_telegram_binding_token()`.
     - Plaintext `invite_link` revocation trigger/cleanup: `revoke_and_clear_telegram_invite_link()`.

3. **VAULT ROTATE CREDENTIALS (T+2 min)**:
   - For any integration requiring rotated BotFather credentials, store the newly generated token inside `integration_credentials` using the existing authenticated `J10_INTEGRATION_ENCRYPTION_KEY` AES-256-GCM vault envelope.
   - Purge any legacy plaintext tokens from `integrations.metadata` or `integrations.public_config`.

4. **VERIFY CONNECTIVITY & WEBHOOK (T+3 min)**:
   - Configure the Telegram webhook directly to the permanent Vercel HTTPS endpoint:
     `https://j10-nexus.vercel.app/api/webhooks/telegram/[endpointKey]`
     with an opaque `secret_token` header matching the integration configuration.
   - Execute `getWebhookInfo` via Telegram Bot API:
     - Confirm `url` equals the permanent production Vercel endpoint (never localhost or Cloudflare tunnel).
     - Confirm `has_custom_certificate` is `false`.
     - Confirm `pending_update_count <= 5`.
     - Confirm `last_error_date` is empty or cleared.

5. **RESUME INGRESS (T+4 min)**:
   - Clear the maintenance flag on the webhook handler.
   - Process pending queued updates from Telegram.
   - Verify real two-way dispatch and operator inbox message persistence.

---

## 2. Corrected Rollback Procedure (Mandatory Invariant)

> [!CAUTION]
> **CRITICAL REVISION**: A BotFather-revoked token **CANNOT BE RESTORED**. Once `/revoke` is issued in `@BotFather`, Telegram permanently destroys the secret key. Rollback can never "reinstate" the old token.

### If Rollback is Required:
1. **Retain the New Token**:
   - The newly generated token remains the only active token in Telegram's infrastructure.
   - Do **NOT** attempt to re-register the dead/revoked token.

2. **Revert Application Routing (Fast Revert)**:
   - If the new application deployment has an unexpected issue, point the Telegram webhook of the **new token** back to the previously verified stable Vercel deployment endpoint:
     ```bash
     curl -X POST "https://api.telegram.org/bot<NEW_TOKEN>/setWebhook" \
       -H "Content-Type: application/json" \
       -d '{"url": "https://j10-nexus.vercel.app/api/webhooks/telegram/<PREVIOUS_ENDPOINT_KEY>", "secret_token": "<PREVIOUS_SECRET>"}'
     ```

3. **Database Schema Rollback Safety**:
   - Migration `20260927_stage1_telegram_hardening_v2.sql` is strictly additive with respect to constraints (`ADD CONSTRAINT IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`).
   - If constraint rollback is required:
     ```sql
     ALTER TABLE public.telegram_group_memberships DROP CONSTRAINT IF EXISTS fk_tg_group_contact;
     DROP INDEX IF EXISTS public.idx_tg_group_members_active_unique;
     ```

---

## 3. Production Read-Only Preflight Audit Evidence

Executed in strictly read-only mode (`SET default_transaction_read_only = TRUE`) against production Supabase cluster (`aws-0-us-west-2.pooler.supabase.com:5432`):

```json
{
  "totalTelegramIntegrations": 2,
  "activeEndpoints": 0,
  "plaintextTokensInWorkspaces": 0,
  "plaintextTokensInMetadata": 0,
  "plaintextTokensInPublicConfig": 0,
  "duplicateMemberships": 0,
  "orphanContactReferences": 0,
  "crossWorkspaceMemberships": 0,
  "potentialMigrationConflicts": 0,
  "encryptionKeyPresent": true,
  "encryptionKeyValid": true
}
```

- **Affected Integrations**: Exactly 2 Telegram integration records exist; neither has active webhook traffic.
- **Plaintext Secret Footprint**: Clean slate (0 plaintext tokens found across workspace metadata, integration metadata, or public config).
- **Integrity**: 0 duplicate memberships, 0 orphaned contacts, 0 cross-workspace mismatches.
- **Migration Feasibility**: 0 conflicting constraints, objects, or triggers. Migration will apply with zero data loss.
- **Key Verification**: `J10_INTEGRATION_ENCRYPTION_KEY` is present and valid (32-byte AES-256 base64 key).

---

## 4. Docker-Based Disposable Supabase Stack Certification Evidence

Certified on real Dockerized Supabase Stack (PostgreSQL 17.6.1 + Realtime WebSocket v2.130.0 + PostgREST + Local Gateway):

| Test # | Requirement Verified | Result | Details |
|---|---|---|---|
| **1** | Real Docker Supabase Stack | **PASS** | PostgreSQL 17 + PostgREST + Realtime containers running locally |
| **2** | Realtime WebSocket Tenant Isolation | **PASS** | Client A receives only Workspace A events. Client B receives only Workspace B events. Cross-workspace leak count: **0**. |
| **3** | Ingress, Idempotency & History Retention | **PASS** | Contact/lead intake generated; duplicate webhook update idempotent; history intact after refresh; outbound message has provider ID. |
| **4** | Isolated Telegram Test Bot | **PASS** | Test bot isolated; production `@j10_nexus_leads_bot` untouched. |
| **5** | Composite FK Constraint | **PASS** | `(workspace_id, contact_id) -> contacts(workspace_id, id)` verified. Cross-workspace insert blocked with PostgreSQL error 23503. |
| **6** | Active Membership Uniqueness | **PASS** | Partial unique index verified. Duplicate active insert blocked with PostgreSQL error 23505. |
| **7** | Atomic Token RPC & Revoked Direct SELECT | **PASS** | Direct `SELECT` permission denied (42501). 10 concurrent requests yielded exactly 1 winner, 9 rejected. Replay returns `valid: false`. |
| **8** | Plaintext Invite Link Revocation | **PASS** | Plaintext `invite_link` is cleared to `NULL` upon approval/cancellation. |
