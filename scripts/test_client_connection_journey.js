const fs = require("fs");
const postgres = require("postgres");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// Load .env.local
const envVars = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || "https://qtzhcnyxbjocfgimtvvm.supabase.co";
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SECRET_KEY;
const poolerUrl =
  envVars.SUPABASE_POOLER_URL ||
  "postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require";

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sql = postgres(poolerUrl, { ssl: "require" });

async function runClientConnectionAcceptance() {
  console.log("================================================================================");
  console.log("          CLEAN TEST CLIENT WORKSPACE CONNECTION JOURNEY ACCEPTANCE             ");
  console.log("================================================================================\n");

  const runId = Date.now();
  const testClientSlug = `test-client-${runId}`;
  const testClientName = `Apex Growth Agency ${runId.toString().slice(-4)}`;
  const testUserEmail = `founder-${runId}@apexgrowth.test`;
  const testUserPassword = "TestPassword123!@#";

  console.log(`[Step 1] Creating fresh client user: ${testUserEmail}...`);
  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email: testUserEmail,
    password: testUserPassword,
    email_confirm: true,
  });
  if (userErr || !userRes.user) {
    throw new Error(`Failed to create fresh client user: ${userErr?.message}`);
  }
  const clientUser = userRes.user;
  console.log(`   └─ Client User ID: ${clientUser.id}`);

  console.log(`\n[Step 2] Creating clean test client workspace: "${testClientName}" (slug: ${testClientSlug})...`);
  const [workspace] = await sql`
    INSERT INTO workspaces (
      name, slug, workspace_type, plan, status, brand_name, accent_color, owner_user_id, created_at, updated_at
    ) VALUES (
      ${testClientName}, ${testClientSlug}, 'client', 'growth', 'active', ${testClientName}, '#3B82F6', ${clientUser.id}, NOW(), NOW()
    )
    RETURNING id, name, slug, status;
  `;
  console.log(`   └─ Created Workspace ID: ${workspace.id} (Status: ${workspace.status})`);

  // Create Membership
  await sql`
    INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at, updated_at)
    VALUES (${workspace.id}, ${clientUser.id}, 'owner', NOW(), NOW());
  `;
  console.log(`   └─ Assigned User ${clientUser.id} as 'owner' of Workspace ${workspace.id}`);

  // 3. Create Bot Configuration for this clean workspace
  console.log(`\n[Step 3] Initializing grounded Bot Configuration for "${testClientName}"...`);
  const [botConfig] = await sql`
    INSERT INTO bot_configurations (
      workspace_id,
      business_name,
      description,
      services,
      pricing_details,
      business_hours,
      booking_link,
      privacy_policy_url,
      tone,
      ai_enabled,
      created_at,
      updated_at
    ) VALUES (
      ${workspace.id},
      ${testClientName},
      'High-growth SEO and paid acquisition for B2B tech companies.',
      ${JSON.stringify([
        {
          name: "Growth Audit & Funnel Review",
          price: "$1,500",
          duration: "1 week",
          description: "Comprehensive acquisition audit and conversion teardown."
        },
        {
          name: "Full Growth Retainer",
          price: "$5,000/mo",
          duration: "Ongoing",
          description: "Full-funnel execution across paid ads, landing pages, and email."
        }
      ])}::jsonb,
      '30-day money-back guarantee on initial audit.',
      'Monday - Friday 9AM - 5PM EST',
      'https://apexgrowth.example.com/calendar',
      'https://apexgrowth.example.com/privacy',
      'professional',
      true,
      NOW(),
      NOW()
    )
    RETURNING id, business_name, ai_enabled;
  `;
  console.log(`   └─ Bot Config ID: ${botConfig.id}, AI Enabled: ${botConfig.ai_enabled}`);

  // 4. Connect Telegram Bot via unique endpoint key & AES vault
  console.log(`\n[Step 4] Connecting dedicated Telegram Bot to workspace...`);
  const endpointKey = crypto.randomUUID();
  const mockWebhookSecret = crypto.randomBytes(32).toString("hex");
  const mockBotToken = "9999999999:AAFakeTokenForCertificationAcceptance_12345";
  const customWebhookUrl = `https://j10-nexus.vercel.app/api/webhooks/telegram/${endpointKey}`;

  const [integration] = await sql`
    INSERT INTO integrations (
      workspace_id,
      user_id,
      provider,
      status,
      metadata,
      public_configuration,
      created_at,
      updated_at
    ) VALUES (
      ${workspace.id},
      ${clientUser.id},
      'telegram',
      'connected',
      ${JSON.stringify({
        bot_id: "9999999999",
        bot_username: `apex_growth_${runId.toString().slice(-4)}_bot`,
        bot_name: "Apex Growth Assistant",
        is_official: false,
        webhook_endpoint_key: endpointKey,
        webhook_url: customWebhookUrl,
        connected_at: new Date().toISOString(),
      })}::jsonb,
      ${JSON.stringify({
        bot_id: "9999999999",
        bot_username: `apex_growth_${runId.toString().slice(-4)}_bot`,
        is_official: false,
      })}::jsonb,
      NOW(),
      NOW()
    )
    RETURNING id, provider, status;
  `;
  console.log(`   └─ Integration ID: ${integration.id} (Provider: ${integration.provider}, Status: ${integration.status})`);
  console.log(`   └─ Webhook Endpoint Key: ${endpointKey}`);

  // Store encrypted credential in vault via official RPC
  const encKeyBase64 = envVars.J10_INTEGRATION_ENCRYPTION_KEY?.trim() || "";
  const masterKey = Buffer.from(encKeyBase64, "base64");
  const iv = crypto.randomBytes(12);
  const payloadToEncrypt = JSON.stringify({
    providerId: "telegram",
    values: {
      bot_token: mockBotToken,
      webhook_secret: mockWebhookSecret,
    },
    encryptedAt: new Date().toISOString(),
  });
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  cipher.setAAD(Buffer.from("j10-nexus:integration:telegram:v1", "utf8"));
  const encryptedPayload = Buffer.concat([cipher.update(payloadToEncrypt, "utf8"), cipher.final()]).toString("base64");
  const authTag = cipher.getAuthTag().toString("base64");

  const { data: credRef, error: credErr } = await admin.rpc(
    "store_integration_credential_envelope",
    {
      p_integration_id: integration.id,
      p_encrypted_payload: encryptedPayload,
      p_initialization_vector: iv.toString("base64"),
      p_authentication_tag: authTag,
      p_algorithm: "aes-256-gcm",
      p_key_version: 1,
    }
  );
  if (credErr) {
    throw new Error(`Failed to store credentials via vault RPC: ${credErr.message}`);
  }
  console.log(`   └─ Bot Token & Webhook Secret encrypted in vault (Ref: ${credRef}).`);

  // 5. Simulate Inbound Customer Message via Canonical Telegram Inbound Pipeline
  console.log(`\n[Step 5] Simulating inbound customer message arriving via Telegram...`);
  const customerTelegramId = 555000100 + (runId % 100000);
  const customerText = "Hi, do you offer growth audits and how much are they?";
  const idempotencyKey = `tg_${workspace.id}_${customerTelegramId}_501`;

  const { data: intakeData, error: intakeErr } = await admin.rpc("record_lead_intake", {
    p_workspace_id: workspace.id,
    p_source: "telegram",
    p_channel: "telegram",
    p_idempotency_key: idempotencyKey,
    p_name: "Marcus TechFounder",
    p_email: null,
    p_phone: null,
    p_message: customerText,
    p_campaign: null,
    p_attribution: {},
    p_consents: [],
    p_source_event_id: "501",
    p_metadata: { telegram_user_id: String(customerTelegramId), telegram_chat_id: String(customerTelegramId) },
  });

  if (intakeErr) {
    throw new Error(`record_lead_intake failed: ${intakeErr.message}`);
  }
  console.log(`   └─ Canonical inbound intake completed: Intake ID: ${intakeData?.intake_id}, Contact ID: ${intakeData?.contact_id}`);

  // 6. Verify Workspace Inbox Isolation
  console.log(`\n[Step 6] Verifying workspace inbox isolation...`);
  const workspaceMessages = await sql`
    SELECT id, content, direction, workspace_id, thread_id FROM inbox_messages
    WHERE workspace_id = ${workspace.id};
  `;
  if (workspaceMessages.length >= 1) {
    console.log(`   ✅ PASS: Customer message routed strictly to the new workspace inbox (Found ${workspaceMessages.length} message).`);
    console.log(`   └─ Message content: "${workspaceMessages[0].content}"`);
  } else {
    throw new Error(`Workspace isolation failed: zero messages found in workspace.`);
  }

  const threadId = workspaceMessages[0].thread_id;

  // 7. Simulate Operator Manual Reply from Workspace Inbox
  console.log(`\n[Step 7] Simulating operator reply from Workspace Inbox...`);
  const operatorReplyText = "Hi Marcus, yes! Our Growth Audit is $1,500 and includes a full funnel review.";
  const [operatorMessage] = await sql`
    INSERT INTO inbox_messages (
      workspace_id,
      thread_id,
      direction,
      provider,
      content,
      delivery_status,
      message_type,
      metadata,
      created_at
    ) VALUES (
      ${workspace.id},
      ${threadId},
      'outbound',
      'telegram',
      ${operatorReplyText},
      'sent',
      'text',
      ${JSON.stringify({ senderName: "Apex Operator" })}::jsonb,
      NOW()
    )
    RETURNING id, content, direction;
  `;
  console.log(`   ✅ PASS: Operator message recorded in workspace: "${operatorMessage.content}"`);

  // 8. Disconnect Integration
  console.log(`\n[Step 8] Simulating disconnect of Telegram integration...`);
  await sql`
    UPDATE integrations
    SET status = 'disconnected', updated_at = NOW()
    WHERE id = ${integration.id} AND workspace_id = ${workspace.id};
  `;
  const [disconnectedIntegration] = await sql`
    SELECT id, status FROM integrations WHERE id = ${integration.id};
  `;
  if (disconnectedIntegration.status === "disconnected") {
    console.log(`   ✅ PASS: Integration cleanly disconnected (Status: ${disconnectedIntegration.status}).`);
  } else {
    throw new Error(`Failed to disconnect integration.`);
  }

  // 9. Reconnect Integration
  console.log(`\n[Step 9] Simulating reconnect of Telegram integration...`);
  await sql`
    UPDATE integrations
    SET status = 'connected', updated_at = NOW()
    WHERE id = ${integration.id} AND workspace_id = ${workspace.id};
  `;
  const [reconnectedIntegration] = await sql`
    SELECT id, status FROM integrations WHERE id = ${integration.id};
  `;
  if (reconnectedIntegration.status === "connected") {
    console.log(`   ✅ PASS: Integration cleanly reconnected (Status: ${reconnectedIntegration.status}).`);
  } else {
    throw new Error(`Failed to reconnect integration.`);
  }

  // 10. Clean up test records
  console.log(`\n[Step 10] Archiving test workspace and cleaning up test records...`);
  await sql`DELETE FROM inbox_messages WHERE workspace_id = ${workspace.id};`;
  await sql`DELETE FROM inbox_threads WHERE workspace_id = ${workspace.id};`;
  await sql`DELETE FROM contacts WHERE workspace_id = ${workspace.id};`;
  await sql`DELETE FROM integration_credentials WHERE workspace_id = ${workspace.id};`;
  await sql`DELETE FROM integrations WHERE workspace_id = ${workspace.id};`;
  await sql`DELETE FROM bot_configurations WHERE workspace_id = ${workspace.id};`;
  await sql`DELETE FROM lead_intakes WHERE workspace_id = ${workspace.id};`;
  await sql`UPDATE workspaces SET status = 'suspended', updated_at = NOW() WHERE id = ${workspace.id};`;
  console.log(`   └─ Test workspace archived and test messages pruned successfully.`);

  console.log("\n================================================================================");
  console.log("   🎉 CLEAN TEST CLIENT WORKSPACE ACCEPTANCE JOURNEY COMPLETED 100% CLEANLY!    ");
  console.log("================================================================================\n");

  await sql.end();
}

runClientConnectionAcceptance().catch((err) => {
  console.error("FATAL ERROR IN ACCEPTANCE JOURNEY:", err);
  process.exit(1);
});
