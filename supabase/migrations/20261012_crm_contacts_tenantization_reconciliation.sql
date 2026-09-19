-- Reconcile the legacy CRM tenant key for databases that recorded Tier 0F
-- before its fresh-install portability guard existed.
BEGIN;
DO $$
DECLARE v_kind "char"; v_unresolved boolean;
BEGIN
  SELECT c.relkind INTO v_kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='crm_contacts';
  IF v_kind = 'r' THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_contacts' AND column_name='workspace_id') THEN
      ALTER TABLE public.crm_contacts ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
    UPDATE public.crm_contacts legacy SET workspace_id=membership.workspace_id
    FROM (SELECT membership.user_id,membership.workspace_id FROM public.workspace_memberships membership JOIN (SELECT user_id FROM public.workspace_memberships WHERE status='active' GROUP BY user_id HAVING count(DISTINCT workspace_id)=1) unique_membership USING (user_id) WHERE membership.status='active') membership
    WHERE legacy.workspace_id IS NULL AND legacy.user_id=membership.user_id;
    SELECT EXISTS(SELECT 1 FROM public.crm_contacts WHERE workspace_id IS NULL) INTO v_unresolved;
    IF v_unresolved THEN RAISE EXCEPTION 'CRM reconciliation aborted: crm_contacts.workspace_id is unresolved.'; END IF;
    ALTER TABLE public.crm_contacts ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;
COMMIT;
