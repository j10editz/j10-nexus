const fs = require('fs');

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq !== -1) {
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  }
  return env;
}

const env = loadEnv('.env.local');

async function verify() {
  console.log('======================================================');
  console.log('       J10 NEXUS PLATFORM ACCOUNTS LIVE AUDIT         ');
  console.log('======================================================\n');

  // 1. Supabase
  const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = env.SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  console.log('1. SUPABASE / POSTGRESQL');
  console.log('   URL:', sbUrl ? 'Configured' : 'Missing');
  if (sbUrl) {
    try {
      const res = await fetch(sbUrl + '/rest/v1/', { headers: { apikey: sbKey } });
      console.log('   Live Status:', res.status === 200 ? 'ACTIVE & CONNECTED (HTTP 200 OK)' : 'HTTP ' + res.status);
    } catch (e) {
      console.log('   Ping Error:', e.message);
    }
  }

  // 2. Telegram
  const tgToken = env.TELEGRAM_BOT_TOKEN;
  console.log('\n2. TELEGRAM (@BotFather)');
  console.log('   Token:', tgToken ? 'Configured' : 'Missing');
  if (tgToken) {
    try {
      const res = await fetch('https://api.telegram.org/bot' + tgToken + '/getMe');
      const data = await res.json();
      if (data.ok) {
        console.log('   Bot Username: @' + data.result.username);
        console.log('   Bot Display Name: ' + data.result.first_name);
        console.log('   Live Status: ACTIVE & CONNECTED (Telegram Bot API responding)');
      } else {
        console.log('   Live Status: REJECTED (' + data.description + ')');
      }
    } catch (e) {
      console.log('   Ping Error:', e.message);
    }
  }

  // 3. Gemini
  const geminiKey = env.GEMINI_API_KEY;
  console.log('\n3. GOOGLE AI STUDIO (GEMINI)');
  console.log('   API Key:', geminiKey ? 'Configured' : 'Missing');
  if (geminiKey) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + geminiKey);
      const data = await res.json();
      if (data.models) {
        console.log('   Models Available:', data.models.length + ' foundation models');
        console.log('   Live Status: ACTIVE & CONNECTED (Gemini API responding)');
      } else {
        console.log('   Live Status: ERROR (' + (data.error ? data.error.message : JSON.stringify(data)) + ')');
      }
    } catch (e) {
      console.log('   Ping Error:', e.message);
    }
  }

  // 4. Stripe
  const stripeKey = env['SANDBOX-STRIPE_SECRET_KEY'] || env.STRIPE_SECRET_KEY;
  console.log('\n4. STRIPE (SUBSCRIPTION BILLING)');
  console.log('   Key Mode:', stripeKey ? (stripeKey.startsWith('sk_test_') ? 'Test / Sandbox Mode' : 'Live Mode') : 'Missing');
  if (stripeKey) {
    try {
      const res = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: 'Bearer ' + stripeKey }
      });
      const data = await res.json();
      if (data.object === 'balance') {
        console.log('   Live Status: ACTIVE & CONNECTED (Stripe Merchant API responding)');
      } else {
        console.log('   Live Status: ERROR (' + (data.error ? data.error.message : JSON.stringify(data)) + ')');
      }
    } catch (e) {
      console.log('   Ping Error:', e.message);
    }
  }

  // 5. Meta WhatsApp
  const metaToken = env.META_WHATSAPP_ACCESS_TOKEN;
  const metaPhoneId = env.META_WHATSAPP_PHONE_NUMBER_ID;
  console.log('\n5. META FOR DEVELOPERS (WHATSAPP CLOUD API)');
  console.log('   App ID:', env.META_APP_ID || 'Missing');
  console.log('   Phone Number ID:', metaPhoneId || 'Missing');
  if (metaToken && metaPhoneId) {
    try {
      const res = await fetch('https://graph.facebook.com/v20.0/' + metaPhoneId, {
        headers: { Authorization: 'Bearer ' + metaToken }
      });
      const data = await res.json();
      if (data.id) {
        console.log('   Phone Number:', data.display_phone_number || data.id);
        console.log('   Verified Name:', data.verified_name || 'In Review / Sandbox');
        console.log('   Quality Rating:', data.quality_rating || 'Available');
        console.log('   Live Status: ACTIVE & CONNECTED (Meta Graph API responding)');
      } else {
        console.log('   Live Status: NOTICE (' + (data.error ? data.error.message : JSON.stringify(data)) + ')');
      }
    } catch (e) {
      console.log('   Ping Error:', e.message);
    }
  }

  // 6. Resend
  const resendKey = env.RESEND_API_KEY;
  console.log('\n6. RESEND (TRANSACTIONAL EMAILS)');
  console.log('   Key:', resendKey ? 'Configured' : 'Missing (process.env.RESEND_API_KEY not set)');
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/api-keys', {
        headers: { Authorization: 'Bearer ' + resendKey }
      });
      const data = await res.json();
      console.log('   Live Status:', res.status === 200 ? 'ACTIVE & CONNECTED' : 'HTTP ' + res.status);
    } catch (e) {
      console.log('   Ping Error:', e.message);
    }
  }

  console.log('\n======================================================');
}

verify();
