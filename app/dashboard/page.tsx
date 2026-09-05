import Overview from "@/components/dashboard/Overview";
import { requireWorkspaceContext } from "@/lib/workspaces/server";

export default async function DashboardPage() {
  const context = await requireWorkspaceContext();

  const displayName =
    context.profile?.display_name ||
    context.user?.email?.split("@")[0] ||
    "Member";

  return <Overview userName={displayName} />;
}
