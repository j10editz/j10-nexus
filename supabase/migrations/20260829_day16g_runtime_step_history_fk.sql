begin;

/*
  Day 16G
  Preserve immutable run history when a published workflow replaces its live
  automation_steps rows.

  automation_run_steps already stores automation_version_id and graph_node_id
  for durable traceability. The live automation_step_id is therefore a useful
  pointer only while that runtime step still exists; it must not prevent the
  atomic publish/rollback RPCs from replacing live runtime steps.
*/

alter table public.automation_run_steps
  alter column automation_step_id drop not null;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.conrelid =
        'public.automation_run_steps'::regclass
      and constraint_row.confrelid =
        'public.automation_steps'::regclass
      and pg_get_constraintdef(constraint_row.oid) ~
        '^FOREIGN KEY \(automation_step_id\)'
  loop
    execute format(
      'alter table public.automation_run_steps drop constraint %I',
      v_constraint.conname
    );
  end loop;
end $$;

alter table public.automation_run_steps
  add constraint automation_run_steps_automation_step_id_fkey
  foreign key (automation_step_id)
  references public.automation_steps(id)
  on delete set null;

commit;
