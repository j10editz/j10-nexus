const fs = require('fs');
const crypto = require('crypto');
const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');

const envVars = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const url = 'postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require';
const sql = postgres(url, { ssl: 'require' });
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SECRET_KEY);

const encKeyBase64 = envVars.J10_INTEGRATION_ENCRYPTION_KEY || 'N+I5XXn3uXQvv7dPW1Sh9TQJZPv+LO2phEwhJ2QsnxI=';
const encryptionKey = Buffer.from(encKeyBase64, 'base64');

function decryptPayload(providerId, envelope) {
  const iv = Buffer.from(envelope.initialization_vector, 'base64');
  const tag = Buffer.from(envelope.authentication_tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv, { authTagLength: 16 });
  const aad = Buffer.from(`j10-nexus:integration:${providerId}:v${envelope.key_version}`, 'utf8');
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.encrypted_payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(decrypted);
}

async function run() {
  console.log('=== TEST: Vault Credential Security & Verification ===');
  
  // 1. Fetch via RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_integration_credential_envelope', {
    p_integration_id: 'f966061f-0003-4bbe-ae2b-e565ba9fd665'
  });
  if (rpcErr || !rpcData || rpcData.length === 0) {
    throw new Error('Failed to retrieve envelope via RPC: ' + JSON.stringify(rpcErr));
  }
  console.log('✔ Envelope retrieved securely via RPC');

  const envelope = rpcData[0];
  const decrypted = decryptPayload('telegram', envelope);
  if (!decrypted.values?.bot_token || !decrypted.values.bot_token.startsWith('8687561980:')) {
    throw new Error('Decrypted bot token invalid or mismatch');
  }
  console.log('✔ AES-256-GCM Decryption verified: Token present & authenticated');

  // 2. Direct DB verification: assert zero plaintext tokens in metadata/public_configuration
  const [integ] = await sql`
    SELECT metadata, public_configuration
    FROM integrations
    WHERE id = 'f966061f-0003-4bbe-ae2b-e565ba9fd665'
  `;
  const metaStr = JSON.stringify(integ.metadata || {});
  const pubStr = JSON.stringify(integ.public_configuration || {});

  if (metaStr.includes('8687561980:') || pubStr.includes('8687561980:')) {
    throw new Error('FAIL: Plaintext token found in integrations table!');
  }
  if (integ.metadata?.bot_token || integ.public_configuration?.bot_token || integ.public_configuration?.telegramBotToken) {
    throw new Error('FAIL: Plaintext token field found in metadata or public_configuration!');
  }
  console.log('✔ Zero plaintext tokens in integrations.metadata and public_configuration');
  console.log('=== ALL VAULT CREDENTIAL TESTS PASSED ===');
  process.exit(0);
}

run().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
