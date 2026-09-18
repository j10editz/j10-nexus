const { requireDatabaseUrl } = require("./lib/database-url.cjs");
const postgres = require('postgres');
const crypto = require('crypto');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const envVars = Object.fromEntries(
  env
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const url = requireDatabaseUrl();
const sql = postgres(url, { ssl: 'require', connect_timeout: 10 });

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const encKeyBase64 = envVars.J10_INTEGRATION_ENCRYPTION_KEY;
if (!encKeyBase64) {
  throw new Error('J10_INTEGRATION_ENCRYPTION_KEY must be configured.');
}
const encryptionKey = Buffer.from(encKeyBase64, 'base64');
if (encryptionKey.length !== 32) {
  throw new Error('J10_INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes.');
}
const keyVersion = Number(envVars.J10_INTEGRATION_ENCRYPTION_KEY_VERSION || '1');

function encryptValues(providerId, values) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv, { authTagLength: 16 });
  const aad = Buffer.from(`j10-nexus:integration:${providerId}:v${keyVersion}`, 'utf8');
  cipher.setAAD(aad);

  const payload = JSON.stringify({
    providerId,
    values,
    encryptedAt: new Date().toISOString(),
  });

  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    algorithm: ENCRYPTION_ALGORITHM,
    keyVersion,
  };
}

function decryptValues(providerId, envelope) {
  const iv = Buffer.from(envelope.initialization_vector, 'base64');
  const tag = Buffer.from(envelope.authentication_tag, 'base64');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv, { authTagLength: 16 });
  const aad = Buffer.from(`j10-nexus:integration:${providerId}:v${envelope.key_version}`, 'utf8');
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.encrypted_payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(decrypted);
}

async function migrate() {
  try {
    console.log('--- Step 0: Checking schema of integration_credentials ---');
    const cols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'integration_credentials'
    `;
    console.log('COLUMNS in integration_credentials:', cols.map(c => c.column_name));

    console.log('--- Step 1: Inspecting Telegram integrations ---');
    const rows = await sql`
      SELECT id, workspace_id, user_id, provider, status, credential_reference, metadata, public_configuration
      FROM integrations
      WHERE provider = 'telegram'
    `;
    console.log(`Found ${rows.length} Telegram integrations.`);

    for (const row of rows) {
      const token = row.metadata?.bot_token || row.public_configuration?.bot_token || row.public_configuration?.telegramBotToken;
      if (!token) {
        console.log(`Row ${row.id} has no plaintext token to migrate.`);
        continue;
      }

      console.log(`Encrypting token for integration ${row.id}...`);
      const envelope = encryptValues('telegram', {
        bot_token: token,
        webhook_secret: row.metadata?.webhook_secret || 'j10_nexus_telegram_secret',
      });

      let userId = row.user_id;
      if (!userId) {
        const owner = await sql`
          SELECT user_id FROM workspace_memberships WHERE workspace_id = ${row.workspace_id} ORDER BY created_at ASC LIMIT 1
        `;
        userId = owner[0]?.user_id;
      }

      // Insert or update integration_credentials table
      let credentialId = row.credential_reference;
      if (credentialId) {
        await sql`
          UPDATE integration_credentials
          SET encrypted_payload = ${envelope.encryptedPayload},
              initialization_vector = ${envelope.iv},
              authentication_tag = ${envelope.tag},
              algorithm = ${envelope.algorithm},
              key_version = ${envelope.keyVersion},
              provider = 'telegram',
              user_id = ${userId},
              workspace_id = ${row.workspace_id},
              rotated_at = NOW(),
              updated_at = NOW()
          WHERE id = ${credentialId}
        `;
      } else {
        const credRes = await sql`
          INSERT INTO integration_credentials (
            integration_id, workspace_id, user_id, provider, encrypted_payload, initialization_vector, authentication_tag, algorithm, key_version
          ) VALUES (
            ${row.id}, ${row.workspace_id}, ${userId}, 'telegram', ${envelope.encryptedPayload}, ${envelope.iv}, ${envelope.tag}, ${envelope.algorithm}, ${envelope.keyVersion}
          ) RETURNING id
        `;
        credentialId = credRes[0].id;
      }

      // Purge plaintext tokens completely from metadata and public_configuration
      const safeMetadata = { ...(row.metadata || {}) };
      delete safeMetadata.bot_token;
      delete safeMetadata.telegramBotToken;
      delete safeMetadata.token;
      delete safeMetadata.gemini_api_key;
      delete safeMetadata.webhook_secret;

      const safePublicConfig = { ...(row.public_configuration || {}) };
      delete safePublicConfig.bot_token;
      delete safePublicConfig.telegramBotToken;
      delete safePublicConfig.token;

      await sql`
        UPDATE integrations
        SET credential_reference = ${credentialId},
            metadata = ${JSON.stringify(safeMetadata)},
            public_configuration = ${JSON.stringify(safePublicConfig)},
            status = 'connected',
            updated_at = NOW()
        WHERE id = ${row.id}
      `;

      console.log(`Successfully encrypted and purged plaintext token for integration ${row.id}!`);

      // Verify decryption
      const verifyRow = await sql`
        SELECT * FROM integration_credentials WHERE id = ${credentialId}
      `;
      const decrypted = decryptValues('telegram', verifyRow[0]);
      console.log(`Verified vault decryption: Provider=${decrypted.providerId}, HasBotToken=${Boolean(decrypted.values.bot_token)}, BotTokenPrefix=${decrypted.values.bot_token.slice(0, 5)}...`);
    }

    console.log('--- Step 2: Final Verification of integrations table ---');
    const finalCheck = await sql`
      SELECT id, provider, status, credential_reference, metadata, public_configuration
      FROM integrations
      WHERE provider = 'telegram'
    `;
    console.log('Final integrations state (Notice ZERO plaintext tokens):', JSON.stringify(finalCheck, null, 2));

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await sql.end();
  }
}

migrate();
