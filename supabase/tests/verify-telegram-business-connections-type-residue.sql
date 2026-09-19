DO $$
DECLARE
  v_table_name text;
  v_relkind "char";
  v_type_kind "char";
  v_type_relid oid;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'telegram_connection_sessions',
    'telegram_business_connections',
    'telegram_connection_consents',
    'telegram_deletion_intents',
    'telegram_ai_jobs',
    'telegram_worker_locks'
  ] LOOP
    SELECT c.relkind, t.typtype, t.typrelid
      INTO v_relkind, v_type_kind, v_type_relid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = c.reltype
    WHERE n.nspname = 'public'
      AND c.relname = v_table_name;

    IF v_relkind IS DISTINCT FROM 'r'
       OR v_type_kind IS DISTINCT FROM 'c'
       OR v_type_relid IS NULL THEN
      RAISE EXCEPTION 'Telegram relation/type contract was not restored for public.%', v_table_name;
    END IF;
  END LOOP;
END;
$$;
