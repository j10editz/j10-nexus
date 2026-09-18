const { requireDatabaseUrl } = require("./lib/database-url.cjs");
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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

const ENCRYPTION_ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const poolerUrl = requireDatabaseUrl();
const sql = postgres(poolerUrl, { ssl: "require", max: 1 });

function encryptPayload(providerId: string, values: Record<string, string>, key: Buffer, keyVersion: number) {
  const iv = randomBytes(IV_LENGTH);
  const aad = Buffer.from(`j10-nexus:integration:${providerId}:v${keyVersion}`, "utf8");
  const payload = JSON.stringify({
    providerId,
    values,
    encryptedAt: new Date().toISOString(),
  });

  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted_payload: enc.toString("base64"),
    initialization_vector: iv.toString("base64"),
    authentication_tag: tag.toString("base64"),
    algorithm: ENCRYPTION_ALGORITHM,
    key_version: keyVersion,
  };
}

function decryptPayload(providerId: string, row: any, key: Buffer) {
  const iv = Buffer.from(row.initialization_vector, "base64");
  const tag = Buffer.from(row.authentication_tag, "base64");
  const enc = Buffer.from(row.encrypted_payload, "base64");
  const aad = Buffer.from(`j10-nexus:integration:${providerId}:v${row.key_version}`, "utf8");

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

async function main() {
  console.log("=== STEP 5 & 6: VAULT PRODUCTION BOT CREDENTIAL AND PROVE GETME ===");

  const encKeyRaw = process.env.J10_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!encKeyRaw) {
    throw new Error("J10_INTEGRATION_ENCRYPTION_KEY missing");
  }
  const key = Buffer.from(encKeyRaw, "base64");
  if (key.length !== 32) {
    throw new Error(`Invalid key length: ${key.length}`);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "j10_nexus_telegram_secret";
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN missing from environment");
  }

  // 1. Fetch integrations
  const integrations = await sql`
    SELECT id, workspace_id, provider, status
    FROM public.integrations
    WHERE provider = 'telegram'
  `;
  console.log(`Found ${integrations.length} Telegram integrations in production:`);
  for (const i of integrations) {
    console.log(`- ID: ${i.id}, Workspace: ${i.workspace_id}, Status: ${i.status}`);
  }

  if (integrations.length === 0) {
    throw new Error("No Telegram integrations found in production!");
  }

  // 2. For each integration, ensure vault credentials row exists and is valid
  for (const integ of integrations) {
    const existingCreds = await sql`
      SELECT id, integration_id, workspace_id, provider, encrypted_payload, 
             initialization_vector, authentication_tag, algorithm, key_version
      FROM public.integration_credentials
      WHERE integration_id = ${integ.id}
    `;

    let activeCredRow = existingCreds[0];

    if (!activeCredRow) {
      console.log(`No vault row for integration ${integ.id}. Fetching user_id...`);
      const [userRow] = await sql`
        SELECT user_id FROM public.workspace_memberships 
        WHERE workspace_id = ${integ.workspace_id} 
        ORDER BY created_at ASC LIMIT 1
      `;
      const fallbackUserId = "0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa";
      const userId = userRow?.user_id || integ.user_id || fallbackUserId;

      const encData = encryptPayload("telegram", { bot_token: botToken, webhook_secret: webhookSecret }, key, 1);
      
      const [inserted] = await sql`
        INSERT INTO public.integration_credentials (
          integration_id,
          workspace_id,
          user_id,
          provider,
          encrypted_payload,
          initialization_vector,
          authentication_tag,
          algorithm,
          key_version,
          updated_at
        ) VALUES (
          ${integ.id},
          ${integ.workspace_id},
          ${userId},
          'telegram',
          ${encData.encrypted_payload},
          ${encData.initialization_vector},
          ${encData.authentication_tag},
          ${encData.algorithm},
          ${encData.key_version},
          now()
        )
        RETURNING *
      `;
      activeCredRow = inserted;
      console.log(`✓ Stored encrypted credential row ${activeCredRow.id} for integration ${integ.id}`);
    } else {
      console.log(`✓ Existing vault row found (${activeCredRow.id}) for integration ${integ.id}`);
    }

    // Decrypt and prove getMe
    console.log(`Decrypting credential envelope for integration ${integ.id}...`);
    const decrypted = decryptPayload("telegram", activeCredRow, key);
    if (!decrypted.values?.bot_token) {
      throw new Error(`Decrypted payload missing bot_token for integration ${integ.id}`);
    }

    const decryptedToken = decrypted.values.bot_token;
    console.log(`✓ Successfully decrypted payload without exposing secrets.`);
    console.log(`Executing Telegram getMe with decrypted token...`);

    const getMeRes = await fetch(`https://api.telegram.org/bot${decryptedToken}/getMe`);
    const getMeData = await getMeRes.json();

    if (!getMeRes.ok || !getMeData.ok) {
      throw new Error(`Telegram getMe failed: ${JSON.stringify(getMeData)}`);
    }

    console.log(`✓ Telegram getMe PASSED:`);
    console.log(`  - Bot ID: ${getMeData.result.id}`);
    console.log(`  - Bot Username: @${getMeData.result.username}`);
    console.log(`  - Bot Name: ${getMeData.result.first_name}`);
    console.log(`  - Can Join Groups: ${getMeData.result.can_join_groups}`);
    console.log(`  - Can Read All Group Messages: ${getMeData.result.can_read_all_group_messages}`);
  }

  console.log("\n=== STEPS 5 & 6 COMPLETED AND VERIFIED ===");
  await sql.end();
}

main().catch(err => {
  console.error("FATAL ERROR in Steps 5 & 6:", err);
  process.exit(1);
});
