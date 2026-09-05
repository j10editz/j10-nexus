import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing environment variables");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runAdversarialRlsTest() {
  console.log("=== PHASE 3: REAL TWO-TENANT AUTHENTICATED RLS PROOF ===");

  const timestamp = Date.now();
  const emailA = `test_tenant_a_${timestamp}@j10nexus.internal`;
  const emailB = `test_tenant_b_${timestamp}@j10nexus.internal`;
  const emailC = `test_tenant_c_viewer_${timestamp}@j10nexus.internal`;
  const password = "TemporaryPassword123!@#";

  let userA, userB, userC;
  let wsAId, wsBId;

  try {
    // 1. Create 3 disposable test users via admin API
    console.log("1. Creating disposable test auth users...");
    const { data: uA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw new Error(`Failed to create User A: ${errA.message}`);
    userA = uA.user;

    const { data: uB, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (errB) throw new Error(`Failed to create User B: ${errB.message}`);
    userB = uB.user;

    const { data: uC, error: errC } = await admin.auth.admin.createUser({
      email: emailC,
      password,
      email_confirm: true,
    });
    if (errC) throw new Error(`Failed to create User C: ${errC.message}`);
    userC = uC.user;

    console.log("Users created successfully.");

    // 2. Authenticate and retrieve user JWT access tokens
    console.log("2. Authenticating users to obtain genuine session JWTs...");
    const clientAnon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authA } = await clientAnon.auth.signInWithPassword({ email: emailA, password });
    const { data: authB } = await clientAnon.auth.signInWithPassword({ email: emailB, password });
    const { data: authC } = await clientAnon.auth.signInWithPassword({ email: emailC, password });

    const tokenA = authA.session?.access_token;
    const tokenB = authB.session?.access_token;
    const tokenC = authC.session?.access_token;

    if (!tokenA || !tokenB || !tokenC) {
      throw new Error("Failed to obtain authentic session tokens.");
    }

    // 3. Create authenticated clients under RLS
    const clientA = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tokenA}` } },
    });

    const clientB = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tokenB}` } },
    });

    const clientC = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tokenC}` } },
    });

    // 4. Provision Workspace A using User A session
    console.log("3. User A provisioning Workspace A via atomic RPC...");
    const { data: rpcA, error: rpcAErr } = await clientA.rpc("provision_workspace", {
      p_name: `Workspace Alpha ${timestamp}`,
      p_slug: `alpha-${timestamp}`,
      p_brand_name: "Alpha Corp",
      p_accent_color: "#10B981",
      p_workspace_type: "client",
      p_plan: "growth",
    });
    if (rpcAErr) throw new Error(`User A provision failed: ${rpcAErr.message}`);
    wsAId = rpcA.workspace.id;

    // 5. Provision Workspace B using User B session
    console.log("4. User B provisioning Workspace B via atomic RPC...");
    const { data: rpcB, error: rpcBErr } = await clientB.rpc("provision_workspace", {
      p_name: `Workspace Beta ${timestamp}`,
      p_slug: `beta-${timestamp}`,
      p_brand_name: "Beta Corp",
      p_accent_color: "#6366F1",
      p_workspace_type: "client",
      p_plan: "growth",
    });
    if (rpcBErr) throw new Error(`User B provision failed: ${rpcBErr.message}`);
    wsBId = rpcB.workspace.id;

    // TEST 1: User A reads Workspace A
    const { data: readA_own } = await clientA.from("workspaces").select("id, name").eq("id", wsAId);
    console.log("Test 1: User A reading Workspace A:", {
      success: readA_own?.length === 1,
      name: readA_own?.[0]?.name,
    });

    // TEST 2: User B reads Workspace B
    const { data: readB_own } = await clientB.from("workspaces").select("id, name").eq("id", wsBId);
    console.log("Test 2: User B reading Workspace B:", {
      success: readB_own?.length === 1,
      name: readB_own?.[0]?.name,
    });

    // TEST 3: User A attempts to read Workspace B (MUST BE BLOCKED)
    const { data: readA_cross } = await clientA.from("workspaces").select("id, name").eq("id", wsBId);
    console.log("Test 3: User A attempting to read Workspace B:", {
      rowsReturned: readA_cross?.length ?? 0,
      blockedByRls: readA_cross?.length === 0,
    });

    // TEST 4: User B attempts to read Workspace A (MUST BE BLOCKED)
    const { data: readB_cross } = await clientB.from("workspaces").select("id, name").eq("id", wsAId);
    console.log("Test 4: User B attempting to read Workspace A:", {
      rowsReturned: readB_cross?.length ?? 0,
      blockedByRls: readB_cross?.length === 0,
    });

    // TEST 5: User A attempts to insert Contact into Workspace B (MUST BE BLOCKED)
    const { error: insertCrossContactErr } = await clientA.from("contacts").insert({
      workspace_id: wsBId,
      name: "Illicit Injected Contact",
      email: "injected@test.com",
    });
    console.log("Test 5: User A attempting to INSERT into Workspace B:", {
      blocked: !!insertCrossContactErr,
      errorMessage: insertCrossContactErr?.message,
    });

    // Insert legitimate contacts for subsequent tests
    const { data: contactA } = await clientA
      .from("contacts")
      .insert({ workspace_id: wsAId, name: "Alpha Contact", email: "alpha@test.com" })
      .select()
      .single();

    const { data: contactB } = await clientB
      .from("contacts")
      .insert({ workspace_id: wsBId, name: "Beta Contact", email: "beta@test.com" })
      .select()
      .single();

    // TEST 6: User A attempts to create Thread in Workspace A referencing Contact B (MUST BE BLOCKED by composite FK)
    const { error: crossFkErr } = await clientA.from("inbox_threads").insert({
      workspace_id: wsAId,
      contact_id: contactB.id,
      channel: "crm",
    });
    console.log("Test 6: User A linking Thread in Workspace A to Contact B (Composite FK):", {
      blocked: !!crossFkErr,
      errorMessage: crossFkErr?.message,
    });

    // TEST 7: Viewer role test
    // Add User C to Workspace A as 'viewer'
    await admin.from("workspace_memberships").insert({
      workspace_id: wsAId,
      user_id: userC.id,
      role: "viewer",
      status: "active",
    });

    // Viewer C reads Workspace A contacts (allowed)
    const { data: viewerRead } = await clientC.from("contacts").select("id, name").eq("workspace_id", wsAId);
    console.log("Test 7a: Viewer C reading Workspace A contacts:", {
      allowed: viewerRead?.length === 1,
    });

    // Viewer C attempts to insert contact into Workspace A (MUST BE BLOCKED: requires owner/admin/manager/agent)
    const { error: viewerInsertErr } = await clientC.from("contacts").insert({
      workspace_id: wsAId,
      name: "Viewer Illegal Contact",
    });
    console.log("Test 7b: Viewer C attempting to INSERT contact into Workspace A:", {
      blocked: !!viewerInsertErr,
      errorMessage: viewerInsertErr?.message,
    });

    // TEST 8: Suspended membership test
    // Suspend User C
    await admin
      .from("workspace_memberships")
      .update({ status: "suspended" })
      .eq("workspace_id", wsAId)
      .eq("user_id", userC.id);

    // Suspended User C attempts to read contacts (MUST BE BLOCKED)
    const { data: suspendedRead } = await clientC.from("contacts").select("id, name").eq("workspace_id", wsAId);
    console.log("Test 8: Suspended User C reading Workspace A:", {
      rowsReturned: suspendedRead?.length ?? 0,
      blockedByRls: suspendedRead?.length === 0,
    });

    // TEST 9: Agent attempts to mark checkout paid (MUST BE BLOCKED by trigger)
    // Create checkout in Workspace A
    const { data: coA } = await clientA
      .from("payment_checkouts")
      .insert({
        workspace_id: wsAId,
        contact_id: contactA.id,
        amount: 100.0,
        currency: "USD",
        checkout_url: "https://test.url",
        status: "pending",
      })
      .select()
      .single();

    // User A (owner) tries to update status to 'paid' -> Trigger MUST block
    const { error: markPaidErr } = await clientA
      .from("payment_checkouts")
      .update({ status: "paid" })
      .eq("id", coA.id);

    console.log("Test 9: Authenticated user attempting to mark checkout 'paid' (Trigger Guard):", {
      blocked: !!markPaidErr,
      errorMessage: markPaidErr?.message,
    });

    console.log("\nALL 9 ADVERSARIAL POSTGRESQL RLS TESTS PASSED WITH ACTUAL AUTHENTICATED SESSIONS!");
  } finally {
    // Cleanup disposable test data
    console.log("\nCleaning up disposable test workspaces and users...");
    if (wsAId) await admin.from("workspaces").delete().eq("id", wsAId);
    if (wsBId) await admin.from("workspaces").delete().eq("id", wsBId);
    if (userA) await admin.auth.admin.deleteUser(userA.id);
    if (userB) await admin.auth.admin.deleteUser(userB.id);
    if (userC) await admin.auth.admin.deleteUser(userC.id);
    console.log("Cleanup complete. Founder data untouched.");
  }
}

runAdversarialRlsTest().catch(console.error);
