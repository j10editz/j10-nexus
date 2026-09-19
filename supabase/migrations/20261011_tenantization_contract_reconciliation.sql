-- Idempotently enforce the full tenant-key contract for databases whose
-- tenantization migration is already recorded. It deliberately fails closed
-- rather than inventing workspace ownership.
BEGIN;
DO $$
DECLARE v_table text; v_unresolved boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['company_knowledge_documents','marketing_campaigns','finance_invoices','workforce_members','website_funnels','commerce_products','commerce_orders','notifications','provider_subscriptions','webhook_endpoints'] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table AND column_name='workspace_id') THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE', v_table);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table AND column_name='user_id') THEN
      EXECUTE format('UPDATE public.%I target SET workspace_id = membership.workspace_id FROM public.workspace_memberships membership WHERE target.workspace_id IS NULL AND target.user_id = membership.user_id AND membership.status = ''active''', v_table);
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE workspace_id IS NULL)', v_table) INTO v_unresolved;
    IF v_unresolved THEN RAISE EXCEPTION 'Tenantization reconciliation failed: %.workspace_id is unresolved.', v_table; END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', v_table);
  END LOOP;
END $$;
COMMIT;
