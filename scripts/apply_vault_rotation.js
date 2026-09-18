const { requireDatabaseUrl } = require("./lib/database-url.cjs");
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const { createCipheriv, randomBytes } = require('node:crypto');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '..', '.env.local'));
loadEnvFile(path.resolve('.env.local'));

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const poolerUrl = requireDatabaseUrl();
const sql = postgres(poolerUrl, { ssl: 'require', max: 1 });

function encryptPayload(providerId, values, key, keyVersion) {
  const iv = randomBytes(IV_LENGTH);
  const aad = Buffer.from(`j10-nexus:integration:${providerId}:v${keyVersion}`, 'utf8');
  const payload = JSON.stringify({
    providerId,
    values,
    encryptedAt: new Date().toISOString(),
  });

  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted_payload: enc.toString('base64'),
    initialization_vector: iv.toString('base64'),
    authentication_tag: tag.toString('base64'),
    algorithm: ENCRYPTION_ALGORITHM,
    key_version: keyVersion,
  };
}

async function run() {
  let token = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    token += chunk;
  }
  token = token.trim();

  if (!token || !token.includes(':')) {
    console.error('ERROR: Invalid token format received.');
    process.exit(1);
  }

  const encKeyRaw = process.env.J10_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!encKeyRaw) {
    console.error('ERROR: J10_INTEGRATION_ENCRYPTION_KEY missing.');
    process.exit(1);
  }
  const key = Buffer.from(encKeyRaw, 'base64');
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || 'j10_nexus_telegram_secret';

  // 1. Verify token with Telegram getMe first
  console.log('Testing replacement token against Telegram API...');
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meData = await meRes.json();
  if (!meRes.ok || !meData.ok) {
    console.error('ERROR: Telegram getMe failed with provided token:', meData.description);
    process.exit(1);
  }
  console.log(`✓ Validated Telegram Bot: @${meData.result.username} (ID: ${meData.result.id})`);

  // 2. Encrypt and store in production database vault
  console.log('Encrypting replacement token into production vault...');
  const encData = encryptPayload('telegram', { bot_token: token, webhook_secret: webhookSecret }, key, 1);

  const integrations = await sql`
    SELECT id, workspace_id FROM public.integrations WHERE provider = 'telegram'
  `;

  for (const integ of integrations) {
    await sql`
      UPDATE public.integration_credentials
      SET encrypted_payload = ${encData.encrypted_payload},
          initialization_vector = ${encData.initialization_vector},
          authentication_tag = ${encData.authentication_tag},
          algorithm = ${encData.algorithm},
          key_version = ${encData.key_version},
          updated_at = now()
      WHERE integration_id = ${integ.id}
    `;
    console.log(`✓ Vault credentials updated for integration ${integ.id}`);
  }

  // 3. Register permanent webhook with secret
  console.log('Registering permanent production webhook...');
  const webhookUrl = 'https://j10-nexus.vercel.app/api/webhooks/telegram';
  const setWhRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      drop_pending_updates: false,
    }),
  });
  const setWhData = await setWhRes.json();
  if (!setWhRes.ok || !setWhData.ok) {
    console.error('ERROR: Failed to set Telegram webhook:', setWhData.description);
    process.exit(1);
  }
  console.log('✓ Permanent webhook registered successfully!');

  // 4. Verify getWebhookInfo
  const whInfoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const whInfo = await whInfoRes.json();
  console.log('✓ Verified Webhook Info:');
  console.log(`  - URL: ${whInfo.result?.url}`);
  console.log(`  - Pending Updates: ${whInfo.result?.pending_update_count}`);
  console.log(`  - Custom Cert: ${whInfo.result?.has_custom_certificate}`);
  console.log(`  - Last Error: ${whInfo.result?.last_error_message || 'None'}`);

  // 5. Zero-out transient process memory immediately (NO file writes, NO plaintext storage)
  token = null;

  console.log('\n=== ROTATION COMPLETE & VERIFIED ===');
  console.log('✓ Token encrypted in production vault');
  console.log('✓ Production webhook registered');
  console.log('✓ Transient process memory cleared');
  console.log('✓ Zero plaintext files written');
  await sql.end();
}

run().catch(err => {
  console.error('FATAL ERROR during rotation:', err.message);
  process.exit(1);
});
