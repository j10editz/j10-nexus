-- Migration: 20261005_payment_checkouts_nullable_url.sql
-- Description: Narrow, idempotent schema change to drop NOT NULL constraint on payment_checkouts.checkout_url.
-- Purpose: Accommodate two-phase checkout flows where internal record reservation precedes provider session generation.
-- Safety: Preserves all existing data, RLS policies, table grants, foreign keys, and indexes.

DO $$
BEGIN
  -- Check if payment_checkouts table exists and checkout_url is currently NOT NULL
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_checkouts'
      AND column_name = 'checkout_url'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.payment_checkouts ALTER COLUMN checkout_url DROP NOT NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- EXPLICIT VERIFICATION QUERY
-- -----------------------------------------------------------------------------
-- Run this query after application to confirm the column is now nullable:
--
-- SELECT column_name, is_nullable, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'payment_checkouts'
--   AND column_name = 'checkout_url';
--
-- Expected Output:
-- column_name  | is_nullable | data_type | column_default
-- -------------+-------------+-----------+----------------
-- checkout_url | YES         | text      | NULL
-- -----------------------------------------------------------------------------
