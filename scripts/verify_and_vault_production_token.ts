import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { encryptIntegrationCredentialEnvelope, decryptIntegrationCredentialEnvelope } from "../lib/integrations/vault/encryption";

// Stub server-only
try {
  require.cache[require.resolve("server-only")] = {
    id: require.resolve("server-only"),
    filename: require.resolve("server-only"),
    loaded: true,
    exports: {},
  } as any;
} catch (e) {}

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

const poolerUrl = "postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require";
const sql = postgres(poolerUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("=== CHECKING PRODUCTION TELEGRAM INTEGRATIONS & VAULT ===");

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    console.error("FATAL: TELEGRAM_BOT_TOKEN missing from environment.");
    process.exit(1);
  }

  const integrations = await sql`
    SELECT id, workspace_id, provider, status, created_at
    FROM public.integrations
    WHERE provider = 'telegram'
  `;
  console.log(`Found ${integrations.length} Telegram integration records in production:`);
  for (const integ of integrations) {
    console.log(`- Integration ${integ.id} (workspace: ${integ.workspace_id}, status: ${integ.status})`);
  }

  // Check credentials table
  const creds = await sql`
    SELECT id, integration_id, key_version, created_at, updated_at
    FROM public.integration_credentials
    WHERE integration_id IN ${sql(integrations.map(i => i.id))}
  `;
  console.log(`Found ${creds.length} existing credential vault records for these integrations.`);

  let verifiedFromVault = false;

  for (const integ of integrations) {
    let credRecord = creds.find(c => c.integration_id === integ.id);

    if (!credRecord) {
      console.log(`Storing bot token into encrypted vault for integration ${integ.id}...`);
      const envelope = encryptIntegrationCredentialEnvelope({
        bot_token: botToken,
        provider: "telegram",
        is_official: true,
      });

      const [newCred] = await sql`
        INSERT INTO public.integration_credentials (
          integration_id,
          encrypted_blob,
          iv,
          auth_tag,
          key_version,
          updated_at
        ) VALUES (
          ${integ.id},
          ${envelope.encrypted_blob},
          ${envelope.iv},
          ${envelope.auth_tag},
          ${envelope.key_version},
          now()
        )
        RETURNING id, integration_id, key_version
      `;
      console.log(`✓ Vault record created: ${newCred.id} (key_version: ${newCred.key_version})`);
      credRecord = newCred;
    }

    // Now test decryption from vault
    const [fullCred] = await sql`
      SELECT encrypted_blob, iv, auth_tag, key_version
      FROM public.integration_credentials
      WHERE integration_id = ${integ.id}
    `;

    if (fullCred) {
      const decrypted = decryptIntegrationCredentialEnvelope({
        encrypted_blob: fullCred.encrypted_blob,
        iv: fullCred.iv,
        auth_tag: fullCred.auth_tag,
        key_version: fullCred.key_version,
      });

      const tokenFromVault = decrypted.values?.bot_token;
      if (!tokenFromVault) {
        throw new Error(`Failed to decrypt bot_token from vault for integration ${integ.id}`);
      }

      console.log(`✓ Decrypted token from vault for integration ${integ.id}. Testing Telegram getMe...`);
      const meRes = await fetch(`https://api.telegram.org/bot${tokenFromVault}/getMe`);
      const meData = await meRes.json();
      if (!meRes.ok || !meData.ok) {
        throw new Error(`Telegram getMe failed: ${JSON.stringify(meData)}`);
      }

      console.log(`✓ Telegram getMe PASSED! Bot ID: ${meData.result.id}, Username: @${meData.result.username}, Name: ${meData.result.first_name}`);
      verifiedFromVault = true;
    }
  }

  if (!verifiedFromVault) {
    throw new Error("Could not verify any Telegram integration from vault!");
  }

  console.log("\n=== VAULT DECRYPTION & TELEGRAM GETME VERIFICATION COMPLETE ===");
  await sql.end();
}

main().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
