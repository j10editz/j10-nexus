begin;

/*
  Day 16H
  Resolve the workflow graph checksum function through Supabase's extensions
  schema. Supabase installs pgcrypto there, while PostgREST requests may use a
  search path that does not include extensions.
*/

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_automation_version_graph_checksum()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, extensions
as $$
begin
  new.graph_checksum := encode(
    extensions.digest(
      new.graph_snapshot::text,
      'sha256'::text
    ),
    'hex'
  );

  if new.status = 'published' and new.published_by is null then
    new.published_by := auth.uid();
  end if;

  return new;
end;
$$;

do $$
declare
  v_checksum text;
begin
  v_checksum := encode(
    extensions.digest('{}'::text, 'sha256'::text),
    'hex'
  );

  if v_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'pgcrypto SHA-256 checksum verification failed.';
  end if;
end $$;

commit;
