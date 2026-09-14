const postgres = require("postgres");

async function run() {
  const sql = postgres("postgresql://supabase_admin:postgres@localhost:54322/postgres");
  const encryptedSecret = "yapprWC2gX1BzbxhFC2oIGpIW/e9885I8xFyL4ViTHfCU6DNZl7419EN12SzJDDQXwEJnL89v/pYRAtURUpBTE82uuGZrojyd3by3+a2jj8=";

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT COALESCE(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        ((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))
      )::uuid;
    $$;
  `);
  console.log("Updated auth.uid to support request.jwt.claims JSON.");

  const tenants = ["realtime-dev", "127.0.0.1", "localhost", "default"];

  await sql`DELETE FROM public.extensions`;
  await sql`DELETE FROM public.tenants`;

  for (const t of tenants) {
    await sql`
      INSERT INTO public.tenants (
        id, name, external_id, jwt_secret, max_concurrent_users, max_events_per_second,
        max_bytes_per_second, max_channels_per_client, max_joins_per_second,
        inserted_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${t}, ${t}, ${encryptedSecret}, 200, 100,
        100000, 100, 500,
        now(), now()
      )
    `;
    console.log(`Inserted tenant: ${t}`);

    const settings = {
      db_name: "sWBpZNdjggEPTQVlI52Zfw==",
      db_host: "6kRpdCVPVHzjgbMLmU7R/082uuGZrojyd3by3+a2jj8=",
      db_user: "uxbEq/zz8DXVD53TOI1zmw==",
      db_password: "sWBpZNdjggEPTQVlI52Zfw==",
      db_port: "+enMDFi1J/3IrrquHHwUmA==",
      region: "us-east-1",
      poll_interval_ms: 100,
      poll_max_record_bytes: 1048576,
      poll_max_changes: 100,
      slot_name: "supabase_realtime_rls",
      publication: "supabase_realtime",
      ssl_enforced: false,
    };

    await sql`
      INSERT INTO public.extensions (
        id, type, settings, tenant_external_id, inserted_at, updated_at
      ) VALUES (
        gen_random_uuid(), 'postgres_cdc_rls', ${sql.json(settings)}, ${t}, now(), now()
      )
    `;
    console.log(`Inserted postgres_cdc_rls extension for tenant: ${t}`);
  }

  await sql.end();
  console.log("Tenants and extensions configured successfully.");
}

run().catch(console.error);
