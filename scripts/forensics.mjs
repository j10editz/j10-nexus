import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing environment variables");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function forensics() {
  const { data: { users }, error: uErr } = await admin.auth.admin.listUsers();
  if (uErr) {
    console.error("Users error:", uErr);
    return;
  }
  console.log("=== AUTH.USERS FORENSICS ===");
  console.log("Total auth.users count:", users.length);
  users.forEach((u, i) => {
    console.log("User " + (i + 1) + ":", JSON.stringify({
      maskedId: u.id.slice(0, 8) + "...",
      email: u.email,
      confirmed: !!u.email_confirmed_at,
      created_at: u.created_at,
      app_metadata: u.app_metadata,
      user_metadata: u.user_metadata,
      identities: u.identities?.map((id) => ({
        provider: id.provider,
        identity_id: id.identity_id ? id.identity_id.slice(0, 8) + "..." : null,
        created_at: id.created_at,
      })),
    }, null, 2));
  });

  const { data: workspaces } = await admin.from("workspaces").select("id, name, slug, workspace_type, owner_user_id");
  console.log("\n=== WORKSPACES ===");
  workspaces?.forEach((w) => {
    console.log(JSON.stringify({
      id: w.id.slice(0, 8) + "...",
      name: w.name,
      slug: w.slug,
      workspace_type: w.workspace_type,
      owner_user_id: w.owner_user_id.slice(0, 8) + "...",
    }));
  });

  const { data: memberships } = await admin.from("workspace_memberships").select("id, workspace_id, user_id, role, status");
  console.log("\n=== WORKSPACE MEMBERSHIPS ===");
  memberships?.forEach((m) => {
    console.log(JSON.stringify({
      id: m.id.slice(0, 8) + "...",
      workspace_id: m.workspace_id.slice(0, 8) + "...",
      user_id: m.user_id.slice(0, 8) + "...",
      role: m.role,
      status: m.status,
    }));
  });

  const { data: platformRoles } = await admin.from("platform_roles").select("*");
  console.log("\n=== PLATFORM ROLES ===");
  platformRoles?.forEach((pr) => {
    console.log(JSON.stringify({
      user_id: pr.user_id.slice(0, 8) + "...",
      role: pr.role,
      granted_at: pr.granted_at,
      revoked_at: pr.revoked_at,
    }));
  });

  const { data: profiles } = await admin.from("profiles").select("*");
  console.log("\n=== PROFILES ===");
  profiles?.forEach((p) => {
    console.log(JSON.stringify({
      user_id: p.user_id.slice(0, 8) + "...",
      display_name: p.display_name,
      job_title: p.job_title,
      status: p.status,
    }));
  });
}

forensics().catch(console.error);
