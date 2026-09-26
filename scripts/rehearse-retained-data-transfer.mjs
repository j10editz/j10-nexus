import { createDecipheriv, createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import postgres from "postgres";

const retainedTables = [
  ["auth", "users"], ["auth", "identities"],
  ["public", "workspaces"], ["public", "workspace_memberships"],
  ["public", "workspace_subscriptions"], ["public", "contacts"],
  ["public", "inbox_threads"], ["public", "inbox_messages"],
  ["public", "integrations"], ["public", "integration_credentials"],
  ["public", "telegram_business_connections"],
];
const repositoryRoot = resolve(import.meta.dirname, "..");

const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const tableName = ([schema, table]) => `${identifier(schema)}.${identifier(table)}`;
const localMode = process.argv.includes("--allow-local-fixture");
const seedFixture = process.argv.includes("--seed-fixture");

function fail(code) { throw new Error(code); }

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name}_REQUIRED`);
  return value;
}

function canonicalMigrationVersions() {
  const checkedOutSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const expectedSha = required("J10_TRANSFER_CANONICAL_SHA");
  if (expectedSha !== checkedOutSha) fail("TRANSFER_CANONICAL_SHA_MISMATCH");
  const versions = readdirSync(resolve(repositoryRoot, "supabase", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{8}_.+\.sql$/.test(entry.name))
    .map((entry) => entry.name.slice(0, 8))
    .sort();
  if (!versions.length || new Set(versions).size !== versions.length) fail("TRANSFER_CANONICAL_MIGRATION_MANIFEST_INVALID");
  return { checkedOutSha, versions };
}

function assertTarget(ref, url, side) {
  if (localMode) {
    if (!/^local-(source|target)$/.test(ref) || !/^postgres(?:ql)?:\/\/[^\s]+$/.test(url)) fail(`TRANSFER_${side}_LOCAL_TARGET_INVALID`);
    return;
  }
  if (!/^[a-z0-9]{20}$/.test(ref)) fail(`TRANSFER_${side}_REF_INVALID`);
  let parsed;
  try { parsed = new URL(url); } catch { fail(`TRANSFER_${side}_URL_INVALID`); }
  if (parsed.hostname !== `db.${ref}.supabase.co`) fail(`TRANSFER_${side}_HOST_MISMATCH`);
}

async function columns(sql, [schema, table]) {
  const rows = await sql`
    select column_name
    from information_schema.columns
    where table_schema = ${schema} and table_name = ${table} and is_generated = 'NEVER'
    order by ordinal_position`;
  if (!rows.length) fail(`TRANSFER_REQUIRED_TABLE_MISSING:${schema}.${table}`);
  return rows.map((row) => row.column_name);
}

async function exactCount(sql, pair) {
  const [{ count }] = await sql.unsafe(`select count(*)::bigint as count from ${tableName(pair)}`);
  return Number(count);
}

async function copyTable(source, target, pair) {
  const sourceColumns = await columns(source, pair);
  const targetColumns = await columns(target, pair);
  if (sourceColumns.join(",") !== targetColumns.join(",")) fail(`TRANSFER_SCHEMA_MISMATCH:${pair.join('.')}`);
  const rows = await source.unsafe(`select ${sourceColumns.map(identifier).join(",")} from ${tableName(pair)} order by 1`);
  if (!rows.length) return 0;
  const statement = `insert into ${tableName(pair)} (${sourceColumns.map(identifier).join(",")}) values (${sourceColumns.map((_, index) => `$${index + 1}`).join(",")}) on conflict do nothing`;
  for (const row of rows) await target.unsafe(statement, sourceColumns.map((column) => row[column]));
  return rows.length;
}

function envelope({ payload, key }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return { encrypted_payload: encrypted.toString("base64"), initialization_vector: iv.toString("base64"), authentication_tag: cipher.getAuthTag().toString("base64") };
}

function assertEnvelopeCompatibility(rows, key) {
  for (const row of rows) {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.initialization_vector, "base64"), { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(row.authentication_tag, "base64"));
    decipher.update(Buffer.from(row.encrypted_payload, "base64"));
    decipher.final();
  }
}

async function seed(source, key) {
  const users = Array.from({ length: 14 }, () => randomUUID());
  const workspaces = Array.from({ length: 22 }, () => randomUUID());
  const passwordHash = (await source`select crypt('fixture-password', gen_salt('bf')) as value`)[0].value;
  for (let index = 0; index < users.length; index += 1) {
    await source`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values (${users[index]}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${`retained-${index}@fixture.test`}, ${passwordHash}, now(), '', '', '', '', '', '', '', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await source`insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) values (${users[index]}::uuid, ${users[index]}::uuid, ${source.json({ sub: users[index], email: `retained-${index}@fixture.test` })}, 'email', ${users[index]}, now(), now(), now())`;
  }
  for (let index = 0; index < workspaces.length; index += 1) {
    const owner = users[index % users.length];
    const classification = index < 14 ? "staging_test" : index === 14 ? "owner_internal" : index === 15 ? "real_customer" : "legacy_owner_retained";
    await source`insert into public.workspaces (id, name, slug, brand_name, owner_user_id, created_at, updated_at) values (${workspaces[index]}::uuid, ${`Retained ${classification} ${index}`}, ${`retained-${index}-${workspaces[index].slice(0, 8)}`}, ${`Retained ${classification}`}, ${owner}::uuid, now() - interval '1 day', now() - interval '1 day')`;
    if (index < 14) await source`insert into public.workspace_memberships (workspace_id, user_id, role, status) values (${workspaces[index]}::uuid, ${owner}::uuid, 'owner', 'active')`;
  }
  for (let index = 0; index < 2; index += 1) await source`insert into public.workspace_subscriptions (workspace_id, user_id, plan_id, status, provenance, monthly_message_limit, messages_used_this_period, current_period_start, current_period_end, dunning_status, dunning_attempt_count) values (${workspaces[index]}::uuid, ${users[index]}::uuid, 'growth', ${index === 0 ? 'active' : 'trialing'}, ${index === 0 ? 'internal_grant' : 'trial'}, 1000, 0, now() - interval '1 day', now() + interval '29 days', 'none', 0)`;
  const contactIds = [];
  for (let index = 0; index < 11; index += 1) {
    const row = await source`insert into public.contacts (workspace_id, name, source, deal_stage, type, status) values (${workspaces[index]}::uuid, ${`Retained Contact ${index}`}, 'fixture', 'lead', 'Lead', 'New') returning id`;
    contactIds.push(row[0].id);
  }
  const thread = (await source`insert into public.inbox_threads (workspace_id, contact_id, channel) values (${workspaces[0]}::uuid, ${contactIds[0]}::uuid, 'website') returning id`)[0].id;
  for (let index = 0; index < 104; index += 1) await source`insert into public.inbox_messages (workspace_id, thread_id, direction, provider, content) values (${workspaces[0]}::uuid, ${thread}::uuid, 'inbound', 'fixture', ${`retained fixture message ${index}`})`;
  const integration = (await source`insert into public.integrations (workspace_id, user_id, provider, status, environment, account_label) values (${workspaces[16]}::uuid, ${users[2]}::uuid, 'telegram', 'disabled', 'production', 'retained fixture') returning id`)[0].id;
  const value = envelope({ payload: JSON.stringify({ fixture: 'opaque-retained-envelope' }), key });
  await source`insert into public.integration_credentials (integration_id, workspace_id, user_id, provider, encrypted_payload, initialization_vector, authentication_tag, algorithm, key_version) values (${integration}::uuid, ${workspaces[16]}::uuid, ${users[2]}::uuid, 'telegram', ${value.encrypted_payload}, ${value.initialization_vector}, ${value.authentication_tag}, 'aes-256-gcm', 1)`;
  await source`insert into public.telegram_business_connections (workspace_id, business_connection_id, telegram_user_id, user_chat_id, status) values (${workspaces[16]}::uuid, ${`fixture-binding-${integration}`}, 'fixture-user', 'fixture-chat', 'disconnected')`;
}

async function verify(source, target, key) {
  const counts = {};
  for (const pair of retainedTables) {
    const sourceCount = await exactCount(source, pair);
    const targetCount = await exactCount(target, pair);
    if (sourceCount !== targetCount) fail(`TRANSFER_ROW_COUNT_MISMATCH:${pair.join('.')}`);
    counts[pair.join('.')] = targetCount;
  }
  const [{ broken }] = await target`select count(*)::bigint as broken from public.workspace_memberships m left join public.workspaces w on w.id=m.workspace_id left join auth.users u on u.id=m.user_id where w.id is null or u.id is null`;
  if (Number(broken) !== 0) fail('TRANSFER_REFERENTIAL_INTEGRITY_FAILED');
  const credentialRows = await target`select encrypted_payload, initialization_vector, authentication_tag from public.integration_credentials`;
  assertEnvelopeCompatibility(credentialRows, key);
  const memberships = await target`
    select m.workspace_id, m.user_id
    from public.workspace_memberships m
    join public.workspace_subscriptions s on s.workspace_id = m.workspace_id
    order by m.workspace_id
    limit 2`;
  if (memberships.length < 2) fail('TRANSFER_RLS_FIXTURE_INCOMPLETE');
  await target.begin(async (tx) => {
    await tx.unsafe('set local role authenticated');
    await tx`select set_config('request.jwt.claim.sub', ${memberships[0].user_id}, true)`;
    const own = await tx`select count(*)::bigint as count from public.workspace_subscriptions where workspace_id = ${memberships[0].workspace_id}::uuid`;
    const foreign = await tx`select count(*)::bigint as count from public.workspace_subscriptions where workspace_id = ${memberships[1].workspace_id}::uuid`;
    if (Number(own[0].count) !== 1 || Number(foreign[0].count) !== 0) fail('TRANSFER_TENANT_ISOLATION_FAILED');
  });
  const authUrl = process.env.J10_TRANSFER_TARGET_API_URL?.trim();
  const publishableKey = process.env.J10_TRANSFER_TARGET_PUBLISHABLE_KEY?.trim();
  if (authUrl || publishableKey) {
    if (!authUrl || !publishableKey) fail('TRANSFER_AUTH_LOGIN_CONFIGURATION_INCOMPLETE');
    const response = await fetch(`${authUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: publishableKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'retained-0@fixture.test', password: 'fixture-password' }),
    });
    if (!response.ok) fail('TRANSFER_AUTH_LOGIN_FAILED');
  }
  return counts;
}

async function main() {
  const sourceRef = required('J10_TRANSFER_SOURCE_PROJECT_REF');
  const targetRef = required('J10_TRANSFER_TARGET_PROJECT_REF');
  const sourceUrl = required('J10_TRANSFER_SOURCE_DB_URL');
  const targetUrl = required('J10_TRANSFER_TARGET_DB_URL');
  if (sourceRef === targetRef) fail('TRANSFER_SOURCE_TARGET_MUST_DIFFER');
  assertTarget(sourceRef, sourceUrl, 'SOURCE'); assertTarget(targetRef, targetUrl, 'TARGET');
  const key = Buffer.from(required('J10_INTEGRATION_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) fail('TRANSFER_ENCRYPTION_KEY_INVALID');
  const source = postgres(sourceUrl, { max: 1, onnotice: () => {} });
  const target = postgres(targetUrl, { max: 1, onnotice: () => {} });
  try {
    const canonical = canonicalMigrationVersions();
    if (seedFixture) await seed(source, key);
    const targetExisting = (await Promise.all(retainedTables.map((pair) => exactCount(target, pair)))).reduce((sum, count) => sum + count, 0);
    if (targetExisting !== 0) fail('TRANSFER_TARGET_NOT_EMPTY');
    const targetLedger = await target`select version::text as version from supabase_migrations.schema_migrations order by version`;
    // Legacy Production intentionally has no migration ledger.  It is never
    // copied or synthesized; only the freshly rebuilt target must prove the
    // complete, exact canonical chain before retained rows are imported.
    if (targetLedger.map((row) => row.version).join(",") !== canonical.versions.join(",")) fail('TRANSFER_TARGET_CANONICAL_LEDGER_MISMATCH');
    const transferred = {};
    // The import itself is atomic.  Source reads are performed while the target
    // transaction is open, but no target row survives if a later dependency fails.
    await target.begin(async (tx) => {
      for (const pair of retainedTables) transferred[pair.join('.')] = await copyTable(source, tx, pair);
    });
    const counts = await verify(source, target, key);
    console.log(JSON.stringify({ ok: true, canonicalSha: canonical.checkedOutSha, canonicalMigrationCount: canonical.versions.length, transferred, counts, credentialEnvelope: 'compatible', externalActivity: 0 }));
  } finally { await source.end({ timeout: 5 }); await target.end({ timeout: 5 }); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
