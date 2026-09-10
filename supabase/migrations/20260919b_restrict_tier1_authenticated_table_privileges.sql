BEGIN;

REVOKE ALL ON public.crm_proposals FROM authenticated;
REVOKE ALL ON public.crm_bookings FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookings TO authenticated;

COMMIT;
