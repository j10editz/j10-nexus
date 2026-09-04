import Overview from "@/components/dashboard/Overview";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "CEO & Founder";

  return <Overview userName={displayName} />;
}
