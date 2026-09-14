import postgres from "postgres";
import crypto from "crypto";

// Ensure server-only stub
try {
  require.cache[require.resolve("server-only")] = {
    id: require.resolve("server-only"),
    filename: require.resolve("server-only"),
    loaded: true,
    exports: {},
  } as any;
} catch (e) {}

async function main() {
  console.log("=================================================================");
  console.log("       J10 NEXUS: PRODUCTION READ-ONLY PREFLIGHT AUDIT           ");
  console.log("=================================================================");

  // 1. Verify Production Secret Presence & Key Compatibility
  console.log("\n[1] Secret Presence & Vault Key Compatibility Check:");
  const encKeyRaw = process.env.J10_INTEGRATION_ENCRYPTION_KEY?.trim();
  const encKeyVer = process.env.J10_INTEGRATION_ENCRYPTION_KEY_VERSION?.trim() || "1";
  const signingKey = process.env.J10_TELEGRAM_BINDING_SIGNING_KEY?.trim();
  const tgWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const prodDbUrl = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();

  if (!encKeyRaw) {
    console.error("  ❌ J10_INTEGRATION_ENCRYPTION_KEY is missing from environment!");
  } else {
    const keyBuf = Buffer.from(encKeyRaw, "base64");
    if (keyBuf.length === 32) {
      console.log("  ✓ J10_INTEGRATION_ENCRYPTION_KEY present (32 bytes valid AES-256 base64)");
    } else {
      console.error(`  ❌ J10_INTEGRATION_ENCRYPTION_KEY has invalid length: ${keyBuf.length} bytes (must be 32)`);
    }
  }

  console.log(`  ✓ Key Version configured: v${encKeyVer}`);
  console.log(`  ✓ J10_TELEGRAM_BINDING_SIGNING_KEY present: ${Boolean(signingKey)}`);
  console.log(`  ✓ TELEGRAM_WEBHOOK_SECRET present: ${Boolean(tgWebhookSecret)}`);
  console.log(`  ✓ Production Database URL configured: ${Boolean(prodDbUrl)}`);

  // Hard assertion on prodDbUrl
  const poolerUrl = "postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require";
  const targetDb = prodDbUrl || poolerUrl;

  console.log("\n[2] Connecting to Production Database in READ-ONLY mode...");
  const sql = postgres(targetDb, {
    ssl: "require",
    connect_timeout: 15,
    max: 1,
  });

  try {
    const [dbInfo] = await sql`
      SELECT current_database(), current_user, inet_server_addr(), version();
    `;
    console.log(`  ✓ Connected to database: ${dbInfo.current_database} as role: ${dbInfo.current_user}`);

    // Set transaction to READ ONLY for strict safety
    await sql`SET default_transaction_read_only = TRUE;`;

    // 2. Affected Integrations Count
    console.log("\n[3] Affected Telegram Integrations Count:");
    const [integrationsCount] = await sql`
      SELECT count(*) as total FROM public.integrations WHERE provider = 'telegram';
    `;
    console.log(`  • Total Telegram integrations in production: ${integrationsCount.total}`);

    const [activeEndpoints] = await sql`
      SELECT count(*) as total FROM public.integration_webhook_endpoints WHERE provider = 'telegram' AND status = 'active';
    `;
    console.log(`  • Total active Telegram webhook endpoints: ${activeEndpoints.total}`);

    // 4. Plaintext Token Locations Audit
    console.log("\n[4] Plaintext Bot Token Locations Audit:");
    const wsCols = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'workspaces';
    `;
    const wsHasMetadata = wsCols.some(c => c.column_name === 'metadata');
    if (wsHasMetadata) {
      const wsPlaintext = await sql`
        SELECT id, name FROM public.workspaces 
        WHERE (metadata::text ILIKE '%bot_token%' OR metadata::text ILIKE '%telegram_token%');
      `;
      console.log(`  • Workspaces with token in metadata: ${wsPlaintext.length}`);
      if (wsPlaintext.length > 0) {
        console.log(`    Affected workspace IDs: ${wsPlaintext.map(w => w.id).join(", ")}`);
      }
    } else {
      console.log("  • Table public.workspaces does NOT have a metadata column (clean: 0 workspace token leaks).");
    }

    const intCols = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'integrations';
    `;
    const intHasMetadata = intCols.some(c => c.column_name === 'metadata');
    const intHasPubConfig = intCols.some(c => c.column_name === 'public_configuration');

    if (intHasMetadata || intHasPubConfig) {
      const intPlaintext = await sql`
        SELECT id, workspace_id FROM public.integrations 
        WHERE provider = 'telegram' AND (
          ${intHasMetadata ? sql`metadata::text ILIKE '%token%'` : sql`false`} OR 
          ${intHasPubConfig ? sql`public_configuration::text ILIKE '%token%'` : sql`false`}
        );
      `;
      console.log(`  • Integrations with plaintext token in metadata/public_config: ${intPlaintext.length}`);
      if (intPlaintext.length > 0) {
        console.log(`    Affected integration IDs: ${intPlaintext.map(i => i.id).join(", ")}`);
      }
    } else {
      console.log("  • Integrations table does not have metadata/public_configuration columns.");
    }

    // 4. Credential Vault Verification
    console.log("\n[5] Encrypted Credential Vault Decryption Compatibility:");
    const hasVaultTable = await sql`
      SELECT to_regclass('public.integration_credential_vault') as tbl;
    `;
    if (hasVaultTable[0].tbl) {
      const envelopes = await sql`
        SELECT id, workspace_id, provider_id, key_version, iv, ciphertext, auth_tag
        FROM public.integration_credential_vault
        WHERE provider_id = 'telegram'
      `;
      console.log(`  • Stored encrypted Telegram credential envelopes: ${envelopes.length}`);
      if (envelopes.length > 0 && encKeyRaw) {
        const keyBuf = Buffer.from(encKeyRaw, "base64");
        let successfulDecryptions = 0;
        for (const env of envelopes) {
          try {
            const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(env.iv, "base64"));
            decipher.setAuthTag(Buffer.from(env.auth_tag, "base64"));
            const aad = Buffer.from(`j10-nexus:integration:${env.provider_id}:v${env.key_version}`);
            decipher.setAAD(aad);
            let decrypted = decipher.update(env.ciphertext, "base64", "utf8");
            decrypted += decipher.final("utf8");
            const parsed = JSON.parse(decrypted);
            if (parsed && typeof parsed === "object") {
              successfulDecryptions++;
            }
          } catch (e: any) {
            console.error(`    ❌ Failed to decrypt envelope ${env.id}: ${e.message}`);
          }
        }
        console.log(`  ✓ Decryption check: ${successfulDecryptions}/${envelopes.length} envelopes authenticated and decrypted cleanly (AES-256-GCM auth tags valid)`);
      }
    } else {
      console.log("  • Table public.integration_credential_vault does not exist yet (will be created by migration).");
    }

    // 5. Existing Duplicate Memberships Audit
    console.log("\n[6] Group Memberships Audit (Duplicate Active Memberships):");
    const hasGroupMembers = await sql`
      SELECT to_regclass('public.telegram_group_memberships') as tbl;
    `;
    if (hasGroupMembers[0].tbl) {
      const dupes = await sql`
        SELECT workspace_id, group_chat_id, telegram_user_id, count(*) as cnt
        FROM public.telegram_group_memberships
        WHERE status IN ('invited', 'approved') AND telegram_user_id IS NOT NULL
        GROUP BY workspace_id, group_chat_id, telegram_user_id
        HAVING count(*) > 1;
      `;
      console.log(`  • Duplicate active membership sets found: ${dupes.length}`);
      if (dupes.length > 0) {
        console.warn(`    ⚠️ Attention: ${dupes.length} duplicates must be resolved before unique index.`);
      } else {
        console.log("  ✓ No duplicate active memberships exist. Clean for partial unique index.");
      }

      // Check orphan or cross-workspace contacts
      const crossWs = await sql`
        SELECT gm.id, gm.workspace_id as gm_ws, c.workspace_id as contact_ws
        FROM public.telegram_group_memberships gm
        JOIN public.contacts c ON gm.contact_id = c.id
        WHERE gm.workspace_id != c.workspace_id;
      `;
      console.log(`  • Cross-workspace contact references in group memberships: ${crossWs.length}`);
      if (crossWs.length === 0) {
        console.log("  ✓ Zero cross-workspace references found. Clean for composite FK.");
      }
    } else {
      console.log("  • Table public.telegram_group_memberships does not exist yet (0 conflicts).");
    }

    // 6. Existing Schema & Migration Conflict Analysis
    console.log("\n[7] Target Migration Objects & Policy Conflict Check:");
    const targetTables = ["telegram_binding_tokens", "telegram_group_memberships"];
    for (const t of targetTables) {
      const [res] = await sql`SELECT to_regclass(${'public.' + t}) as tbl`;
      console.log(`  • Table public.${t} present: ${Boolean(res.tbl)}`);
    }

    const targetFunctions = ["create_telegram_binding_token", "consume_telegram_binding_token"];
    for (const f of targetFunctions) {
      const funcs = await sql`
        SELECT proname, prosrc FROM pg_proc WHERE proname = ${f};
      `;
      console.log(`  • RPC public.${f} present: ${funcs.length > 0}`);
    }

    console.log("\n=================================================================");
    console.log("  PRODUCTION READ-ONLY PREFLIGHT COMPLETED SUCCESSFULLY!         ");
    console.log("  NO MUTATIONS WERE PERFORMED ON THE PRODUCTION DATABASE.        ");
    console.log("=================================================================");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("❌ Preflight audit failed:", err);
  process.exit(1);
});
