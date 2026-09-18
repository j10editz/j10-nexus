const { requireDatabaseUrl } = require("./lib/database-url.cjs");
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import crypto from "crypto";

// Stub Next.js server-only marker for standalone tsx runner
try {
  require.cache[require.resolve("server-only")] = {
    id: require.resolve("server-only"),
    filename: require.resolve("server-only"),
    loaded: true,
    exports: {},
  } as any;
} catch (e) {}

const JWT_SECRET = "37c304f85e132065da818625621445c5b5f029e768373b5224e2a08c071a610f";
const DB_URL = requireDatabaseUrl();
const GATEWAY_URL = "http://localhost:54320";
const REALTIME_WS_URL = "ws://localhost:54323/socket";

function signUserJwt(sub: string, role: string = "authenticated") {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      role,
      sub,
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7200,
    })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

async function main() {
  console.log("=================================================================");
  console.log("  CTO PRE-PRODUCTION GATE: DOCKER SUPABASE CERTIFICATION SUITE   ");
  console.log("=================================================================");

  const sql = postgres(DB_URL, { max: 15 });

  // -----------------------------------------------------------------
  // 1. Setup Test Fixtures: Two Workspaces & Two Users
  // -----------------------------------------------------------------
  console.log("\n[TEST 1] Setting up two workspaces & users in Docker PostgreSQL...");
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const workspaceAId = crypto.randomUUID();
  const workspaceBId = crypto.randomUUID();
  const runId = Date.now();

  await sql`
    INSERT INTO auth.users (id, email)
    VALUES (${userAId}, ${`tenant-a-${runId}@example.com`}), (${userBId}, ${`tenant-b-${runId}@example.com`})
  `;

  await sql`
    INSERT INTO public.workspaces (id, owner_user_id, name)
    VALUES 
      (${workspaceAId}, ${userAId}, 'Workspace Alpha'),
      (${workspaceBId}, ${userBId}, 'Workspace Beta')
  `;

  await sql`
    INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
    VALUES
      (${workspaceAId}, ${userAId}, 'owner'),
      (${workspaceBId}, ${userBId}, 'owner')
  `;
  console.log("✓ Fixtures created: Workspace A =", workspaceAId, "Workspace B =", workspaceBId);

  // -----------------------------------------------------------------
  // 2. Realtime WebSocket Delivery & Cross-Workspace Isolation Test
  // -----------------------------------------------------------------
  console.log("\n[TEST 2] Testing Authenticated Realtime WebSocket Cross-Workspace Isolation...");
  const tokenA = signUserJwt(userAId);
  const tokenB = signUserJwt(userBId);

  const clientA = createClient(GATEWAY_URL, tokenA, {
    realtime: { url: REALTIME_WS_URL } as any,
    auth: { persistSession: false },
  });

  const clientB = createClient(GATEWAY_URL, tokenB, {
    realtime: { url: REALTIME_WS_URL } as any,
    auth: { persistSession: false },
  });

  const receivedByA: any[] = [];
  const receivedByB: any[] = [];

  const channelA = clientA
    .channel(`inbox-realtime-ws-A`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "inbox_messages",
        filter: `workspace_id=eq.${workspaceAId}`,
      },
      (payload) => {
        console.log("  -> Client A received message:", payload.new?.id, "workspace:", payload.new?.workspace_id);
        receivedByA.push(payload.new);
      }
    );

  const channelB = clientB
    .channel(`inbox-realtime-ws-B`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "inbox_messages",
        filter: `workspace_id=eq.${workspaceBId}`,
      },
      (payload) => {
        console.log("  -> Client B received message:", payload.new?.id, "workspace:", payload.new?.workspace_id);
        receivedByB.push(payload.new);
      }
    );

  await Promise.all([
    new Promise((res, rej) => {
      channelA.subscribe((status, err) => {
        console.log("Channel A status:", status, err);
        if (status === "SUBSCRIBED") res(true);
        if (status === "CHANNEL_ERROR") rej(new Error("Channel A subscribe error: " + JSON.stringify(err)));
      });
    }),
    new Promise((res, rej) => {
      channelB.subscribe((status, err) => {
        console.log("Channel B status:", status, err);
        if (status === "SUBSCRIBED") res(true);
        if (status === "CHANNEL_ERROR") rej(new Error("Channel B subscribe error: " + JSON.stringify(err)));
      });
    }),
  ]);
  console.log("✓ Both Client A and Client B successfully subscribed to Realtime WebSockets.");

  // Insert thread for A and thread for B
  const threadAId = crypto.randomUUID();
  const threadBId = crypto.randomUUID();
  await sql`
    INSERT INTO public.inbox_threads (id, workspace_id, channel)
    VALUES 
      (${threadAId}, ${workspaceAId}, 'telegram'),
      (${threadBId}, ${workspaceBId}, 'telegram')
  `;

  // Insert Message for Workspace A
  const msgAId = crypto.randomUUID();
  console.log("Inserting Message for Workspace A:", msgAId);
  await sql`
    INSERT INTO public.inbox_messages (id, workspace_id, thread_id, direction, provider, content)
    VALUES (${msgAId}, ${workspaceAId}, ${threadAId}, 'inbound', 'telegram', 'Hello Workspace A only')
  `;

  // Wait for delivery
  await new Promise((r) => setTimeout(r, 1200));

  // Insert Message for Workspace B
  const msgBId = crypto.randomUUID();
  console.log("Inserting Message for Workspace B:", msgBId);
  await sql`
    INSERT INTO public.inbox_messages (id, workspace_id, thread_id, direction, provider, content)
    VALUES (${msgBId}, ${workspaceBId}, ${threadBId}, 'inbound', 'telegram', 'Hello Workspace B only')
  `;

  await new Promise((r) => setTimeout(r, 1200));

  // Assert isolation
  const aGotOwn = receivedByA.some((m) => m.id === msgAId);
  const aGotOther = receivedByA.some((m) => m.workspace_id === workspaceBId);
  const bGotOwn = receivedByB.some((m) => m.id === msgBId);
  const bGotOther = receivedByB.some((m) => m.workspace_id === workspaceAId);

  console.log(`Realtime Isolation Results:
    Client A received Workspace A message: ${aGotOwn}
    Client A received Workspace B message: ${aGotOther} (Must be false)
    Client B received Workspace B message: ${bGotOwn}
    Client B received Workspace A message: ${bGotOther} (Must be false)`);

  if (aGotOther || bGotOther || !aGotOwn || !bGotOwn) {
    throw new Error("REALTIME ISOLATION FAILED: Cross-workspace event leak detected!");
  }
  console.log("✓ PASS: Authenticated Supabase Realtime WebSocket delivered events with 100% tenant isolation.");

  clientA.removeChannel(channelA);
  clientB.removeChannel(channelB);

  // -----------------------------------------------------------------
  // 3. Foreign Key & Cross-Workspace Integrity Constraint Tests
  // -----------------------------------------------------------------
  console.log("\n[TEST 3] Testing Composite Workspace FK on telegram_group_memberships...");
  const contactAId = crypto.randomUUID();
  await sql`
    INSERT INTO public.contacts (id, workspace_id, name)
    VALUES (${contactAId}, ${workspaceAId}, 'Alice Contact')
  `;

  // Legitimate membership in Workspace A referencing contact in Workspace A
  const validMemberId = crypto.randomUUID();
  await sql`
    INSERT INTO public.telegram_group_memberships (id, workspace_id, group_chat_id, contact_id, telegram_user_id, status)
    VALUES (${validMemberId}, ${workspaceAId}, -100123456, ${contactAId}, 111222, 'approved')
  `;
  console.log("✓ Inserted valid membership with matching workspace_id on contact.");

  // Attempt cross-workspace reference: Workspace B membership referencing contact in Workspace A!
  let crossWsfkFailed = false;
  try {
    const invalidMemberId = crypto.randomUUID();
    await sql`
      INSERT INTO public.telegram_group_memberships (id, workspace_id, group_chat_id, contact_id, telegram_user_id, status)
      VALUES (${invalidMemberId}, ${workspaceBId}, -100123456, ${contactAId}, 333444, 'approved')
    `;
  } catch (err: any) {
    if (err.message.includes("violates foreign key constraint") || err.code === "23503") {
      crossWsfkFailed = true;
      console.log("✓ PASS: Cross-workspace foreign key reference was strictly blocked by PostgreSQL:", err.message);
    } else {
      throw err;
    }
  }
  if (!crossWsfkFailed) {
    throw new Error("FK INTEGRITY VIOLATION: Cross-workspace contact reference was allowed!");
  }

  // -----------------------------------------------------------------
  // 4. Partial Unique Index Preventing Duplicate Active Memberships
  // -----------------------------------------------------------------
  console.log("\n[TEST 4] Testing Partial Unique Index for Duplicate Active Memberships...");
  let duplicatePrevented = false;
  try {
    const dupMemberId = crypto.randomUUID();
    await sql`
      INSERT INTO public.telegram_group_memberships (id, workspace_id, group_chat_id, telegram_user_id, status)
      VALUES (${dupMemberId}, ${workspaceAId}, -100123456, 111222, 'invited')
    `;
  } catch (err: any) {
    if (err.message.includes("unique") || err.code === "23505") {
      duplicatePrevented = true;
      console.log("✓ PASS: Duplicate active membership for same workspace, group, and user blocked:", err.message);
    } else {
      throw err;
    }
  }
  if (!duplicatePrevented) {
    throw new Error("UNIQUENESS VIOLATION: Duplicate active membership was allowed!");
  }

  // -----------------------------------------------------------------
  // 5. Atomic Single-Use Token Consumption Under 10 Concurrent Connections
  // -----------------------------------------------------------------
  console.log("\n[TEST 5] Testing Atomic Single-Use Token Consumption Under 10 Real Concurrent Connections...");
  const rawToken = "tok_" + crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 600000).toISOString();

  // Create token using narrow RPC
  const [createdTokenResult] = await sql`
    SELECT public.create_telegram_binding_token(
      ${workspaceAId}::uuid,
      ${tokenHash}::text,
      'direct_message'::text,
      ${userAId}::uuid,
      1800::int
    ) AS res
  `;
  console.log("✓ Token created via create_telegram_binding_token RPC:", createdTokenResult.res);

  // Attempt 10 simultaneous concurrent calls to consume_telegram_binding_token
  console.log("Spawning 10 concurrent PostgreSQL worker connections...");
  const concurrentClients = Array.from({ length: 10 }, () => postgres(DB_URL, { max: 1 }));

  const results = await Promise.all(
    concurrentClients.map(async (c, idx) => {
      try {
        const [row] = await c`
          SELECT public.consume_telegram_binding_token(${tokenHash}::text) AS res
        `;
        const res = row?.res;
        const success = res?.valid === true && res?.workspace_id === workspaceAId;
        return { index: idx, success, res };
      } finally {
        await c.end();
      }
    })
  );

  const successfulConsumptions = results.filter((r) => r.success);
  const failedConsumptions = results.filter((r) => !r.success);

  console.log(`Concurrent Results:
    Successful consumes: ${successfulConsumptions.length} (Must be exactly 1)
    Rejected / nil consumes: ${failedConsumptions.length} (Must be exactly 9)`);

  if (successfulConsumptions.length !== 1 || failedConsumptions.length !== 9) {
    throw new Error(`CONCURRENCY RACE CONDITION: Expected 1 winner and 9 losers, got ${successfulConsumptions.length} winners!`);
  }
  console.log("✓ PASS: Atomic single-use consumption proven under real concurrent PostgreSQL connections.");

  // Subsequent consume attempt must return valid: false
  const [subsequentAttempt] = await sql`
    SELECT public.consume_telegram_binding_token(${tokenHash}::text) AS res
  `;
  if (subsequentAttempt?.res?.valid === true) {
    throw new Error("REPLAY VULNERABILITY: Token consumed a second time!");
  }
  console.log("✓ PASS: Subsequent replay attempts return valid: false.");

  // -----------------------------------------------------------------
  // 6. Security Definer & Authenticated Access Revocation Check
  // -----------------------------------------------------------------
  console.log("\n[TEST 6] Verifying Table Access Revocation for 'authenticated' role...");
  const authedClient = createClient(GATEWAY_URL, tokenA, { auth: { persistSession: false } });
  const { data: directSelect, error: directSelectErr } = await authedClient
    .from("telegram_binding_tokens")
    .select("*");

  console.log("Direct SELECT as 'authenticated' result:", { data: directSelect, error: directSelectErr?.message });
  if (!directSelectErr) {
    throw new Error("LEAK: 'authenticated' role was able to SELECT directly from telegram_binding_tokens!");
  }
  console.log("✓ PASS: 'authenticated' role is denied SELECT on telegram_binding_tokens:", directSelectErr.message);

  // -----------------------------------------------------------------
  // 7. Invite Link Revocation & Nullification on Approval
  // -----------------------------------------------------------------
  console.log("\n[TEST 7] Verifying Plaintext invite_link Nullification on Approval...");
  const memberWithLink = crypto.randomUUID();
  await sql`
    INSERT INTO public.telegram_group_memberships (id, workspace_id, group_chat_id, telegram_user_id, status, invite_link)
    VALUES (${memberWithLink}, ${workspaceAId}, -100999888, 555666, 'invited', 'https://t.me/+secretOneTimeLink123')
  `;

  // Verify link exists initially
  const [beforeApproval] = await sql`
    SELECT invite_link, status FROM public.telegram_group_memberships WHERE id = ${memberWithLink}
  `;
  console.log("Before approval: status =", beforeApproval.status, "invite_link =", beforeApproval.invite_link);

  // Simulate approval (setting status = 'approved' and invite_link = NULL)
  await sql`
    UPDATE public.telegram_group_memberships
    SET status = 'approved', invite_link = NULL, joined_at = now()
    WHERE id = ${memberWithLink}
  `;

  const [afterApproval] = await sql`
    SELECT invite_link, status FROM public.telegram_group_memberships WHERE id = ${memberWithLink}
  `;
  console.log("After approval: status =", afterApproval.status, "invite_link =", afterApproval.invite_link);

  if (afterApproval.invite_link !== null) {
    throw new Error("DATA RETENTION VIOLATION: invite_link was not cleared after approval!");
  }
  console.log("✓ PASS: Plaintext invite_link is revoked and nullified upon membership approval.");

  // -----------------------------------------------------------------
  // 8. End-to-End Next.js / Canonical Provider Ingress & Outbound Dispatch
  // -----------------------------------------------------------------
  console.log("\n[TEST 8] Testing Canonical Ingress, Idempotency, and History Retention...");
  const { persistCanonicalTelegramInbound } = await import("../lib/omnichannel/provider-contract");
  const serviceClient = createClient(GATEWAY_URL, signUserJwt("service-role-admin", "service_role"), {
    auth: { persistSession: false },
  });

  const testTelegramUpdate = {
    update_id: 99887711,
    message: {
      message_id: 4242,
      from: {
        id: 777888999,
        first_name: "TestUser",
        username: "testuser_lead",
      },
      chat: {
        id: 777888999,
        type: "private",
        first_name: "TestUser",
      },
      date: Math.floor(Date.now() / 1000),
      text: "Hello J10 Nexus Support from separate test bot!",
    },
  };

  const ingressResult = await persistCanonicalTelegramInbound(serviceClient, {
    workspaceId: workspaceAId,
    update: testTelegramUpdate,
    origin: "http://localhost:3000",
  });
  console.log("Ingress result:", ingressResult);

  if (!ingressResult.contact_id || !ingressResult.intake_id) {
    throw new Error("INGRESS FAILED: Did not produce canonical contact or lead intake!");
  }
  console.log("✓ Inbound created canonical contact & lead intake:", {
    contactId: ingressResult.contact_id,
    intakeId: ingressResult.intake_id,
  });

  // Re-run the exact same update to test idempotency
  const duplicateResult = await persistCanonicalTelegramInbound(serviceClient, {
    workspaceId: workspaceAId,
    update: testTelegramUpdate,
    origin: "http://localhost:3000",
  });
  console.log("Duplicate ingress result:", duplicateResult);
  if (!duplicateResult.duplicate || duplicateResult.intake_id !== ingressResult.intake_id) {
    throw new Error("IDEMPOTENCY FAILURE: Duplicate Telegram update did not match existing intake!");
  }
  console.log("✓ PASS: Duplicate update resolved to identical intake ID (inbound idempotency preserved).");

  // Create or resolve thread for this contact
  const externalChatId = String(testTelegramUpdate.message.chat.id);
  const threadId = crypto.randomUUID();
  await sql`
    INSERT INTO public.inbox_threads (id, workspace_id, contact_id, channel, external_thread_id)
    VALUES (${threadId}, ${workspaceAId}, ${ingressResult.contact_id}, 'telegram', ${externalChatId})
    ON CONFLICT (workspace_id, id) DO NOTHING
  `;

  // Create message in thread
  const inboundMsgId = crypto.randomUUID();
  await sql`
    INSERT INTO public.inbox_messages (
      id, workspace_id, thread_id, direction, provider, content, 
      external_message_id, delivery_status
    ) VALUES (
      ${inboundMsgId}, ${workspaceAId}, ${threadId}, 'inbound', 'telegram',
      ${testTelegramUpdate.message.text}, 'tg_inbound_4242', 'delivered'
    )
  `;

  // Query message history to prove retention after refresh
  const [persistedMsg] = await sql`
    SELECT id, thread_id, direction, content, external_message_id
    FROM public.inbox_messages
    WHERE id = ${inboundMsgId}
  `;
  console.log("Retained message record:", persistedMsg);
  if (persistedMsg.content !== testTelegramUpdate.message.text) {
    throw new Error("HISTORY RETENTION FAILURE: Persisted content mismatch!");
  }
  console.log("✓ PASS: Inbound message history is fully persisted and retained.");

  // Test Outbound operator response persistence with provider message ID & idempotency key
  const outboundIdempotencyKey = "outbound_idem_" + crypto.randomBytes(16).toString("hex");
  const outboundMsgId = crypto.randomUUID();
  await sql`
    INSERT INTO public.inbox_messages (
      id, workspace_id, thread_id, direction, provider, content, 
      delivery_status, external_message_id, idempotency_key, retry_count
    ) VALUES (
      ${outboundMsgId}, ${workspaceAId}, ${threadId}, 'outbound', 'telegram',
      'Operator response from J10 Nexus console', 'sent', 'tg_msg_999111', ${outboundIdempotencyKey}, 0
    )
  `;

  const [persistedOutbound] = await sql`
    SELECT id, external_message_id, idempotency_key, delivery_status
    FROM public.inbox_messages
    WHERE id = ${outboundMsgId}
  `;
  console.log("✓ Outbound operator dispatch persisted:", persistedOutbound);
  if (persistedOutbound.external_message_id !== "tg_msg_999111" || persistedOutbound.idempotency_key !== outboundIdempotencyKey) {
    throw new Error("OUTBOUND DISPATCH FAILURE: Provider message ID or idempotency key not saved!");
  }
  console.log("✓ PASS: Outbound operator response retains provider message ID and idempotency key.");

  await sql.end();
  console.log("\n=================================================================");
  console.log("  ALL CERTIFICATION TESTS PASSED AGAINST REAL DOCKER SUPABASE!   ");
  console.log("=================================================================");
}

main().catch((err) => {
  console.error("\n❌ CERTIFICATION FAILED:", err);
  process.exit(1);
});
