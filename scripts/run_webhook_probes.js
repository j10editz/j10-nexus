const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

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

loadEnvFile(path.resolve('.env.local'));

const poolerUrl = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || "postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require";
const sql = postgres(poolerUrl, { ssl: "require", max: 1 });

async function getCounts() {
  const [c] = await sql`SELECT count(*)::int as count FROM public.contacts`;
  const [t] = await sql`SELECT count(*)::int as count FROM public.inbox_threads`;
  const [m] = await sql`SELECT count(*)::int as count FROM public.inbox_messages`;
  const [i] = await sql`SELECT count(*)::int as count FROM public.lead_intakes`;
  return { contacts: c.count, threads: t.count, messages: m.count, intakes: i.count };
}

async function run() {
  console.log("=== WAITING FOR VERCEL DEPLOYMENT WITH STRICT SECRET VALIDATION ===");
  
  const expectedSecret = "j10_nexus_telegram_secret"; // Default or environment secret
  let deploymentId = "";

  // Poll until Probe 1 returns 401
  for (let i = 0; i < 20; i++) {
    const res = await fetch("https://j10-nexus.vercel.app/api/webhooks/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ping: true })
    });
    deploymentId = res.headers.get("x-vercel-id") || "";
    console.log(`Poll ${i+1}: Missing secret returned ${res.status} (x-vercel-id: ${deploymentId})`);
    if (res.status === 401 || res.status === 403) {
      console.log("✓ New deployment is LIVE and enforcing secret token authentication!");
      break;
    }
    await new Promise(r => setTimeout(r, 6000));
  }

  const initialCounts = await getCounts();
  console.log("Initial database row counts:", initialCounts);

  // Probe 1: Missing Secret
  console.log("\n[PROBE 1] Missing Secret Token:");
  const probe1 = await fetch("https://j10-nexus.vercel.app/api/webhooks/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ping: true })
  });
  console.log(`Probe 1 Status: ${probe1.status} (Expected: 401 or 403)`);

  // Probe 2: Incorrect Secret
  console.log("\n[PROBE 2] Incorrect Secret Token:");
  const probe2 = await fetch("https://j10-nexus.vercel.app/api/webhooks/telegram", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": "invalid_wrong_secret_12345"
    },
    body: JSON.stringify({ ping: true })
  });
  console.log(`Probe 2 Status: ${probe2.status} (Expected: 401 or 403)`);

  // Probe 3: Correct Secret with harmless payload
  console.log("\n[PROBE 3] Valid Secret Token with harmless payload:");
  const probe3 = await fetch("https://j10-nexus.vercel.app/api/webhooks/telegram", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": expectedSecret
    },
    body: JSON.stringify({ ping: true })
  });
  const probe3Body = await probe3.text();
  console.log(`Probe 3 Status: ${probe3.status} (Expected: 200)`);
  console.log(`Probe 3 Body: ${probe3Body}`);

  const postCounts = await getCounts();
  console.log("\nPost-probe database row counts:", postCounts);

  const delta = (postCounts.contacts - initialCounts.contacts) +
                (postCounts.threads - initialCounts.threads) +
                (postCounts.messages - initialCounts.messages) +
                (postCounts.intakes - initialCounts.intakes);

  console.log(`\nDatabase Mutation Count: ${delta}`);
  console.log(`Final Deployment ID: ${deploymentId}`);

  await sql.end();
}

run().catch(err => {
  console.error("FATAL ERROR in probes:", err);
  process.exit(1);
});
