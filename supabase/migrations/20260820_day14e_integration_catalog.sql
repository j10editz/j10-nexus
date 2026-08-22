begin;

/*
  Replace the original six-provider database constraint with the expanded
  J10 NEXUS connector catalog. Existing legacy provider values remain valid
  so this migration cannot strand or invalidate older workspace rows.
*/
do $$
declare
  provider_constraint_name text;
begin
  for provider_constraint_name in
    select constraint_record.conname
    from pg_constraint as constraint_record
    join pg_class as table_record
      on table_record.oid = constraint_record.conrelid
    join pg_namespace as namespace_record
      on namespace_record.oid = table_record.relnamespace
    join pg_attribute as column_record
      on column_record.attrelid = table_record.oid
     and column_record.attnum = any (constraint_record.conkey)
    where namespace_record.nspname = 'public'
      and table_record.relname = 'integrations'
      and constraint_record.contype = 'c'
      and column_record.attname = 'provider'
  loop
    execute format(
      'alter table public.integrations drop constraint %I',
      provider_constraint_name
    );
  end loop;
end
$$;

alter table public.integrations
  add constraint integrations_provider_check
  check (
    provider = any (
      array[
        'gmail',
        'google-calendar',
        'whatsapp-business',
        'shopify',
        'stripe',
        'generic-webhook',
        'outlook-mail',
        'outlook-calendar',
        'microsoft-teams',
        'slack',
        'discord',
        'telegram',
        'twilio',
        'google-drive',
        'google-sheets',
        'onedrive',
        'dropbox',
        'notion',
        'airtable',
        'zoom',
        'calendly',
        'trello',
        'asana',
        'monday',
        'clickup',
        'hubspot',
        'salesforce',
        'pipedrive',
        'mailchimp',
        'meta-business',
        'instagram-business',
        'youtube',
        'tiktok',
        'linkedin',
        'x',
        'woocommerce',
        'paypal',
        'square',
        'quickbooks',
        'xero',
        'amazon-seller',
        'etsy',
        'ebay',
        'tiktok-shop',
        'github',
        'zapier',
        'make',
        'openai',
        'anthropic',
        'gemini',
        'hugging-face',
        'runway',
        'higgsfield',
        'pika',
        'kling',

        /* Legacy values retained for existing rows. */
        'email',
        'calendar',
        'google_calendar',
        'whatsapp',
        'whatsapp_business',
        'webhook',
        'generic_webhook',
        'crm',
        'marketing',
        'notifications'
      ]::text[]
    )
  );

comment on constraint integrations_provider_check
  on public.integrations
  is 'Allows canonical J10 NEXUS integration providers and preserved legacy provider values.';

commit;