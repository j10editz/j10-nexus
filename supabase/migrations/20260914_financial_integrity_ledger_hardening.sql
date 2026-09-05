-- ============================================================================
-- J10 NEXUS: Financial Data Integrity & Ledger Hardening
-- Migration: 20260914_financial_integrity_ledger_hardening.sql
-- Description: Enforces NOT NULL on payment_ledger.checkout_id, adds provider_mode
--              to isolate live revenue from test mode, enforces ON DELETE RESTRICT
--              to prevent orphan financial entries, and enforces uniqueness on
--              payment_ledger provider events.
-- ============================================================================

BEGIN;

-- 1. Safely remove synthetic verification rows created during Tier 0C trigger testing
ALTER TABLE public.payment_ledger DISABLE TRIGGER trg_payment_ledger_immutability;

DELETE FROM public.payment_ledger
WHERE provider_event_id LIKE 'evt_tier0c_verify_%';

DELETE FROM public.payment_checkouts
WHERE metadata->>'test_source' = 'tier0c_verification';

ALTER TABLE public.payment_ledger ENABLE TRIGGER trg_payment_ledger_immutability;

-- 2. Add provider_mode to payment_checkouts and payment_ledger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_checkouts' AND column_name = 'provider_mode'
  ) THEN
    ALTER TABLE public.payment_checkouts
      ADD COLUMN provider_mode text NOT NULL DEFAULT 'test'
      CHECK (provider_mode IN ('live', 'test'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_ledger' AND column_name = 'provider_mode'
  ) THEN
    ALTER TABLE public.payment_ledger
      ADD COLUMN provider_mode text NOT NULL DEFAULT 'test'
      CHECK (provider_mode IN ('live', 'test'));
  END IF;
END $$;

-- 3. Enforce NOT NULL on payment_ledger.checkout_id
ALTER TABLE public.payment_ledger ALTER COLUMN checkout_id SET NOT NULL;

-- 4. Upgrade foreign keys from ON DELETE SET NULL to ON DELETE RESTRICT
-- A checkout referenced by an immutable payment ledger entry can NEVER be deleted.
DO $$
BEGIN
  -- Drop existing legacy foreign keys
  ALTER TABLE public.payment_ledger DROP CONSTRAINT IF EXISTS payment_ledger_checkout_id_fkey;
  ALTER TABLE public.payment_ledger DROP CONSTRAINT IF EXISTS fk_payment_ledger_workspace_checkout;

  -- Add RESTRICT constraints
  ALTER TABLE public.payment_ledger
    ADD CONSTRAINT payment_ledger_checkout_id_fkey
    FOREIGN KEY (checkout_id) REFERENCES public.payment_checkouts(id) ON DELETE RESTRICT;

  ALTER TABLE public.payment_ledger
    ADD CONSTRAINT fk_payment_ledger_workspace_checkout
    FOREIGN KEY (workspace_id, checkout_id) REFERENCES public.payment_checkouts(workspace_id, id) ON DELETE RESTRICT;
END $$;

-- 5. Enforce unique provider event idempotency on payment_ledger
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_ledger_provider_event
  ON public.payment_ledger (provider, provider_event_id);

-- 6. Revenue query optimization index (workspace, provider_mode, status)
CREATE INDEX IF NOT EXISTS idx_payment_ledger_revenue
  ON public.payment_ledger (workspace_id, provider_mode, status);

CREATE INDEX IF NOT EXISTS idx_payment_checkouts_mode
  ON public.payment_checkouts (workspace_id, provider_mode, status);

COMMIT;

-- 7. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 8. Verification summary
SELECT
  (SELECT count(*) FROM public.payment_checkouts) AS checkouts_count,
  (SELECT count(*) FROM public.payment_ledger) AS ledger_count,
  (SELECT count(*) FROM public.webhook_events) AS webhook_events_count;
