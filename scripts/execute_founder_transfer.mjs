import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing environment variables");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const SOURCE_USER_ID = "0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa";
const DEST_USER_ID = "f44f4cc4-30bc-4d78-98e3-0b63ff63e08f";
const WORKSPACE_ID = "ce593364-2aaf-47e4-a1d2-2272775747c4";

async function executeTransfer() {
  console.log("=== ATOMIC FOUNDER OWNERSHIP & PLATFORM ROLE TRANSFER ===");

  // 1. Validation
  console.log("1. Validating source and destination accounts in auth.users...");
  const { data: { user: srcUser }, error: srcErr } = await admin.auth.admin.getUserById(SOURCE_USER_ID);
  if (srcErr || !srcUser) throw new Error(`Source user not found: ${srcErr?.message}`);
  console.log(`- Source user verified: [${srcUser.id.slice(0, 8)}...] (${srcUser.email})`);

  const { data: { user: dstUser }, error: dstErr } = await admin.auth.admin.getUserById(DEST_USER_ID);
  if (dstErr || !dstUser) throw new Error(`Destination user not found: ${dstErr?.message}`);
  console.log(`- Destination user verified: [${dstUser.id.slice(0, 8)}...] (${dstUser.email})`);

  // 2. Validate workspace
  const { data: ws, error: wsErr } = await admin.from("workspaces").select("*").eq("id", WORKSPACE_ID).single();
  if (wsErr || !ws) throw new Error(`Workspace not found: ${wsErr?.message}`);
  if (ws.owner_user_id !== SOURCE_USER_ID) {
    throw new Error(`Workspace owner mismatch. Current owner: ${ws.owner_user_id}`);
  }
  console.log(`- J10 NEXUS HQ verified: current owner [${ws.owner_user_id.slice(0, 8)}...]`);

  // 3. Grant owner membership in J10 NEXUS HQ to destination user
  console.log("2. Adding owner membership for destination user in J10 NEXUS HQ...");
  const { data: newMem, error: memErr } = await admin
    .from("workspace_memberships")
    .upsert({
      workspace_id: WORKSPACE_ID,
      user_id: DEST_USER_ID,
      role: "owner",
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,user_id" })
    .select("*")
    .single();

  if (memErr) throw new Error(`Failed to create destination membership: ${memErr.message}`);
  console.log(`- Destination membership active: role "${newMem.role}" [ID prefix: ${newMem.id.slice(0, 8)}...]`);

  // 4. Transfer workspace owner_user_id to destination user
  console.log("3. Transferring workspaces.owner_user_id to destination user...");
  const { error: wsUpdateErr } = await admin
    .from("workspaces")
    .update({ owner_user_id: DEST_USER_ID, updated_at: new Date().toISOString() })
    .eq("id", WORKSPACE_ID);

  if (wsUpdateErr) throw new Error(`Failed to update workspace owner: ${wsUpdateErr.message}`);
  console.log(`- Workspace owner_user_id updated to [${DEST_USER_ID.slice(0, 8)}...]`);

  // 5. Grant platform_founder to destination user
  console.log("4. Granting platform_founder to destination user...");
  const { error: roleErr } = await admin
    .from("platform_roles")
    .upsert({
      user_id: DEST_USER_ID,
      role: "platform_founder",
      granted_at: new Date().toISOString(),
      revoked_at: null,
    }, { onConflict: "user_id" });

  if (roleErr) throw new Error(`Failed to grant platform_founder: ${roleErr.message}`);
  console.log(`- Destination user granted platform_founder role.`);

  // 6. Update destination profile
  console.log("5. Ensuring destination profile has CEO job title...");
  const { error: profErr } = await admin
    .from("profiles")
    .upsert({
      user_id: DEST_USER_ID,
      display_name: "J10 THE BOSS",
      job_title: "CEO",
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (profErr) throw new Error(`Failed to update destination profile: ${profErr.message}`);
  console.log(`- Destination profile updated with job_title 'CEO'.`);

  // 7. Retain source as platform_admin for recovery
  console.log("6. Retaining source account as platform_admin for backup/recovery...");
  await admin
    .from("platform_roles")
    .update({ role: "platform_admin" })
    .eq("user_id", SOURCE_USER_ID);
  console.log(`- Source user updated to platform_admin.`);

  // 8. Final Verification
  console.log("\n=== POST-TRANSFER VERIFICATION ===");
  const { data: checkWs } = await admin.from("workspaces").select("*").eq("id", WORKSPACE_ID).single();
  const { data: checkMems } = await admin.from("workspace_memberships").select("*").eq("workspace_id", WORKSPACE_ID);
  const { data: checkRoles } = await admin.from("platform_roles").select("*").in("user_id", [SOURCE_USER_ID, DEST_USER_ID]);
  const { count: contactsCount } = await admin.from("contacts").select("*", { count: "exact", head: true }).eq("workspace_id", WORKSPACE_ID);

  console.log({
    workspace_name: checkWs?.name,
    new_owner_user_id: checkWs?.owner_user_id ? checkWs.owner_user_id.slice(0, 8) + "..." : null,
    owner_is_destination: checkWs?.owner_user_id === DEST_USER_ID,
    active_memberships_count: checkMems?.length,
    contacts_preserved_count: contactsCount,
    roles: checkRoles?.map(r => ({ user: r.user_id.slice(0, 8) + "...", role: r.role }))
  });

  console.log("\nTRANSFER COMPLETED SUCCESSFULLY.");
}

executeTransfer().catch(err => {
  console.error("Transfer failed:", err);
  process.exit(1);
});
