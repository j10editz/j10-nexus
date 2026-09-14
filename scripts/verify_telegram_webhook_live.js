const fs = require('fs');
const crypto = require('crypto');
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

async function verifyWebhook() {
  console.log('=== Step 1: Retrieving Bot Token from Encrypted Vault ===');
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_integration_credential_envelope', {
    p_integration_id: 'f966061f-0003-4bbe-ae2b-e565ba9fd665'
  });
  if (rpcErr || !rpcData || rpcData.length === 0) {
    throw new Error('Could not retrieve credentials from vault: ' + JSON.stringify(rpcErr));
  }
  const envelope = rpcData[0];
  const decrypted = decryptPayload('telegram', envelope);
  const botToken = decrypted.values?.bot_token;
  if (!botToken) throw new Error('Bot token missing in vault envelope');
  console.log('✔ Bot token retrieved securely from vault (token hidden)');

  console.log('=== Step 2: Querying getWebhookInfo from Telegram Bot API ===');
  const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const infoData = await infoRes.json();
  console.log('getWebhookInfo result:', {
    ok: infoData.ok,
    url: infoData.result?.url,
    has_custom_certificate: infoData.result?.has_custom_certificate,
    pending_update_count: infoData.result?.pending_update_count,
    last_error_date: infoData.result?.last_error_date,
    last_error_message: infoData.result?.last_error_message,
    max_connections: infoData.result?.max_connections,
  });

  const targetUrl = 'https://j10-nexus.vercel.app/api/webhooks/telegram';
  const secretToken = envVars.TELEGRAM_WEBHOOK_SECRET || 'j10_nexus_telegram_secret';

  if (infoData.result?.url !== targetUrl) {
    console.log(`Setting permanent Vercel HTTPS webhook endpoint to: ${targetUrl}...`);
    const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        secret_token: secretToken,
        drop_pending_updates: false,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
      }),
    });
    const setData = await setRes.json();
    console.log('setWebhook response:', setData);
  }

  // Re-check
  const finalRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const finalData = await finalRes.json();
  console.log('=== Step 3: Final Webhook Verification Evidence ===');
  console.log({
    url: finalData.result?.url,
    isPermanentVercelEndpoint: finalData.result?.url === targetUrl,
    isCloudflareTunnel: (finalData.result?.url || '').includes('trycloudflare.com'),
    last_error_message: finalData.result?.last_error_message || 'None (Healthy)',
    pending_update_count: finalData.result?.pending_update_count,
  });

  if (finalData.result?.url !== targetUrl) {
    throw new Error(`FAIL: Webhook URL is ${finalData.result?.url}, expected ${targetUrl}`);
  }
  if (finalData.result?.last_error_message) {
    console.warn(`Notice: Telegram reported past error: ${finalData.result.last_error_message}`);
  }

  console.log('✔ Permanent Vercel HTTPS Webhook Verified!');
  process.exit(0);
}

verifyWebhook().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
