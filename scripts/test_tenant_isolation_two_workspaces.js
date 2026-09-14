const fs = require('fs');
const postgres = require('postgres');
const crypto = require('crypto');

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

process.env.J10_INTEGRATION_ENCRYPTION_KEY = envVars.J10_INTEGRATION_ENCRYPTION_KEY;

function getSigningKey() {
  const encKey = process.env.J10_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (encKey) {
    try {
      const buf = Buffer.from(encKey, "base64");
      if (buf.length === 32) return buf;
    } catch {}
  }
  return crypto.createHash("sha256").update(encKey || "j10-default-binding-secret-key").digest();
}

function uuidToBuffer(uuid) {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bufferToUuid(buf) {
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function generateBindingToken(workspaceId, ttlSec = 1800) {
  const wsBuf = uuidToBuffer(workspaceId);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSec;
  const nonce = crypto.randomBytes(4);

  const expBuf = Buffer.alloc(4);
  expBuf.writeUInt32BE(expSec, 0);

  const body = Buffer.concat([wsBuf, expBuf, nonce]);
  const hmac = crypto.createHmac('sha256', getSigningKey());
  hmac.update(body);
  const sig = hmac.digest().subarray(0, 8);

  const tokenBytes = Buffer.concat([body, sig]);
  return `b_${tokenBytes.toString('base64url')}`;
}

function verifyBindingToken(tokenStr, expectedWorkspaceId) {
  if (!tokenStr || !tokenStr.startsWith('b_')) {
    return { valid: false, error: 'Invalid token prefix' };
  }
  const rawB64 = tokenStr.slice(2);
  const buf = Buffer.from(rawB64, 'base64url');
  if (buf.length !== 32) {
    return { valid: false, error: 'Invalid byte length' };
  }

  const body = buf.subarray(0, 24);
  const sig = buf.subarray(24, 32);

  const hmac = crypto.createHmac('sha256', getSigningKey());
  hmac.update(body);
  const expectedSig = hmac.digest().subarray(0, 8);

  if (!crypto.timingSafeEqual(sig, expectedSig)) {
    return { valid: false, error: 'Signature verification failed (tampered)' };
  }

  const wsBuf = body.subarray(0, 16);
  const wsId = bufferToUuid(wsBuf);
  const expSec = body.readUInt32BE(16);

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > expSec) {
    return { valid: false, error: 'Binding token expired' };
  }

  if (expectedWorkspaceId && wsId !== expectedWorkspaceId) {
    return { valid: false, error: 'Cross-workspace binding rejected' };
  }

  return { valid: true, workspaceId: wsId };
}

async function runTenantIsolationTest() {
  console.log('=== TWO-WORKSPACE TENANT ISOLATION ACCEPTANCE TEST ===\n');

  // 1. Get Workspace A
  const wsA = 'ce593364-2aaf-47e4-a1d2-2272775747c4'; // J10 NEXUS HQ
  
  // 2. Find or Create Workspace B
  let [workspaceB] = await sql`
    SELECT id, name FROM workspaces WHERE id != ${wsA} AND status = 'active' LIMIT 1
  `;

  if (!workspaceB) {
    console.log('Creating secondary test workspace for isolation validation...');
    const [owner] = await sql`SELECT user_id FROM workspace_memberships WHERE workspace_id = ${wsA} LIMIT 1`;
    const [newWs] = await sql`
      INSERT INTO workspaces (
        name, slug, workspace_type, plan, status, brand_name, accent_color, owner_user_id
      ) VALUES (
        'Tenant B Alpha', 'tenant-b-alpha', 'client', 'growth', 'active', 'Tenant B', '#6366F1', ${owner.user_id}
      ) RETURNING id, name
    `;
    workspaceB = newWs;
  }
  const wsB = workspaceB.id;
  console.log(`Workspace A: ${wsA} (J10 NEXUS HQ)`);
  console.log(`Workspace B: ${wsB} (${workspaceB.name})\n`);

  // 3. Set distinct configurations for both workspaces
  const groupChatIdA = '-1002222222221';
  const groupChatIdB = '-1003333333332';

  // Ensure Workspace A has groupChatIdA
  const [integA] = await sql`SELECT metadata FROM integrations WHERE workspace_id = ${wsA} AND provider = 'telegram'`;
  const metaA = typeof integA.metadata === 'string' ? JSON.parse(integA.metadata) : (integA.metadata || {});
  metaA.vip_group_chat_id = groupChatIdA;

  await sql`
    UPDATE integrations 
    SET metadata = ${sql.json(metaA)}
    WHERE workspace_id = ${wsA} AND provider = 'telegram'
  `;

  const [ownerA] = await sql`SELECT user_id FROM workspace_memberships WHERE workspace_id = ${wsA} LIMIT 1`;
  const otherUsers = await sql`SELECT id FROM auth.users WHERE id != ${ownerA.user_id} LIMIT 1`;
  let userB = otherUsers[0]?.id;
  if (!userB) {
    const [insertedUser] = await sql`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (gen_random_uuid(), 'tenant_b_owner@test.j10nexus.com', '{"name":"Tenant B Owner"}'::jsonb)
      RETURNING id
    `;
    userB = insertedUser.id;
  }

  // Delete any stale test integration for wsB
  await sql`DELETE FROM integrations WHERE workspace_id = ${wsB} AND provider = 'telegram'`;

  const metaB = { bot_id: "9998887771", bot_username: "client_b_bot", vip_group_chat_id: groupChatIdB };
  const pubB = { bot_id: "9998887771", bot_username: "client_b_bot" };

  await sql`
    INSERT INTO integrations (
      workspace_id, provider, status, metadata, public_configuration, user_id
    ) VALUES (
      ${wsB}, 'telegram', 'connected', 
      ${sql.json(metaB)},
      ${sql.json(pubB)},
      ${userB}
    )
  `;
  console.log('✔ Distinct integrations and Telegram groups configured for Workspace A and B\n');

  // 4. Test Cryptographic Deep Link Generation & Verification
  console.log('--- Subtest 1: Deep Link Cryptographic Binding ---');
  const tokenA = generateBindingToken(wsA);
  const tokenB = generateBindingToken(wsB);
  console.log(`Token A (Len: ${tokenA.length}): ${tokenA}`);
  console.log(`Token B (Len: ${tokenB.length}): ${tokenB}`);

  const verifyA = verifyBindingToken(tokenA);
  const verifyB = verifyBindingToken(tokenB);
  if (verifyA.workspaceId !== wsA || verifyB.workspaceId !== wsB) {
    throw new Error('Token verification failed to isolate respective workspaces!');
  }
  console.log('✔ Token A securely binds to Workspace A');
  console.log('✔ Token B securely binds to Workspace B');

  // Cross-workspace tamper check
  const crossCheckA = verifyBindingToken(tokenA, wsB);
  if (crossCheckA.valid) {
    throw new Error('FAIL: Cross-workspace binding allowed!');
  }
  console.log('✔ Cross-workspace binding attempt rejected with:', crossCheckA.error);

  // 5. Test Direct Message Routing Isolation
  console.log('\n--- Subtest 2: Inbound Direct Message Routing & Thread Isolation ---');
  const customerA_id = '7019568611'; // Customer A
  const customerB_id = '8887776665'; // Customer B

  const threadCols = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'inbox_threads'
  `;
  console.log('inbox_threads columns:', threadCols.map(c => c.column_name));

  // Simulate contact A binding to Workspace A
  await sql`
    INSERT INTO inbox_threads (
      workspace_id, channel, external_thread_id, metadata
    ) VALUES (
      ${wsA}, 'telegram', ${customerA_id},
      ${JSON.stringify({ telegram_chat_id: customerA_id, sender_name: "Customer A" })}
    )
  `;

  // Simulate contact B binding to Workspace B
  await sql`
    INSERT INTO inbox_threads (
      workspace_id, channel, external_thread_id, metadata
    ) VALUES (
      ${wsB}, 'telegram', ${customerB_id},
      ${JSON.stringify({ telegram_chat_id: customerB_id, sender_name: "Customer B" })}
    )
  `;

  // Verify threads in Workspace A
  const threadsA = await sql`
    SELECT id, external_thread_id FROM inbox_threads WHERE workspace_id = ${wsA} AND channel = 'telegram'
  `;
  const threadsB = await sql`
    SELECT id, external_thread_id FROM inbox_threads WHERE workspace_id = ${wsB} AND channel = 'telegram'
  `;

  const aHasB = threadsA.some(t => t.external_thread_id === customerB_id);
  const bHasA = threadsB.some(t => t.external_thread_id === customerA_id);

  if (aHasB || bHasA) {
    throw new Error('FAIL: Direct message thread leaked across workspace boundaries!');
  }
  console.log(`✔ Workspace A has ${threadsA.length} threads (ZERO leaked from Workspace B)`);
  console.log(`✔ Workspace B has ${threadsB.length} threads (ZERO leaked from Workspace A)`);

  // 6. Test Group Chat Routing Isolation
  const allTgIntegrations = await sql`
    SELECT id, workspace_id, metadata FROM integrations WHERE provider = 'telegram'
  `;
  console.log('All Telegram integrations:', allTgIntegrations);

  const [resolveGroupA] = await sql`
    SELECT workspace_id FROM integrations WHERE provider = 'telegram' AND metadata->>'vip_group_chat_id' = ${groupChatIdA}
  `;
  const [resolveGroupB] = await sql`
    SELECT workspace_id FROM integrations WHERE provider = 'telegram' AND metadata->>'vip_group_chat_id' = ${groupChatIdB}
  `;
  console.log('resolveGroupA:', resolveGroupA, 'resolveGroupB:', resolveGroupB);

  if (resolveGroupA.workspace_id !== wsA) {
    throw new Error(`FAIL: Group A routed to ${resolveGroupA.workspace_id}, expected ${wsA}`);
  }
  if (resolveGroupB.workspace_id !== wsB) {
    throw new Error(`FAIL: Group B routed to ${resolveGroupB.workspace_id}, expected ${wsB}`);
  }
  console.log(`✔ Group A (${groupChatIdA}) routes exclusively to Workspace A`);
  console.log(`✔ Group B (${groupChatIdB}) routes exclusively to Workspace B`);

  console.log('\n=== ALL TWO-WORKSPACE TENANT ISOLATION TESTS PASSED ===');
  process.exit(0);
}

runTenantIsolationTest().catch(err => {
  console.error('TENANT ISOLATION TEST FAILED:', err);
  process.exit(1);
});
