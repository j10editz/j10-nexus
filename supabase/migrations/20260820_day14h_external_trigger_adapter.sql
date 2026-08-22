begin;

alter table public.integration_webhook_events
  add column if not exists normalized_event jsonb,
  add column if not exists adapted_at timestamptz;

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_processing_status_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_processing_status_check
  check (
    processing_status in (
      'pending_adapter',
      'adapted',
      'duplicate',
      'processed',
      'failed',
      'rejected'
    )
  );

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_adapted_payload_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_adapted_payload_check
  check (
    processing_status not in (
      'adapted',
      'processed'
    )
    or (
      normalized_event is not null
      and adapted_at is not null
    )
  );

create index if not exists integration_webhook_events_adapter_queue_idx
  on public.integration_webhook_events(received_at asc)
  where processing_status in (
    'pending_adapter',
    'failed'
  );

create index if not exists integration_webhook_events_capability_idx
  on public.integration_webhook_events(
    (normalized_event ->> 'capabilityId'),
    adapted_at desc
  )
  where processing_status in (
    'adapted',
    'processed'
  );

comment on column public.integration_webhook_events.normalized_event is
  'Canonical j10.external-trigger.v1 envelope produced by the Day 14H provider adapter.';

comment on column public.integration_webhook_events.adapted_at is
  'Time the raw webhook receipt was successfully converted into an external trigger.';

comment on constraint integration_webhook_events_adapted_payload_check
  on public.integration_webhook_events is
  'Adapted and processed receipts must contain a canonical normalized event and adaptation timestamp.';

commit;