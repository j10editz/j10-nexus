import J10CommandCenter from "@/components/dashboard/J10CommandCenter";
import { getCurrentUser } from "@/lib/auth";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";

export default async function DashboardPage() {
  const [context, user] = await Promise.all([
    getActiveWorkspaceContext(),
    getCurrentUser(),
  ]);

  const rawMetadata = (user?.user_metadata || {}) as Record<string, any>;

  let displayName = "";
  if (context?.profile?.display_name && context.profile.display_name !== "Founder") {
    displayName = context.profile.display_name;
  } else if (rawMetadata.full_name) {
    displayName = String(rawMetadata.full_name);
  } else if (rawMetadata.name) {
    displayName = String(rawMetadata.name);
  } else if (user?.email) {
    displayName = user.email.split("@")[0];
  }

  const workspaceName =
    context?.workspace?.brand_name ||
    context?.workspace?.name ||
    "Active Workspace";

  return (
    <J10CommandCenter
      userName={displayName}
      initialWorkspaceName={workspaceName}
    />
  );
}
