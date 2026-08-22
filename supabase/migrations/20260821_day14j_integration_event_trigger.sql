begin;

/*
  Day 14J:
  Allow normalized external integration events to start J10 workflows.
*/
alter table public.automations
  drop constraint if exists automations_trigger_type_check;

alter table public.automations
  add constraint automations_trigger_type_check
  check (
    trigger_type = any (
      array[
        'manual',
        'new_crm_contact',
        'crm_status_changed',
        'new_ai_task',
        'ai_task_completed',
        'schedule',
        'integration_event'
      ]::text[]
    )
  );

comment on constraint automations_trigger_type_check
  on public.automations
  is 'Allows native, scheduled, and Day 14J integration-event workflow triggers.';

commit;
