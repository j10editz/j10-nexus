import RevenueCommandCenter from "@/components/dashboard/RevenueCommandCenter";
import { getCurrentUser } from "@/lib/auth";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";

export default async function DashboardPage() {
  const [context, user] = await Promise.all([
    getActiveWorkspaceContext(),
    getCurrentUser(),
  ]);

  const rawMetadata = (user?.user_metadata || {}) as Record<string, any>;

  // Resolution order:
  // 1. user profile display name
  // 2. authenticated user metadata full_name/name
  // 3. safe greeting without a name (or Demo Owner in demo mode)
  let displayName = "";
  if (context?.profile?.display_name && context.profile.display_name !== "Founder") {
    displayName = context.profile.display_name;
  } else if (rawMetadata.full_name) {
    displayName = String(rawMetadata.full_name);
  } else if (rawMetadata.name) {
    displayName = String(rawMetadata.name);
  } else if (!user) {
    displayName = "Demo Owner";
  }

  const workspaceName =
    context?.workspace?.name ||
    "Apex Commercial & Home Services";

  return (
    <RevenueCommandCenter
      userName={displayName}
      initialWorkspaceName={workspaceName}
    />
  );
}
