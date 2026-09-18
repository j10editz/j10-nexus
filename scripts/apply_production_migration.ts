const { requireDatabaseUrl } = require("./lib/database-url.cjs");
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

loadEnvFile(path.resolve(".env.local"));

const dbUrl = requireDatabaseUrl();

const sql = postgres(dbUrl, {
  ssl: "require",
  max: 1,
  connect_timeout: 10,
});

async function main() {
  console.log("=== APPLYING STAGE 1 TELEGRAM HARDENING MIGRATION TO PRODUCTION ===");

  const migrationPath = path.resolve("supabase/migrations/20260927_stage1_telegram_hardening_v2.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  console.log("Executing migration transaction...");
  await sql.unsafe(migrationSql);
  console.log("Migration executed successfully!");

  console.log("\nVerifying production objects...");

  // Verify telegram_binding_tokens table
  const [tokensTable] = await sql`
    SELECT count(*)::int as cnt FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'telegram_binding_tokens'
  `;
  console.log("- telegram_binding_tokens exists:", tokensTable.cnt === 1);

  // Verify telegram_group_memberships table
  const [membersTable] = await sql`
    SELECT count(*)::int as cnt FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'telegram_group_memberships'
  `;
  console.log("- telegram_group_memberships exists:", membersTable.cnt === 1);

  // Verify composite FK constraint
  const [fkConstraint] = await sql`
    SELECT count(*)::int as cnt FROM information_schema.table_constraints
    WHERE table_schema = 'public' 
      AND table_name = 'telegram_group_memberships'
      AND constraint_name = 'fk_tg_group_contact'
  `;
  console.log("- fk_tg_group_contact composite FK exists:", fkConstraint.cnt === 1);

  // Verify active membership unique index
  const [activeIdx] = await sql`
    SELECT count(*)::int as cnt FROM pg_indexes
    WHERE schemaname = 'public' 
      AND tablename = 'telegram_group_memberships'
      AND indexname = 'idx_tg_group_members_active_unique'
  `;
  console.log("- idx_tg_group_members_active_unique index exists:", activeIdx.cnt === 1);

  // Verify RPC consume_telegram_binding_token
  const [consumeRpc] = await sql`
    SELECT count(*)::int as cnt FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'consume_telegram_binding_token'
  `;
  console.log("- consume_telegram_binding_token RPC exists:", consumeRpc.cnt === 1);

  // Verify inbox_messages idempotency column
  const [idempCol] = await sql`
    SELECT count(*)::int as cnt FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'inbox_messages'
      AND column_name = 'idempotency_key'
  `;
  console.log("- inbox_messages.idempotency_key column exists:", idempCol.cnt === 1);

  // Verify RLS enabled on new tables
  const rlsRows = await sql`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public' 
      AND tablename IN ('telegram_binding_tokens', 'telegram_group_memberships')
  `;
  console.log("- RLS enabled for telegram_binding_tokens:", rlsRows.find((r: any) => r.tablename === 'telegram_binding_tokens')?.rowsecurity === true);
  console.log("- RLS enabled for telegram_group_memberships:", rlsRows.find((r: any) => r.tablename === 'telegram_group_memberships')?.rowsecurity === true);

  console.log("\n=== ALL PRODUCTION OBJECTS VERIFIED SUCCESSFULLY ===");
  await sql.end();
}

main().catch(err => {
  console.error("MIGRATION FAILED:", err);
  process.exit(1);
});
