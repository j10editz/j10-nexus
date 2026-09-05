import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE environment variables");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== REMOTE SUPABASE SCHEMA & DATA VERIFICATION ===");

  const canonicalTables = [
    "workspaces",
    "workspace_memberships",
    "contacts",
    "inbox_threads",
    "inbox_messages",
    "payment_checkouts",
    "payment_ledger",
    "webhook_events",
  ];

  const results = {};
  for (const table of canonicalTables) {
    const { data, count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      results[table] = { status: "FAILED", error: error.message, code: error.code };
    } else {
      results[table] = { status: "VERIFIED LIVE", count };
    }
  }

  console.log("\n1. CANONICAL TABLES POSTGREST RECOGNITION:");
  console.table(results);

  // 2. Founder Workspace Verification
  const { data: workspaces, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, slug, workspace_type, plan, status, brand_name, accent_color, created_at");

  console.log("\n2. WORKSPACES:");
  if (wsErr) {
    console.error("Error fetching workspaces:", wsErr.message);
  } else {
    console.log(`Found ${workspaces.length} workspace(s):`);
    for (const ws of workspaces) {
      console.log(`- ID: [REDACTED_UUID_${ws.id.slice(0, 8)}]`);
      console.log(`  Name: ${ws.name}`);
      console.log(`  Slug: ${ws.slug}`);
      console.log(`  Type: ${ws.workspace_type}`);
      console.log(`  Plan: ${ws.plan}`);
      console.log(`  Status: ${ws.status}`);
      console.log(`  Brand: ${ws.brand_name}`);
      console.log(`  Accent: ${ws.accent_color}`);
    }
  }

  const founderWorkspace = workspaces?.find((w) => w.name === "J10 NEXUS HQ");
  const founderWsId = founderWorkspace?.id;

  // 3. Workspace Memberships
  const { data: memberships, error: memErr } = await supabase
    .from("workspace_memberships")
    .select("id, workspace_id, user_id, role, status");

  console.log("\n3. MEMBERSHIPS:");
  if (memErr) {
    console.error("Error fetching memberships:", memErr.message);
  } else {
    console.log(`Found ${memberships.length} membership(s):`);
    for (const m of memberships) {
      console.log(`- Role: ${m.role}, Status: ${m.status}, Workspace: [REDACTED_UUID_${m.workspace_id.slice(0, 8)}]`);
    }
  }

  // 4. Contacts Backfill Verification
  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select("id, workspace_id, name, email, phone, company, source, deal_stage, estimated_value, created_at");

  console.log("\n4. CANONICAL CONTACTS (BACKFILLED):");
  if (cErr) {
    console.error("Error fetching contacts:", cErr.message);
  } else {
    console.log(`Total canonical contacts: ${contacts.length}`);
    const allMatchFounderWs = contacts.every((c) => c.workspace_id === founderWsId);
    console.log(`All contacts correctly assigned to J10 NEXUS HQ: ${allMatchFounderWs}`);
    console.table(
      contacts.map((c) => ({
        id_prefix: c.id.slice(0, 8) + "...",
        name: c.name,
        company: c.company,
        stage: c.deal_stage,
        value: c.estimated_value,
        workspace_matched: c.workspace_id === founderWsId,
      }))
    );
  }

  // 5. Check legacy crm_contacts
  const { data: crmContacts, error: crmErr } = await supabase
    .from("crm_contacts")
    .select("id, workspace_id, first_name, last_name, email, company");

  console.log("\n5. LEGACY CRM CONTACTS TABLE:");
  if (crmErr) {
    console.error("Error fetching crm_contacts:", crmErr.message);
  } else {
    console.log(`Total legacy crm_contacts: ${crmContacts.length}`);
    const allLegacyLinked = crmContacts.every((c) => c.workspace_id === founderWsId);
    console.log(`All legacy crm_contacts updated with workspace_id: ${allLegacyLinked}`);
  }

  // 6. Test RLS & Mutation protection via triggers
  console.log("\n6. TESTING RLS ENFORCEMENT & IMMUTABILITY GUARDS:");

  // Test 6a: Anon client RLS isolation
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: anonWorkspaces } = await anonClient.from("workspaces").select("id, name");
  console.log("6a. Anon client reading workspaces (RLS active):", {
    rowsReturned: anonWorkspaces?.length ?? 0,
    blockedByRls: anonWorkspaces?.length === 0,
  });

  const { data: anonContacts } = await anonClient.from("contacts").select("id, name");
  console.log("6b. Anon client reading contacts (RLS active):", {
    rowsReturned: anonContacts?.length ?? 0,
    blockedByRls: anonContacts?.length === 0,
  });

  // Test 6c: Ledger immutability trigger
  const testContactId = contacts[0]?.id;
  const { data: testCheckout, error: coErr } = await supabase
    .from("payment_checkouts")
    .insert({
      workspace_id: founderWsId,
      contact_id: testContactId,
      amount: 499.0,
      currency: "USD",
      checkout_url: "https://checkout.stripe.com/test_verify",
      status: "pending",
      metadata: { test_source: "tier0c_verification" },
    })
    .select()
    .single();

  if (coErr) {
    console.error("6c. Failed to insert test checkout:", coErr.message);
  } else {
    console.log("6c. Inserted test checkout:", {
      id_prefix: testCheckout.id.slice(0, 8),
      status: testCheckout.status,
    });

    // Insert ledger entry
    const { data: testLedger, error: ledErr } = await supabase
      .from("payment_ledger")
      .insert({
        workspace_id: founderWsId,
        checkout_id: testCheckout.id,
        provider: "stripe",
        provider_event_id: "evt_tier0c_verify_" + Date.now(),
        event_type: "checkout.session.completed",
        amount: 499.0,
        currency: "USD",
        status: "succeeded",
        metadata: { verification: true },
      })
      .select()
      .single();

    if (ledErr) {
      console.error("6d. Failed to insert test ledger entry:", ledErr.message);
    } else {
      console.log("6d. Inserted test ledger entry:", {
        id_prefix: testLedger.id.slice(0, 8),
        status: testLedger.status,
      });

      // Attempt to UPDATE the immutable ledger entry - MUST FAIL with immutability trigger error
      const { error: updateLedgerErr } = await supabase
        .from("payment_ledger")
        .update({ amount: 999.0 })
        .eq("id", testLedger.id);

      console.log("6e. Ledger UPDATE attempt (Immutability Trigger):", {
        blocked: !!updateLedgerErr,
        errorMessage: updateLedgerErr?.message,
        triggerEnforced: updateLedgerErr?.message?.includes("immutable audit log") ?? false,
      });

      // Attempt to DELETE the immutable ledger entry - MUST FAIL with immutability trigger error
      const { error: deleteLedgerErr } = await supabase
        .from("payment_ledger")
        .delete()
        .eq("id", testLedger.id);

      console.log("6f. Ledger DELETE attempt (Immutability Trigger):", {
        blocked: !!deleteLedgerErr,
        errorMessage: deleteLedgerErr?.message,
        triggerEnforced: deleteLedgerErr?.message?.includes("immutable audit log") ?? false,
      });
    }

    // Clean up test checkout
    await supabase.from("payment_checkouts").delete().eq("id", testCheckout.id);
  }

  console.log("\n=== REMOTE VERIFICATION COMPLETE ===");
}

main().catch(console.error);
